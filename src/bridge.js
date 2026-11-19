const express=require('express');
const {McpServer}=require('@modelcontextprotocol/sdk/server/mcp.js');
const {StreamableHTTPServerTransport}=require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {z}=require('zod');
const {randomBytes}=require('node:crypto');
function toolContent(name,result){
  if(name==='read_file'&&typeof result?.text==='string'){
    const {text,...metadata}=result;
    return [{type:'text',text:JSON.stringify(metadata)},{type:'text',text}];
  }
  if(name==='assemble_context'&&Array.isArray(result?.selected)){
    const {selected,...metadata}=result;
    return [{type:'text',text:JSON.stringify({...metadata,selected:selected.map(({text,...entry})=>entry)})},...selected.map(entry=>({type:'text',text:`SOURCE ${entry.path}:${entry.startLine}-${entry.endLine}\n${entry.text}`}))];
  }
  return [{type:'text',text:JSON.stringify(result)}];
}
async function startBridge(port,tools,{inline=false}={}){
  const token=randomBytes(32).toString('hex');const name=`forgelens-${randomBytes(12).toString('hex')}`;const app=express();app.use(express.json({limit:'2mb'}));
  const transports=new Set();
  app.use('/mcp',(req,res,next)=>{
    if(req.headers.authorization!==`Bearer ${token}`){res.sendStatus(401);return;}
    if(req.headers.origin){res.sendStatus(403);return;}
    next();
  });
  // Stateless MCP has no standalone SSE subscription or session to delete.
  // The client treats 405 as an intentional opt-out; 404 is a transport failure.
  app.get('/mcp',(_req,res)=>{res.set('Allow','POST').status(405).json({jsonrpc:'2.0',error:{code:-32000,message:'Standalone SSE is not supported; use POST /mcp'},id:null});});
  app.delete('/mcp',(_req,res)=>{res.set('Allow','POST').status(405).end();});
  app.post('/mcp',async(req,res)=>{
    const mcp=new McpServer({name:'forgelens-editor',version:'0.1.0'});
    const register=(name,description,inputSchema,fn,readOnly=true)=>mcp.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:readOnly,destructiveHint:!readOnly}},async args=>{try{return {content:toolContent(name,await fn(args))};}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}});
    register('assemble_context','Select relevant code with a visible size budget. Call first.',{query:z.string().min(1).max(20000)},tools.context);
    register('search_workspace','Search workspace code for literal text.',{query:z.string().min(1).max(200)},tools.search);
    register('read_file','Read a bounded file range; lines are one-based.',{path:z.string(),startLine:z.number().int().min(1).optional(),endLine:z.number().int().min(1).optional()},tools.read);
    const editSchema=inline?{path:z.string(),content:z.string().max(500000),selectionOnly:z.literal(true)}:{path:z.string(),content:z.string().max(500000).optional(),oldText:z.string().min(1).max(500000).optional(),newText:z.string().max(500000).optional(),selectionOnly:z.boolean().optional()};
    const editDescription=inline?'Replace ONLY the selected text. Required arguments: path, content (complete replacement selection), selectionOnly:true. Surrounding code is preserved. Human reviews every hunk.':'For existing files prefer path, oldText (unique exact text), newText; surrounding code is preserved. Alternatively content is a complete file. Human reviews every hunk.';
    register('propose_edit',editDescription,editSchema,tools.propose,false);
    register('run_command','Run a separate test or discovery command after human approval. Shell redirection, multiline scripts and inline code are refused. Use propose_edit to create or edit files.',{command:z.string().min(1).max(4000)},tools.command,false);
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});transports.add(transport);
    res.on('close',()=>{transports.delete(transport);void transport.close();void mcp.close();});
    try{await mcp.connect(transport);await transport.handleRequest(req,res,req.body);}catch(e){if(!res.headersSent)res.status(500).json({error:e.message});}
  });
  const server=await new Promise((resolve,reject)=>{const s=app.listen(port,'127.0.0.1',()=>resolve(s));s.on('error',reject);});
  return {name,port:server.address().port,token,close:()=>{for(const t of transports)void t.close();server.close();}};
}
module.exports={startBridge};
