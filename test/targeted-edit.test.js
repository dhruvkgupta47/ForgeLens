const {test}=require('node:test');
const assert=require('node:assert/strict');
const {proposalText}=require('../src/core');
test('small exact-match edits preserve a large file and its CRLF line endings',()=>{
  const before='prefix\r\n'.repeat(600)+'return a - b\r\n'+'suffix\r\n'.repeat(600);
  assert.equal(proposalText(before,{path:'a.py',oldText:'return a - b\n',newText:'return a + b\n'}),before.replace('a - b','a + b'));
});
test('ambiguous, missing, mixed and malformed edits are refused',()=>{
  for(const args of [{oldText:'same',newText:'x'},{oldText:'missing',newText:'x'},{oldText:'',newText:'x'},{oldText:'same'},{oldText:'same',newText:'x',content:'whole'},{}])assert.throws(()=>proposalText('same\nsame',{path:'a.py',...args}));
  assert.throws(()=>proposalText('before',{path:'a.py',oldText:'before',newText:'after'},{path:'a.py',before:'before',start:0,end:6}),/Inline/);
});
