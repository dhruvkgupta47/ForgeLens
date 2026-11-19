const vscode=require('vscode');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {exec}=require('node:child_process');
const {hunks,materialize,safePath,selectContext,editorToolCall,proposalText}=require('./core');
const {ForgeClient}=require('./client');
const {agentSpec}=require('./agent');
const {withMinuteLimitRetry}=require('./rate-limit');
const {startBridge}=require('./bridge');
const {validateCommand}=require('./command-policy');
let panel,root,client,bridge,active,lastSessionBase,contextReport,proposals=[],history=[],reviewWaiters=new Set(),decisionQueue=Promise.resolve();
const virtual=new Map();
let applyingEdits=0;
const config=()=>vscode.workspace.getConfiguration('forgelens');
const output=vscode.window.createOutputChannel('ForgeLens');
const viewState={status:'Ready',transcript:'',tools:''};
function send(type,data){
  if(type==='status')viewState.status=data;
  if(type==='token')viewState.transcript=(viewState.transcript+data).slice(-100000);
  if(type==='tool')viewState.tools=(viewState.tools+(typeof data==='string'?data:JSON.stringify(data))+'\n').slice(-200000);
  if(type==='reset'){viewState.transcript='';viewState.tools='';contextReport=undefined;}
  if(panel)void panel.webview.postMessage({type,data});
}
function restorePanel(){
  if(!panel)return;
  const post=(type,data)=>void panel.webview.postMessage({type,data});
  post('reset',null);post('status',viewState.status);
  if(contextReport)post('context',contextReport);
  post('token',viewState.transcript);post('tool',viewState.tools);render();
}
function status(message){output.appendLine(message);send('status',message);}
function assertActive(run=active){if(!run||run!==active||run.controller.signal.aborted)throw Error('Run is not active');}
function proposalKey(args){return createHash('sha256').update(JSON.stringify([args.path,args.content,args.oldText,args.newText,!!args.selectionOnly])).digest('hex');}
function proposalResult(args){assertActive();const key=proposalKey(args);const result=active.reviewResults?.get(key);if(!result)throw Error('No completed human review exists for this proposal');active.reviewResults.delete(key);return {reviewed:true,...result};}
function show(){if(panel){panel.reveal();return;}panel=vscode.window.createWebviewPanel('forgelens','ForgeLens',vscode.ViewColumn.Beside,{enableScripts:true,retainContextWhenHidden:true});panel.onDidDispose(()=>{panel=undefined;void cancel();});panel.webview.onDidReceiveMessage(async m=>{try{
  if(m.type==='ready')restorePanel();
  if(m.type==='run')await run(String(m.text||''));
  if(m.type==='cancel')await cancel();
  if(m.type==='preview')await preview(m.id);
  if(m.type==='decision'){decisionQueue=decisionQueue.catch(()=>{}).then(()=>decide(m.id,m.index,m.accept));await decisionQueue;}
  if(m.type==='undo')await undo();
  if(m.type==='session'&&(lastSessionBase||client))await vscode.env.openExternal(vscode.Uri.parse(lastSessionBase||client.base));
}catch(e){status(e.message);}});panel.webview.html=require('./ui').html();}
async function document(relative){const full=await safePath(root,relative);return vscode.workspace.openTextDocument(vscode.Uri.file(full));}
async function read({path:relative,startLine=1,endLine=startLine+159}){const run=active;assertActive(run);if(!Number.isInteger(startLine)||!Number.isInteger(endLine)||startLine<1||endLine<startLine)throw Error('Use one-based line numbers with endLine >= startLine');const doc=await document(relative);assertActive(run);if(startLine>doc.lineCount)return {path:relative,startLine,endLine:doc.lineCount,totalLines:doc.lineCount,nextStartLine:null,textTruncated:false,text:''};const end=Math.min(doc.lineCount,endLine,startLine+239);const rangeText=doc.getText(new vscode.Range(startLine-1,0,end,0));const text=rangeText.slice(0,24000);return {path:relative,startLine,endLine:end,totalLines:doc.lineCount,nextStartLine:rangeText.length>24000?startLine:end<doc.lineCount?end+1:null,textTruncated:rangeText.length>24000,...(rangeText.length>24000?{note:'Character limit reached. Reread this range with a smaller endLine before advancing.'}:{}),text};}
const exclude='**/{.git,node_modules,.venv,venv,dist,build,__pycache__}/**';
async function files(){return vscode.workspace.findFiles('**/*.{py,ts,tsx,js,jsx,json,md,rst,toml,yaml,yml}',exclude,4000);}
async function search({query}){const run=active;assertActive(run);const matches=[];for(const uri of await files()){assertActive(run);const relative=path.relative(root,uri.fsPath);try{await safePath(root,relative);const stat=await fs.stat(uri.fsPath);if(stat.size>300000)continue;const text=(await vscode.workspace.openTextDocument(uri)).getText();for(const [i,line]of text.split('\n').entries())if(line.toLowerCase().includes(query.toLowerCase())){matches.push({path:relative,line:i+1,text:line.slice(0,300)});if(matches.length>=60)return matches;}}catch{} }return matches;}
async function assemble({query}){const run=active;assertActive(run);const candidates=[];const terms=[...new Set(query.toLowerCase().match(/[a-z_][a-z_0-9]{2,}/g)||[])].filter(t=>!['the','and','that','with','this','from','must','file','code','add','new'].includes(t));
  const mentions=[...query.matchAll(/@file\s+([^\s]+)/g)].map(m=>m[1]);
  const symbols=[...query.matchAll(/@symbol\s+([\w.]+)/g)].map(m=>m[1].split('.').pop());
  for(const uri of await files()){assertActive(run);try{const relative=path.relative(root,uri.fsPath);await safePath(root,relative);if((await fs.stat(uri.fsPath)).size>300000)continue;const text=(await vscode.workspace.openTextDocument(uri)).getText();const lines=text.split('\n');let best=-1,score=0;const explicit=mentions.some(m=>relative.replace(/\\/g,'/')===m.replace(/\\/g,'/'));for(let i=0;i<lines.length;i++){const line=lines[i].toLowerCase();const s=terms.reduce((n,t)=>n+(line.includes(t)?1:0),0)+symbols.reduce((n,t)=>n+(lines[i].includes(t)?15:0),0);if(s>score){score=s;best=i;}}score+=terms.filter(t=>relative.toLowerCase().includes(t)).length*3;if(explicit)score+=100;if(score<2)continue;const start=explicit?0:Math.max(0,best-15),end=Math.min(lines.length,start+100);candidates.push({path:relative,startLine:start+1,endLine:end,text:lines.slice(start,end).join('\n'),score,reason:explicit?'Explicit @file mention':symbols.some(s=>text.includes(s))?'Symbol match':'Query terms in path or code; inspect related callers, tests and docs'});}catch{}}
  assertActive(run);contextReport=selectContext(candidates,config().get('contextBudget'));send('context',contextReport);return contextReport;
}
async function buildProposal(args){const run=active;assertActive(run);const full=await safePath(root,args.path);let before='',exists=true;try{before=(await vscode.workspace.openTextDocument(vscode.Uri.file(full))).getText();}catch(e){try{await fs.stat(full);throw e;}catch(statError){if(statError.code!=='ENOENT')throw statError;exists=false;}}
  assertActive(run);const after=proposalText(before,args,run.inlineScope);
  return {id:randomUUID(),runId:run.id,path:args.path,before,current:before,exists,key:createHash('sha256').update(JSON.stringify([full,after])).digest('hex'),hunks:hunks(before,after)};
}
function render(){send('proposals',proposals.map(p=>({...p,before:undefined,current:undefined})));}
async function preview(id){const p=proposals.find(p=>p.id===id);if(!p)return;const a=vscode.Uri.parse(`forgelens:/original/${id}`),b=vscode.Uri.parse(`forgelens:/proposed/${id}`);virtual.set(a.toString(),p.before);virtual.set(b.toString(),materialize(p.before,p.hunks.map(h=>({...h,status:h.status==='rejected'?'rejected':'accepted'}))));await vscode.commands.executeCommand('vscode.diff',a,b,`${p.path} — proposed`);}
async function decide(id,index,accept){const run=active;assertActive(run);const p=proposals.find(p=>p.id===id);if(!p||p.runId!==run.id||!p.hunks[index]||p.hunks[index].status!=='pending'||p.applying)return;
  if(accept&&p.current!==materialize(p.before,p.hunks))throw Error('Formatting changed this file after an earlier hunk. Reject remaining hunks and request a fresh proposal.');
  const h=p.hunks[index];const nextStatus=accept?'accepted':'rejected';const next=materialize(p.before,p.hunks.map(change=>change===h?{...change,status:nextStatus}:change));
  if(accept){applyingEdits++;p.applying=true;}
  try{if(accept){const full=await safePath(root,p.path),uri=vscode.Uri.file(full);let doc;try{doc=await vscode.workspace.openTextDocument(uri);}catch{}
    assertActive(run);if((doc?.getText()||'')!==p.current)throw Error('File changed since preview. Cancel and request a fresh proposal.');
    const edit=new vscode.WorkspaceEdit();if(!p.exists&&!doc)edit.createFile(uri,{overwrite:false});if(doc)edit.replace(uri,new vscode.Range(doc.positionAt(0),doc.positionAt(doc.getText().length)),next);else edit.insert(uri,new vscode.Position(0,0),next);
    if(!await vscode.workspace.applyEdit(edit))throw Error('VS Code rejected edit');
    const updated=await vscode.workspace.openTextDocument(uri);
    const entry={path:p.path,before:p.current,after:updated.getText(),created:!p.exists&&!doc};
    history.push(entry);p.current=entry.after;p.exists=true;
    // VS Code normalizes inserted newlines, and save participants can format the document.
    // Undo must compare against the actual resulting document, not the model's input string.
    try{if(!await updated.save())status('Hunk applied but file was not saved. Save it in the editor.');}
    catch(e){status(`Hunk applied but save failed: ${e.message}`);}
    finally{entry.after=updated.getText();p.current=entry.after;}}
    h.status=nextStatus;
  }catch(e){h.status=active===run&&!run.controller.signal.aborted?'pending':'discarded';throw e;}
  finally{if(accept){applyingEdits--;p.applying=false;}if(active!==run)proposals=proposals.filter(item=>item.applying||item.hunks.some(change=>change.status==='accepted'));render();for(const resolve of reviewWaiters)resolve();}
}
async function undo(){if(applyingEdits)throw Error('An approved edit is still finishing. Wait before undo.');const item=history.at(-1);if(!item)return;const doc=await document(item.path);if(doc.getText()!==item.after)throw Error('Undo refused: file changed after application. Use editor undo.');const edit=new vscode.WorkspaceEdit();if(item.created)edit.deleteFile(doc.uri);else edit.replace(doc.uri,new vscode.Range(doc.positionAt(0),doc.positionAt(item.after.length)),item.before);if(!await vscode.workspace.applyEdit(edit))throw Error('Undo failed');history.pop();if(!item.created)await doc.save();status('Applied change undone. Cancel and rerun before further review.');await cancel();}
async function review(p){const run=active;assertActive(run);run.reviewedProposals||=new Map();if(run.reviewedProposals.has(p.key)){const prior=run.reviewedProposals.get(p.key);throw Error(`This identical proposal was already reviewed (${prior.accepted} accepted, ${prior.rejected} rejected). Respect that decision and do not resubmit it. Propose a different correction or finish with the limitation.`);}proposals.push(p);render();if(p.hunks.length)await preview(p.id);while(p.hunks.some(h=>h.status==='pending')){assertActive(run);await new Promise(resolve=>{const done=()=>{reviewWaiters.delete(done);resolve();};reviewWaiters.add(done);});}assertActive(run);const result={path:p.path,accepted:p.hunks.filter(h=>h.status==='accepted').length,rejected:p.hunks.filter(h=>h.status==='rejected').length};run.reviewedProposals.set(p.key,result);return result;}
async function command({command}){assertActive();validateCommand(command);const run=active;return new Promise(resolve=>{const child=exec(command,{cwd:root,timeout:60000,maxBuffer:128000},(error,stdout,stderr)=>{run.children.delete(child);resolve({exitCode:error?(typeof error.code==='number'?error.code:1):0,killed:!!error?.killed,signal:error?.signal||null,...(error?{error:error.message}:{}),stdout:stdout.slice(-16000),stderr:stderr.slice(-8000)});});run.children.add(child);});}
async function cancel(){const run=active;if(!run)return;active=undefined;run.controller.abort();for(const child of run.children)child.kill();for(const resolve of reviewWaiters)resolve();proposals=proposals.filter(p=>p.applying||p.hunks.some(h=>h.status==='accepted'));for(const p of proposals)for(const h of p.hunks)if(h.status==='pending')h.status='discarded';render();status('Cancelled. Unaccepted proposals discarded; accepted edits preserved.');if(run.session)try{await client.cancel(run.session);}catch(e){status(`Local cancellation complete; server cancellation failed: ${e.message}`);}}
async function setup(run){client=new ForgeClient(config().get('baseUrl'));const nextRoot=vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;if(!nextRoot)throw Error('Open a repository folder first');if(!vscode.workspace.isTrusted)throw Error('Trust this workspace before running agent tools');if(root&&root!==nextRoot)history=[];root=nextRoot;bridge?.close();const bound=fn=>args=>{assertActive(run);return fn(args);};const created=await startBridge(0,{read:bound(read),search:bound(search),context:bound(assemble),propose:bound(proposalResult),command:bound(command)},{inline:!!run.inlineScope});if(active!==run||run.controller.signal.aborted){created.close();assertActive(run);}bridge=created;}
async function run(text,inlineScope){if(!text.trim())return;if(active)throw Error('Cancel the current run first');if(applyingEdits)throw Error('An approved edit is still finishing. Wait for it to settle before starting another run.');const run={id:randomUUID(),inlineScope,controller:new AbortController(),children:new Set(),reviewResults:new Map()};active=run;proposals=[];virtual.clear();render();send('reset',null);
  try{await setup(run);assertActive(run);const model=config().get('model').trim();if(!model||!model.includes('/')||/^(FQN|YOUR_)/i.test(model))throw Error('Set ForgeLens Model to an actual provider/model name from TrueForge. FQN is a label, not a model name. Clear Fallback Model until you configure a second model.');const name=bridge.name;run.serverName=name;await client.registerConnector({type:'remote',name,url:`http://127.0.0.1:${bridge.port}/mcp`,description:'Local ForgeLens editor tools',auth:{type:'header',headers:{Authorization:`Bearer ${bridge.token}`}}},run.controller.signal);
    const fallback=config().get('fallbackModel').trim();if(fallback&&(!fallback.includes('/')||/^(FQN|YOUR_)/i.test(fallback)))throw Error('Clear ForgeLens Fallback Model or enter a real configured provider/model name.');const models=[model,fallback].filter(Boolean);const available=await client.request('/models',undefined,'GET',run.controller.signal);for(const name of models)if(!available.data.some(m=>m.name===name))throw Error(`Model ${name} is not configured in TrueForge. Use a name from ${client.base}/api/v1/models.`);let complete=false;
    for(let attempt=0;attempt<models.length&&!complete;attempt++){
      assertActive(run);const {data:session}=await client.request('/sessions',{agent:{spec:agentSpec(models[attempt],name,{inline:!!run.inlineScope})}},'POST',run.controller.signal);run.session=session.id;lastSessionBase=client.base;status(`TrueForge session ${session.id} · ${models[attempt]}`);
      try{await withMinuteLimitRetry(async retry=>{run.reconnects=0;const content=retry?'Continue the interrupted task after the per-minute rate limit. Retain the original requirements. Inspect current file contents before proposing further edits; preserve accepted edits and respect rejected hunks. Do not repeat completed changes or commands.':text;await consume(await client.stream(`/sessions/${session.id}/turns`,{input:[{type:'user.message',content}],stream:true},run.controller.signal),run);},{signal:run.controller.signal,onWait:(delay,retry)=>status(`Model minute limit reached. Waiting ${Math.ceil(delay/1000)} seconds, then continuing this session (${retry}/2). Cancel remains available.`)});complete=true;}
      catch(e){if(run.controller.signal.aborted)throw e;if(attempt+1===models.length)throw e;await client.cancel(run.session).catch(()=>{});if(history.length&&proposals.some(p=>p.hunks.some(h=>h.status==='accepted')))throw Error('Run failed after accepted edits; automatic restart stopped to avoid duplicate changes');proposals=[];render();status(`Primary failed: ${e.message}. Switching to configured fallback.`);}
    }
    if(active===run&&!run.controller.signal.aborted)status('Run complete. Review verification results above.');
  }catch(e){if(!run.controller.signal.aborted){status(`Run failed: ${e.message}. No unapproved edits applied.`);if(run.session)await client.cancel(run.session).catch(()=>{});}}
  finally{if(active===run)active=undefined;}
}
async function consume(stream,run,state={events:new Map(),approvals:new Set(),reconnects:0}){const events=state.events;let turnId=state.turnId,cursor=state.cursor,paused=false;
  for await(const event of stream){if(active!==run||run.controller.signal.aborted)return;cursor=event.id||cursor;if(event.type==='turn.created')turnId=event.turn_id;if(event.type==='model.message.delta'){send('token',event.content||'');const base=events.get(event.id);if(base&&event.tool_calls){for(const fragment of event.tool_calls){const index=fragment.index||0;base.tool_calls||=[];const call=base.tool_calls[index]||={id:fragment.id,function:{name:'',arguments:''}};base.tool_calls[index]=call;if(fragment.id)call.id=fragment.id;if(fragment.function?.name)call.function.name+=fragment.function.name;if(fragment.function?.arguments)call.function.arguments+=fragment.function.arguments;}}}
    else events.set(event.id,event);
    if(event.type==='model.message'&&event.content)send('token',event.content);
    if(event.type==='tool.response')send('tool',event.content);
    if(event.type==='tool.approval_required'){
      for(const ref of event.tool_calls){assertActive(run);if(state.approvals.has(ref.id))continue;const source=events.get(ref.source_event_id);const call=source?.tool_calls?.find(c=>c.id===ref.id);let allow=false,denialReason='Unsupported tool or missing call details';
        let resolved;try{resolved=call&&editorToolCall(call,run.serverName);}catch(e){denialReason='Invalid tool arguments: '+e.message;}
        if(resolved){const {args,name}=resolved;
          if(name==='propose_edit'||name.endsWith('__propose_edit')){try{const result=await review(await buildProposal(args));assertActive(run);run.reviewResults||=new Map();run.reviewResults.set(proposalKey(args),result);allow=true;}catch(e){denialReason=e.message;if(active===run)status('Proposal rejected: '+e.message);}}
          else if(name==='run_command'||name.endsWith('__run_command')){try{validateCommand(args.command);allow=await vscode.window.showWarningMessage(`Run in workspace: ${args.command}\nCommands can modify files.`,{modal:true},'Run')==='Run';}catch(e){denialReason=e.message;status(e.message);}}
        }
        assertActive(run);await client.request(`/sessions/${run.session}/turns/${turnId}/events`,{events:[{type:'user.tool_approval',thread_id:event.thread_id||'main',tool_call_id:ref.id,approval:allow?{status:'allow'}:{status:'deny',reason:denialReason}}]},'POST',run.controller.signal);state.approvals.add(ref.id);
      }
    }
    if(event.type==='turn.update'&&event.state.status==='paused')paused=true;
    if(event.type==='turn.done'){if(event.state.status==='error')throw Error(event.state.message);if(event.state.status==='cancelled')throw Error('TrueForge cancelled the turn');if(event.state.status!=='done')throw Error('TrueForge turn ended without a completed status');return;}
  }
  if(active!==run||run.controller.signal.aborted)return;
  if(!turnId||!cursor)throw Error('TrueForge stream ended before a turn was created');
  state.turnId=turnId;state.cursor=cursor;
  if(paused)state.reconnects=0;else if(++state.reconnects>3)throw Error('TrueForge stream disconnected repeatedly. Cancel and retry.');
  status(paused?'Resuming reviewed TrueForge turn…':'Reconnecting TrueForge stream…');const next=await client.stream(`/sessions/${run.session}/turns/${turnId}/subscribe?after_event_id=${encodeURIComponent(cursor)}`,undefined,run.controller.signal,'GET');return consume(next,run,state);
}
function activate(ctx){ctx.subscriptions.push(output,vscode.workspace.registerTextDocumentContentProvider('forgelens',{provideTextDocumentContent:uri=>virtual.get(uri.toString())||''}),vscode.commands.registerCommand('forgelens.open',show),vscode.commands.registerCommand('forgelens.inline',async()=>{const editor=vscode.window.activeTextEditor;if(!editor||editor.selection.isEmpty)return;const instruction=await vscode.window.showInputBox({prompt:'Describe the selected code change'});if(!instruction)return;const relative=vscode.workspace.asRelativePath(editor.document.uri);const selected=editor.document.getText(editor.selection);const scope={path:relative,before:editor.document.getText(),start:editor.document.offsetAt(editor.selection.start),end:editor.document.offsetAt(editor.selection.end)};show();await run(`${instruction}\n@file ${relative}\nSelected lines ${editor.selection.start.line+1}-${editor.selection.end.line+1}:\n${selected}\nINLINE MODE: call propose_edit with selectionOnly:true and content containing ONLY the replacement for the selected text. Do not include code outside the selection.`,scope);}),vscode.commands.registerCommand('forgelens.undo',undo));}
async function deactivate(){await cancel();bridge?.close();}
module.exports={activate,deactivate};
