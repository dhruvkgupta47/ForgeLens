const { diffLines } = require('diff');
const path = require('node:path');
const fs = require('node:fs/promises');
function hunks(before, after) {
  const parts = diffLines(before, after); let offset = 0; const result = [];
  for (let i=0;i<parts.length;i++) {
    const p=parts[i];
    if (!p.added && !p.removed) { offset += p.value.length; continue; }
    const start=offset; let old='', replacement='';
    while (i<parts.length && (parts[i].added || parts[i].removed)) {
      if(parts[i].removed) {old+=parts[i].value;offset+=parts[i].value.length;}
      else replacement+=parts[i].value;
      i++;
    }
    i--;result.push({start,end:offset,old,replacement,status:'pending'});
  }
  return result;
}
function materialize(before, changes) {
  let text=before;
  for(const h of [...changes].sort((a,b)=>b.start-a.start)) if(h.status==='accepted') text=text.slice(0,h.start)+h.replacement+text.slice(h.end);
  return text;
}
async function safePath(root, relative) {
  if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||relative.includes(':')) throw Error('Use a relative workspace path');
  const full=path.resolve(root,relative), base=await fs.realpath(root);
  if(!full.startsWith(path.resolve(root)+path.sep)) throw Error('Path escapes workspace');
  let ancestor=full;
  while(true) { try {const real=await fs.realpath(ancestor);if(real!==base&&!real.startsWith(base+path.sep))throw Error('Symlink escapes workspace');break;}catch(e){if(e.code!=='ENOENT')throw e;ancestor=path.dirname(ancestor);} }
  if(relative.split(/[\\/]/).some(p=>['.git','node_modules'].includes(p.toLowerCase())||p.toLowerCase().startsWith('.env'))||/\.(pem|key)$/i.test(relative))throw Error('Sensitive or excluded path');
  return full;
}
function selectContext(candidates,budget) {
  let used=0;const selected=[];
  for(const c of [...candidates].sort((a,b)=>b.score-a.score)) {
    const cost=Math.ceil(Buffer.byteLength(c.text,'utf8')/3)+Math.ceil(Buffer.byteLength(c.path,'utf8')/3)+30;
    if(used+cost>budget)continue;
    selected.push({...c,estimatedTokens:cost});used+=cost;
  }
  return {selected,estimatedTokens:used,budget,omitted:candidates.length-selected.length};
}
async function* sse(response) {
  if(!response.ok)throw Error(`TrueForge HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);
  if(!response.body)throw Error('Missing event stream');
  const decoder=new TextDecoder();let pending='';
  for await(const bytes of response.body) {
    pending=(pending+decoder.decode(bytes,{stream:true})).replace(/\r\n/g,'\n');
    let end;while((end=pending.indexOf('\n\n'))>=0) {
      const frame=pending.slice(0,end);pending=pending.slice(end+2);
      const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
      if(data&&data!=='[DONE]')yield JSON.parse(data);
    }
  }
}
function editorToolCall(call,serverName){
  const args=typeof call.function.arguments==='string'?JSON.parse(call.function.arguments):call.function.arguments;
  const name=call.tool_info?.name||call.function.name;
  if(typeof name!=='string'||!args||typeof args!=='object'||Array.isArray(args))return null;
  if(name==='call_tool'&&call.tool_info?.type!=='mcp'){
    if(args.mcp_server!==serverName||typeof args.tool_name!=='string'||!args.input||typeof args.input!=='object'||Array.isArray(args.input))return null;
    return {name:args.tool_name,args:args.input};
  }
  if(call.tool_info?.server_name&&call.tool_info.server_name!==serverName)return null;
  return {name,args};
}
function proposalText(before,args,scope){
  if(typeof args.path!=='string')throw Error('Proposal requires a path');
  const eol=before.includes('\r\n')?'\r\n':'\n';
  const normalize=text=>text.replace(/\r\n|\r|\n/g,eol);
  const targeted=args.oldText!==undefined||args.newText!==undefined;
  if(targeted){
    if(scope||args.selectionOnly)throw Error('Inline edits require selectionOnly:true and content');
    if(args.content!==undefined||typeof args.oldText!=='string'||!args.oldText||typeof args.newText!=='string')throw Error('Provide only path, nonempty oldText and newText for an exact-match edit');
    const oldText=normalize(args.oldText),replacement=normalize(args.newText),start=before.indexOf(oldText);
    if(start<0)throw Error('oldText was not found. Read the current file and retry.');
    if(before.indexOf(oldText,start+1)>=0)throw Error('oldText matches multiple places. Include more surrounding text.');
    return before.slice(0,start)+replacement+before.slice(start+oldText.length);
  }
  if(typeof args.content!=='string')throw Error('Provide content or an oldText/newText pair');
  let after=args.content;
  if(scope){
    if(args.path.replace(/\\/g,'/')!==scope.path.replace(/\\/g,'/'))throw Error('Inline edit may only change the selected file.');
    if(before!==scope.before)throw Error('Selection snapshot is stale. Cancel and select the code again.');
    if(args.selectionOnly!==true)throw Error('INLINE MODE: retry propose_edit with selectionOnly:true and content containing ONLY the replacement selection, not a full or partial file.');
    after=before.slice(0,scope.start)+args.content+before.slice(scope.end);
  }else if(args.selectionOnly)throw Error('No inline selection is active; provide the complete file content.');
  after=normalize(after);
  const oldLines=before.split('\n').length,newLines=after.split('\n').length;
  if(!scope&&oldLines>100&&newLines<oldLines/2)throw Error(`Replacement rejected: it would remove more than half of this ${oldLines}-line file. Read the complete file and retry with all unrelated code preserved.`);
  return after;
}
module.exports={hunks,materialize,safePath,selectContext,sse,editorToolCall,proposalText};
