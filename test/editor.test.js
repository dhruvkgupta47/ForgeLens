const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const {createRequire}=require('node:module');
async function harness({normalizeEol=false,saveTransform=t=>t,wait,settings={},execOverride,beforeSave}={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'forgelens-editor-'));const docs=new Map();
  class Position{constructor(line,character){this.line=line;this.character=character;}}
  class Range{constructor(...args){if(args.length===2){[this.start,this.end]=args;}else{this.start=new Position(args[0],args[1]);this.end=new Position(args[2],args[3]);}}}
  const uri=p=>({fsPath:p,toString:()=>p});
  const open=async u=>{const p=u.fsPath;if(!docs.has(p)){let text=await fs.readFile(p,'utf8');docs.set(p,{uri:u,getText:r=>{if(!r)return text;const lines=text.split('\n');const offset=p=>lines.slice(0,p.line).reduce((n,line)=>n+line.length+1,0)+p.character;return text.slice(offset(r.start),offset(r.end));},get lineCount(){return text.split('\n').length;},positionAt:n=>new Position(0,n),set:t=>text=normalizeEol?t.replace(/\r?\n/g,'\r\n'):t,save:async()=>{if(beforeSave)await beforeSave();text=saveTransform(text);await fs.writeFile(p,text);return true;}});}return docs.get(p);};
  class WorkspaceEdit{constructor(){this.ops=[];}createFile(u){this.ops.push(['create',u]);}deleteFile(u){this.ops.push(['delete',u]);}replace(u,r,t){this.ops.push(['replace',u,t]);}insert(u,p,t){this.ops.push(['replace',u,t]);}}
  const vscode={Position,Range,WorkspaceEdit,Uri:{file:uri,parse:uri},workspace:{getConfiguration:()=>({get:key=>({model:'provider/model',fallbackModel:'',baseUrl:'http://localhost:8794',...settings})[key]}),openTextDocument:open,applyEdit:async edit=>{for(const [op,u,t]of edit.ops){if(op==='delete'){await fs.unlink(u.fsPath);docs.delete(u.fsPath);}else if(op==='create')await fs.writeFile(u.fsPath,'');else{const doc=await open(u);doc.set(t);}}return true;}},window:{createOutputChannel:()=>({appendLine(){}})},commands:{executeCommand:async()=>{}}};
  const filename=path.resolve(__dirname,'../src/extension.js');const localRequire=createRequire(filename);const module={exports:{}};
  const source=await fs.readFile(filename,'utf8');
  new Function('require','module',source+`\nmodule.exports.test={run,read,command,proposalResult,configureRun(c){client=c;bridge={name:'forgelens-test-editor',port:1234,token:'test'};setup=async()=>{};},buildProposal,review,decide,undo,cancel,consume,send,restorePanel,observeMessages(fn){panel={webview:{postMessage:fn}};},state(r,p,c){root=r;proposals=p;active={id:'run',controller:new AbortController(),children:new Set(),session:'session',serverName:'forgelens-test-editor'};client=c||{cancel:async()=>{}};},observeReviews(fn){panel={webview:{postMessage:message=>{if(message.type==='proposals')fn(message.data);}}};},getActive:()=>active,getProposals:()=>proposals};`)(name=>name==='vscode'?vscode:name==='node:child_process'&&execOverride?{exec:execOverride}:name==='./rate-limit'&&wait?{withMinuteLimitRetry:(action,options)=>localRequire(name).withMinuteLimitRetry(action,{...options,wait})}:localRequire(name),module);
  return {api:module.exports.test,root,open,uri,cleanup:()=>fs.rm(root,{recursive:true})};
}

