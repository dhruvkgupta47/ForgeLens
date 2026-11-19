const {test}=require('node:test');
const assert=require('node:assert/strict');
const {agentSpec}=require('../src/agent');
test('inline agent instructions do not advertise the incompatible exact-match edit format',()=>{const spec=agentSpec('provider/model','editor',{inline:true});assert.match(spec.instructions,/selectionOnly:true/);assert.doesNotMatch(spec.instructions,/oldText|newText/);assert.match(agentSpec('provider/model','editor').instructions,/oldText/);});
test('editor tools load upfront without weakening write approval or increasing the iteration cap',()=>{
  const spec=agentSpec('provider/model','editor');
  const server=spec.mcp_servers[0];
  assert.equal(server.preload,true);
  // TrueForge treats a nonempty preload_tools list as deferred mode, even with preload:true.
  assert.equal(server.preload_tools,undefined);
  assert.deepEqual(server.require_approval_for_tools,['propose_edit','run_command']);
  assert.equal(spec.config.iteration_limit,40);
});
