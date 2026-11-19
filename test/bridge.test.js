const {test}=require('node:test');const assert=require('node:assert/strict');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {startBridge}=require('../src/bridge');const {ForgeClient}=require('../src/client');

test('source arrives as literal text rather than a nested JSON string, and exact-match edits remain valid',async()=>{
  const {proposalText}=require('../src/core');const source='@click.command("config")\r\nvalue = "literal\\n"\r\n';
  const bridge=await startBridge(0,{read:async()=>({path:'a.py',startLine:1,endLine:2,text:source}),context:async()=>({selected:[{path:'a.py',startLine:1,endLine:2,text:source}],budget:1000}),search:async()=>[],propose:async()=>({}),command:async()=>({})});const client=new Client({name:'literal-source-test',version:'1.0.0'});
  try{
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${bridge.port}/mcp`),{requestInit:{headers:{Authorization:`Bearer ${bridge.token}`}}}));
    const read=await client.callTool({name:'read_file',arguments:{path:'a.py'}});assert.equal(JSON.parse(read.content[0].text).path,'a.py');assert.equal(read.content[1].text,source);assert.equal(JSON.parse(read.content[0].text).text,undefined);
    const assembled=await client.callTool({name:'assemble_context',arguments:{query:'config'}});assert.equal(JSON.parse(assembled.content[0].text).selected[0].text,undefined);assert.equal(assembled.content[1].text,'SOURCE a.py:1-2\n'+source);
    assert.equal(proposalText(source,{path:'a.py',oldText:read.content[1].text,newText:source.replace('config','settings')}),source.replace('config','settings'));
  }finally{await client.close();bridge.close();}
});

test('inline bridge exposes only selection edits and rejects the observed oldText/newText call',async()=>{
  let edits=0;const bridge=await startBridge(0,{context:async()=>({}),read:async()=>({}),search:async()=>[],propose:async args=>{edits++;return args;},command:async()=>({})},{inline:true});
  const client=new Client({name:'inline-schema-test',version:'1.0.0'});
  try{
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${bridge.port}/mcp`),{requestInit:{headers:{Authorization:`Bearer ${bridge.token}`}}}));
    const tool=(await client.listTools()).tools.find(t=>t.name==='propose_edit');
    assert.deepEqual(new Set(tool.inputSchema.required),new Set(['path','content','selectionOnly']));assert.equal(tool.inputSchema.properties.oldText,undefined);assert.equal(tool.inputSchema.properties.newText,undefined);
    for(const args of [{path:'a.py',oldText:'old',newText:'new'},{path:'a.py',content:'new',selectionOnly:false}]){const result=await client.callTool({name:'propose_edit',arguments:args});assert.equal(result.isError,true);}
    assert.equal(edits,0);const result=await client.callTool({name:'propose_edit',arguments:{path:'a.py',content:'new',selectionOnly:true}});assert.equal(result.isError,undefined);assert.equal(edits,1);
  }finally{await client.close();bridge.close();}
});
test('real MCP handshake, discovery, authenticated call, and unauthorized rejection',async()=>{
  const bridge=await startBridge(18792,{context:async a=>({selected:[],query:a.query}),read:async()=>({text:'hello'}),search:async()=>[],propose:async()=>({reviewed:true}),command:async()=>({exitCode:0})});
  const client=new Client({name:'forgelens-test',version:'1.0.0'});
  try{
    const denied=await fetch('http://127.0.0.1:18792/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,401);
    const subscription=await fetch('http://127.0.0.1:18792/mcp',{headers:{Authorization:`Bearer ${bridge.token}`,Accept:'text/event-stream'}});assert.equal(subscription.status,405);assert.equal(subscription.headers.get('allow'),'POST');await subscription.body.cancel();
    const unauthorizedGet=await fetch('http://127.0.0.1:18792/mcp');assert.equal(unauthorizedGet.status,401);
    const browserGet=await fetch('http://127.0.0.1:18792/mcp',{headers:{Authorization:`Bearer ${bridge.token}`,Origin:'https://example.com'}});assert.equal(browserGet.status,403);
    await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:18792/mcp'),{requestInit:{headers:{Authorization:`Bearer ${bridge.token}`}}}));
    const listed=await client.listTools();assert.equal(listed.tools.length,5);const editTool=listed.tools.find(t=>t.name==='propose_edit');assert.equal(editTool.annotations.readOnlyHint,false);assert.ok(editTool.inputSchema.properties.oldText);assert.ok(editTool.inputSchema.properties.newText);assert.ok(!editTool.inputSchema.required.includes('content'));
    const result=await client.callTool({name:'assemble_context',arguments:{query:'find CLI registration'}});assert.equal(JSON.parse(result.content[0].text).query,'find CLI registration');
    const invalid=await client.callTool({name:'read_file',arguments:{path:'x',startLine:0}});assert.equal(invalid.isError,true);
  }finally{await client.close();bridge.close();}
});
test('client confines TrueForge connection to localhost',()=>{assert.throws(()=>new ForgeClient('https://external.example'));assert.doesNotThrow(()=>new ForgeClient('http://127.0.0.1:8790'));});
test('concurrent editor bridges have unique ports and identities and reject each other\'s credentials',async()=>{
  const tools=label=>({context:async()=>({workspace:label}),read:async()=>({}),search:async()=>[],propose:async()=>({}),command:async()=>({})});
  const a=await startBridge(0,tools('calculator'));let b;const clients=[];
  try{b=await startBridge(0,tools('flask'));assert.notEqual(a.port,b.port);assert.notEqual(a.name,b.name);assert.notEqual(a.token,b.token);
    const wrong=await fetch(`http://127.0.0.1:${b.port}/mcp`,{headers:{Authorization:`Bearer ${a.token}`}});assert.equal(wrong.status,401);
    for(const [bridge,label] of [[a,'calculator'],[b,'flask']]){const client=new Client({name:'isolation-test',version:'1.0.0'});clients.push(client);await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${bridge.port}/mcp`),{requestInit:{headers:{Authorization:`Bearer ${bridge.token}`}}}));const result=await client.callTool({name:'assemble_context',arguments:{query:'read repository'}});assert.equal(JSON.parse(result.content[0].text).workspace,label);}
  }finally{for(const client of clients)await client.close();a.close();b?.close();}
});