test('an identical rejected proposal cannot reopen review in the same run',async()=>{const h=await harness();try{
  const file=path.join(h.root,'a.py');await fs.writeFile(file,'before');h.api.state(h.root,[]);let shown;const displayed=new Promise(resolve=>shown=resolve);h.api.observeReviews(proposals=>{if(proposals.length)shown(proposals[0]);});
  const args={path:'a.py',content:'after'};const first=await h.api.buildProposal(args);const reviewing=h.api.review(first);await displayed;await h.api.decide(first.id,0,false);await reviewing;
  const duplicate=await h.api.buildProposal(args);await assert.rejects(h.api.review(duplicate),/identical proposal was already reviewed.*0 accepted, 1 rejected/);assert.equal(h.api.getProposals().length,1);assert.equal(await fs.readFile(file,'utf8'),'before');
}finally{await h.cleanup();}});

test('cancellation removes pending controls from partially accepted proposals and preserves undo',async()=>{const h=await harness();try{
  const file=path.join(h.root,'a.py');await fs.writeFile(file,'one\nmiddle\nthree\n');const proposals=[];h.api.state(h.root,proposals);const p=await h.api.buildProposal({path:'a.py',content:'ONE\nmiddle\nTHREE\n'});proposals.push(p);await h.api.decide(p.id,0,true);await h.api.cancel();
  assert.deepEqual(h.api.getProposals()[0].hunks.map(h=>h.status),['accepted','discarded']);assert.equal(await fs.readFile(file,'utf8'),'ONE\nmiddle\nthree\n');await h.api.undo();assert.equal(await fs.readFile(file,'utf8'),'one\nmiddle\nthree\n');
}finally{await h.cleanup();}});

test('a new run cannot start while a previously approved edit is still saving',async()=>{let saving,finish;const entered=new Promise(resolve=>saving=resolve);const gate=new Promise(resolve=>finish=resolve);const h=await harness({beforeSave:async()=>{saving();await gate;}});try{
  const file=path.join(h.root,'a.py');await fs.writeFile(file,'before');const proposals=[];h.api.state(h.root,proposals);const p=await h.api.buildProposal({path:'a.py',content:'after'});proposals.push(p);const accepting=h.api.decide(p.id,0,true);await entered;await h.api.cancel();await assert.rejects(h.api.run('new task'),/edit is still finishing/);await assert.rejects(h.api.undo(),/edit is still finishing/);finish();await accepting;
  assert.equal(await fs.readFile(file,'utf8'),'after');assert.equal(h.api.getProposals()[0].hunks[0].status,'accepted');assert.equal(h.api.getActive(),undefined);
}finally{finish();await h.cleanup();}});

test('killed and spawn-failed commands never report exit code zero',async()=>{for(const error of [Object.assign(Error('Timed out'),{code:null,killed:true,signal:'SIGTERM'}),Object.assign(Error('Spawn failed'),{code:'ENOENT'}),Object.assign(Error('Test failed'),{code:7})]){
  const h=await harness({execOverride:(_command,options,callback)=>{assert.equal(options.timeout,60000);queueMicrotask(()=>callback(error,'partial output','diagnostic'));return {kill(){}};}});try{h.api.state(h.root,[]);const result=await h.api.command({command:'test command'});assert.notEqual(result.exitCode,0);assert.equal(result.exitCode,typeof error.code==='number'?error.code:1);assert.equal(result.error,error.message);assert.equal(result.killed,!!error.killed);}finally{await h.cleanup();}
}});

test('file paging reports real boundaries, EOF and invalid ranges',async()=>{const h=await harness();try{
  const lines=Array.from({length:300},(_,i)=>'line '+(i+1));await fs.writeFile(path.join(h.root,'large.py'),lines.join('\n'));h.api.state(h.root,[]);
  const first=await h.api.read({path:'large.py',endLine:1000});assert.equal(first.text,lines.slice(0,240).join('\n')+'\n');assert.equal(first.totalLines,300);assert.equal(first.nextStartLine,241);
  const last=await h.api.read({path:'large.py',startLine:first.nextStartLine});assert.equal(last.text,lines.slice(240).join('\n'));assert.equal(last.nextStartLine,null);
  assert.equal((await h.api.read({path:'large.py',startLine:400})).text,'');await assert.rejects(h.api.read({path:'large.py',startLine:20,endLine:10}),/endLine/);
}finally{await h.cleanup();}});

test('Task C switches models after connection failure and cancel discards the fallback proposal without writes',async()=>{const h=await harness({settings:{fallbackModel:'backup/model'}});try{
  const file=path.join(h.root,'helpers.py');await fs.writeFile(file,'before\n');h.api.state(h.root,[]);await h.api.cancel();const models=[],cancelled=[],statuses=[];let ready;const displayed=new Promise(resolve=>ready=resolve);h.api.observeMessages(message=>{if(message.type==='status')statuses.push(message.data);if(message.type==='proposals'&&message.data.length)ready(message.data[0]);});
  h.api.configureRun({base:'http://localhost:8794',registerConnector:async()=>{},cancel:async id=>cancelled.push(id),request:async(route,body)=>{if(route==='/models')return {data:[{name:'provider/model'},{name:'backup/model'}]};assert.equal(route,'/sessions');models.push(body.agent.spec.model.name);return {data:{id:'session-'+models.length}};},stream:async route=>(async function*(){yield {id:'created',type:'turn.created',turn_id:'turn'};if(route.includes('session-1')){yield {id:'failed',type:'turn.done',state:{status:'error',message:'[Model Error] Cannot connect to API: ECONNREFUSED'}};return;}yield {id:'message',type:'model.message',tool_calls:[{id:'edit',function:{name:'propose_edit',arguments:JSON.stringify({path:'helpers.py',oldText:'before',newText:'after'})},tool_info:{type:'mcp',server_name:'forgelens-test-editor',name:'propose_edit'}}]};yield {id:'approval',type:'tool.approval_required',tool_calls:[{id:'edit',source_event_id:'message'}]};})()});
  const running=h.api.run('edit the function');const proposal=await displayed;assert.deepEqual(models,['provider/model','backup/model']);assert.equal(proposal.hunks[0].status,'pending');assert.ok(statuses.some(s=>s.includes('Switching to configured fallback')));assert.equal(await fs.readFile(file,'utf8'),'before\n');await h.api.cancel();await running;assert.deepEqual(cancelled,['session-1','session-2']);assert.equal(h.api.getProposals().length,0);assert.equal(await fs.readFile(file,'utf8'),'before\n');assert.equal(h.api.getActive(),undefined);
}finally{await h.cleanup();}});

test('Task C cancellation interrupts a running fallback stream without another request',async()=>{const h=await harness({settings:{fallbackModel:'backup/model'}});try{
  h.api.state(h.root,[]);await h.api.cancel();let sessions=0,streams=0,ready;const streaming=new Promise(resolve=>ready=resolve);h.api.configureRun({base:'http://localhost:8794',registerConnector:async()=>{},cancel:async()=>{},request:async route=>route==='/models'?{data:[{name:'provider/model'},{name:'backup/model'}]}:{data:{id:'session-'+(++sessions)}},stream:async(_route,_body,signal)=>(async function*(){streams++;yield {id:'created',type:'turn.created',turn_id:'turn'};if(streams===1){yield {id:'failed',type:'turn.done',state:{status:'error',message:'connect ECONNREFUSED'}};return;}yield {id:'text',type:'model.message.delta',content:'Considering a change'};await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});ready();});})()});
  const running=h.api.run('edit the function');await streaming;await h.api.cancel();await running;assert.equal(sessions,2);assert.equal(streams,2);assert.deepEqual(await fs.readdir(h.root),[]);assert.equal(h.api.getActive(),undefined);
}finally{await h.cleanup();}});

test('fallback does not restart the task after an accepted edit',async()=>{const h=await harness({settings:{fallbackModel:'backup/model'}});try{
  const file=path.join(h.root,'helpers.py');await fs.writeFile(file,'before\n');h.api.state(h.root,[]);await h.api.cancel();let sessions=0,decision;const statuses=[];h.api.observeMessages(message=>{if(message.type==='status')statuses.push(message.data);if(message.type==='proposals'&&message.data.length&&!decision)decision=Promise.resolve().then(()=>h.api.decide(message.data[0].id,0,true));});
  h.api.configureRun({base:'http://localhost:8794',registerConnector:async()=>{},cancel:async()=>{},request:async route=>route==='/models'?{data:[{name:'provider/model'},{name:'backup/model'}]}:route==='/sessions'?{data:{id:'session-'+(++sessions)}}:{},stream:async()=>(async function*(){yield {id:'created',type:'turn.created',turn_id:'turn'};yield {id:'message',type:'model.message',tool_calls:[{id:'edit',function:{name:'propose_edit',arguments:JSON.stringify({path:'helpers.py',oldText:'before',newText:'after'})},tool_info:{type:'mcp',server_name:'forgelens-test-editor',name:'propose_edit'}}]};yield {id:'approval',type:'tool.approval_required',tool_calls:[{id:'edit',source_event_id:'message'}]};yield {id:'failed',type:'turn.done',state:{status:'error',message:'model failed'}};})()});
  await h.api.run('edit the function');await decision;assert.equal(sessions,1);assert.equal(await fs.readFile(file,'utf8'),'after\n');assert.ok(statuses.some(s=>s.includes('automatic restart stopped to avoid duplicate changes')));
}finally{await h.cleanup();}});

test('formatter changes are preserved when another hunk is pending',async()=>{const h=await harness({saveTransform:t=>t.replace('middle','formatted middle')});try{
  const file=path.join(h.root,'a.py');await fs.writeFile(file,'one\nmiddle\nthree\n');const proposals=[];h.api.state(h.root,proposals);const p=await h.api.buildProposal({path:'a.py',content:'ONE\nmiddle\nTHREE\n'});proposals.push(p);
  await h.api.decide(p.id,0,true);await assert.rejects(h.api.decide(p.id,1,true),/Formatting changed/);assert.equal(await fs.readFile(file,'utf8'),'ONE\nformatted middle\nthree\n');await h.api.decide(p.id,1,false);
}finally{await h.cleanup();}});

test('direct preloaded tools preserve exact edit scope and report mixed review results once',async()=>{const h=await harness();try{
  const file=path.join(h.root,'a.py');await fs.writeFile(file,'one\nmiddle\nthree\n');const args={path:'a.py',oldText:'one\nmiddle\nthree',newText:'ONE\nmiddle\nTHREE'};const requests=[];h.api.state(h.root,[],{request:async(...args)=>requests.push(args)});
  let decision;h.api.observeReviews(proposals=>{if(proposals[0]&&!decision)decision=Promise.resolve().then(async()=>{await h.api.decide(proposals[0].id,0,true);await h.api.decide(proposals[0].id,1,false);});});
  async function* events(){yield {id:'created',type:'turn.created',turn_id:'turn'};yield {id:'msg',type:'model.message',tool_calls:[{id:'edit',function:{name:'propose_edit',arguments:JSON.stringify(args)},tool_info:{type:'mcp',server_name:'forgelens-test-editor',name:'propose_edit'}}]};const approval={id:'approval',type:'tool.approval_required',tool_calls:[{id:'edit',source_event_id:'msg'}]};yield approval;yield approval;yield {id:'done',type:'turn.done',state:{status:'done'}};}
  await h.api.consume(events(),h.api.getActive());await decision;assert.equal(requests.length,1);assert.equal(await fs.readFile(file,'utf8'),'ONE\nmiddle\nthree\n');assert.deepEqual(h.api.proposalResult(args),{reviewed:true,path:'a.py',accepted:1,rejected:1});assert.throws(()=>h.api.proposalResult(args),/No completed human review/);
}finally{await h.cleanup();}});

test('cancelled review cannot be revived by a new active run',async()=>{const h=await harness();try{
  await fs.writeFile(path.join(h.root,'a.py'),'before');h.api.state(h.root,[]);const p=await h.api.buildProposal({path:'a.py',content:'after'});let shown;const displayed=new Promise(resolve=>shown=resolve);h.api.observeReviews(()=>shown());const reviewing=h.api.review(p);const rejected=assert.rejects(reviewing,/not active/);await displayed;await h.api.cancel();h.api.state(h.root,[]);await rejected;assert.equal(await fs.readFile(path.join(h.root,'a.py'),'utf8'),'before');
}finally{await h.cleanup();}});

test('stream reconnection keeps the last real cursor and requires a completion event',async()=>{const h=await harness();try{
  let calls=0;h.api.state(h.root,[],{stream:async route=>{assert.match(route,/after_event_id=last-real-event$/);calls++;return (async function*(){if(calls===2)yield {id:'done',type:'turn.done',state:{status:'done'}};})();}});
  await h.api.consume((async function*(){yield {id:'last-real-event',type:'turn.created',turn_id:'turn'};})(),h.api.getActive());assert.equal(calls,2);
  await assert.rejects(h.api.consume((async function*(){})(),h.api.getActive()),/before a turn was created/);
  h.api.state(h.root,[],{stream:async()=>((async function*(){})())});await assert.rejects(h.api.consume((async function*(){yield {id:'created',type:'turn.created',turn_id:'turn'};})(),h.api.getActive()),/disconnected repeatedly/);
}finally{await h.cleanup();}});

test('a minute-limit continuation uses the same session instead of replaying the original task',async()=>{const waits=[];const h=await harness({wait:async ms=>waits.push(ms)});try{
  h.api.state(h.root,[]);await h.api.cancel();let sessions=0;const turns=[];h.api.configureRun({base:'http://localhost:8794',registerConnector:async()=>{},cancel:async()=>{},request:async route=>{if(route==='/models')return {data:[{name:'provider/model'}]};assert.equal(route,'/sessions');sessions++;return {data:{id:'same-session'}};},stream:async(route,body)=>{turns.push({route,content:body.input[0].content});return (async function*(){yield {id:'created',type:'turn.created',turn_id:'turn'+turns.length};yield {id:'done',type:'turn.done',state:turns.length===1?{status:'error',message:'Request failed (429): requests per minute limit exceeded. Please retry in 50s.'}:{status:'done'}};})();}});
  await h.api.run('original task');assert.equal(sessions,1);assert.equal(turns.length,2);assert.equal(turns[0].route,turns[1].route);assert.equal(turns[0].content,'original task');assert.match(turns[1].content,/Continue the interrupted task/);assert.deepEqual(waits,[60000]);assert.equal(h.api.getActive(),undefined);
}finally{await h.cleanup();}});
test('editor approval applies only accepted hunk, saves, and explicit undo restores snapshot',async()=>{const h=await harness();try{const file=path.join(h.root,'app.py');await fs.writeFile(file,'one\ntwo\nthree\nfour\n');const proposals=[];h.api.state(h.root,proposals);const p=await h.api.buildProposal({path:'app.py',content:'ONE\ntwo\nthree\nFOUR\n'});proposals.push(p);await h.api.decide(p.id,1,true);await h.api.decide(p.id,0,false);assert.equal(await fs.readFile(file,'utf8'),'one\ntwo\nthree\nFOUR\n');await h.api.undo();assert.equal(await fs.readFile(file,'utf8'),'one\ntwo\nthree\nfour\n');}finally{await h.cleanup();}});
test('rejecting all hunks leaves file byte-identical',async()=>{const h=await harness();try{const file=path.join(h.root,'app.py');await fs.writeFile(file,'before');const p=[];h.api.state(h.root,p);p.push(await h.api.buildProposal({path:'app.py',content:'after'}));await h.api.decide(p[0].id,0,false);assert.equal(await fs.readFile(file,'utf8'),'before');}finally{await h.cleanup();}});
test('inline editor applies only the captured selection and preserves unrelated functions',async()=>{const h=await harness();try{
  const file=path.join(h.root,'helpers.py'),before='def selected():\n    return 1\n\ndef unrelated():\n    return 2\n';await fs.writeFile(file,before);const p=[];h.api.state(h.root,p);h.api.getActive().inlineScope={path:'helpers.py',before,start:0,end:before.indexOf('\n\ndef unrelated')};
  await assert.rejects(h.api.buildProposal({path:'helpers.py',content:'partial file'}),/selectionOnly:true/);assert.equal(await fs.readFile(file,'utf8'),before);
  p.push(await h.api.buildProposal({path:'helpers.py',content:'def selected():\n    return 3',selectionOnly:true}));await h.api.decide(p[0].id,0,true);assert.equal(await fs.readFile(file,'utf8'),before.replace('return 1','return 3'));await h.api.undo();assert.equal(await fs.readFile(file,'utf8'),before);
}finally{await h.cleanup();}});
test('undo uses actual CRLF document after applying an LF model proposal',async()=>{const h=await harness({normalizeEol:true});try{
  const file=path.join(h.root,'calculator.py'),before='def add(a, b):\r\n    return a - b\r\n';await fs.writeFile(file,before);const p=[];h.api.state(h.root,p);p.push(await h.api.buildProposal({path:'calculator.py',content:'def add(a, b):\n    return a + b\n'}));for(let i=0;i<p[0].hunks.length;i++)await h.api.decide(p[0].id,i,true);
  assert.equal(await fs.readFile(file,'utf8'),'def add(a, b):\r\n    return a + b\r\n');await h.api.undo();assert.equal(await fs.readFile(file,'utf8'),before);
}finally{await h.cleanup();}});
test('undo captures text after format-on-save rather than raw model content',async()=>{const h=await harness({saveTransform:t=>t.replace(/[ \t]+$/gm,'')});try{
  const file=path.join(h.root,'calculator.py'),before='return a - b\n';await fs.writeFile(file,before);const p=[];h.api.state(h.root,p);p.push(await h.api.buildProposal({path:'calculator.py',content:'return a + b  \n'}));await h.api.decide(p[0].id,0,true);assert.equal(await fs.readFile(file,'utf8'),'return a + b\n');await h.api.undo();assert.equal(await fs.readFile(file,'utf8'),before);
}finally{await h.cleanup();}});
test('undo still refuses a real user change after acceptance',async()=>{const h=await harness();try{
  const file=path.join(h.root,'calculator.py');await fs.writeFile(file,'return a - b\n');const p=[];h.api.state(h.root,p);p.push(await h.api.buildProposal({path:'calculator.py',content:'return a + b\n'}));await h.api.decide(p[0].id,0,true);const doc=await h.open(h.uri(file));doc.set('return a + b + 1\n');await doc.save();await assert.rejects(h.api.undo(),/file changed after application/);assert.equal(await fs.readFile(file,'utf8'),'return a + b + 1\n');
}finally{await h.cleanup();}});
test('recreated webview restores pending hunk controls and stream without applying or duplicating edits',async()=>{const h=await harness();try{
  const file=path.join(h.root,'calculator.py');await fs.writeFile(file,'return a - b\n');const proposals=[];h.api.state(h.root,proposals);proposals.push(await h.api.buildProposal({path:'calculator.py',content:'return a + b\n'}));
  h.api.send('status','Waiting for review');h.api.send('token','Proposed addition.');h.api.send('tool','Read calculator.py');
  let messages=[];h.api.observeMessages(m=>messages.push(m));h.api.restorePanel();
  assert.equal(messages.find(m=>m.type==='proposals').data[0].hunks[0].status,'pending');assert.equal(messages.find(m=>m.type==='token').data,'Proposed addition.');assert.equal(messages.find(m=>m.type==='status').data,'Waiting for review');assert.equal(await fs.readFile(file,'utf8'),'return a - b\n');
  messages=[];h.api.restorePanel();assert.equal(messages.find(m=>m.type==='token').data,'Proposed addition.');
  await h.api.decide(proposals[0].id,0,true);assert.equal(await fs.readFile(file,'utf8'),'return a + b\n');await h.api.undo();assert.equal(await fs.readFile(file,'utf8'),'return a - b\n');
}finally{await h.cleanup();}});
test('stale document refuses edit and cancellation invalidates pending review',async()=>{const h=await harness();try{const file=path.join(h.root,'app.py');await fs.writeFile(file,'before');const p=[];h.api.state(h.root,p);p.push(await h.api.buildProposal({path:'app.py',content:'after'}));(await h.open(h.uri(file))).set('user edit');await assert.rejects(h.api.decide(p[0].id,0,true),/File changed/);assert.equal(p[0].hunks[0].status,'pending');await h.api.cancel();assert.equal(h.api.getProposals().length,0);await assert.rejects(h.api.decide(p[0].id,0,true),/not active/);assert.equal(await fs.readFile(file,'utf8'),'before');}finally{await h.cleanup();}});
test('real event processor sends approval decisions using TrueForge wire contract',async()=>{const h=await harness();try{const requests=[];h.api.state(h.root,[],{request:async(...args)=>requests.push(args),cancel:async()=>{}});async function* events(){yield {id:'created',type:'turn.created',turn_id:'turn'};yield {id:'msg',type:'model.message',tool_calls:[{id:'call',function:{name:'unknown_tool',arguments:'{}'}}]};yield {id:'approval',type:'tool.approval_required',thread_id:'main',tool_calls:[{id:'call',source_event_id:'msg'}]};yield {id:'done',type:'turn.done',state:{status:'done'}};}await h.api.consume(events(),h.api.getActive());
  // Unknown tools must never receive approval.
  assert.equal(requests.length,1);assert.equal(requests[0][0],'/sessions/session/turns/turn/events');assert.equal(requests[0][1].events[0].approval.status,'deny');
}finally{await h.cleanup();}});
test('deferred TrueForge propose_edit opens review and waits for a user decision',async()=>{const h=await harness();try{
  const file=path.join(h.root,'calculator.py');const before='def add(a, b):\n    return a - b\n';const after='def add(a, b):\n    return a + b\n';await fs.writeFile(file,before);
  const requests=[];h.api.state(h.root,[],{request:async(...args)=>requests.push(args),cancel:async()=>{}});
  let notify;const displayed=new Promise(resolve=>notify=resolve);h.api.observeReviews(proposals=>{if(proposals[0])notify(proposals[0]);});
  async function* events(){yield {id:'created',type:'turn.created',turn_id:'turn'};yield {id:'msg',type:'model.message',tool_calls:[{id:'edit',function:{name:'call_tool',arguments:JSON.stringify({mcp_server:'forgelens-test-editor',tool_name:'propose_edit',input:{path:'calculator.py',content:after}})},tool_info:{type:'truefoundry-system',name:'call_tool'}}]};yield {id:'approval',type:'tool.approval_required',thread_id:'main',tool_calls:[{id:'edit',source_event_id:'msg'}]};yield {id:'done',type:'turn.done',state:{status:'done'}};}
  const processing=h.api.consume(events(),h.api.getActive());const proposal=await displayed;
  assert.equal(await fs.readFile(file,'utf8'),before);assert.equal(requests.length,0);assert.equal(proposal.hunks[0].status,'pending');
  await h.api.decide(proposal.id,0,true);await processing;
  assert.equal(await fs.readFile(file,'utf8'),after);assert.equal(requests[0][1].events[0].approval.status,'allow');
  await h.api.undo();assert.equal(await fs.readFile(file,'utf8'),before);
}finally{await h.cleanup();}});
