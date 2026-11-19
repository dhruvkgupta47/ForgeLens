const {test}=require('node:test');
const assert=require('node:assert/strict');
const {minuteLimitDelay,withMinuteLimitRetry}=require('../src/rate-limit');
const message='Request failed (429): Generate content requests per minute limit exceeded on Free Tier. Please retry in 50.856075916s.';
test('minute limits wait for a full window and respect longer hints',()=>{
  assert.equal(minuteLimitDelay(message),60000);
  assert.equal(minuteLimitDelay(message.replace('50.856075916','90')),95000);
  assert.equal(minuteLimitDelay(message.replace('per minute','per day')),null);
  assert.equal(minuteLimitDelay('Request failed (429): quota exceeded'),null);
  assert.equal(minuteLimitDelay('Request failed (503): high demand'),null);
});
test('continues after waiting, with at most two retries',async()=>{
  const attempts=[],delays=[],signal=new AbortController().signal;
  const result=await withMinuteLimitRetry(async attempt=>{attempts.push(attempt);if(!attempt)throw Error(message);return 'done';},{signal,onWait:()=>{},wait:async delay=>delays.push(delay)});
  assert.equal(result,'done');assert.deepEqual(attempts,[0,1]);assert.deepEqual(delays,[60000]);
  let calls=0;
  await assert.rejects(withMinuteLimitRetry(async()=>{calls++;throw Error(message);},{signal,onWait:()=>{},wait:async()=>{}}),/429/);
  assert.equal(calls,3);
});
test('cancel interrupts the wait without another model request',async()=>{
  const controller=new AbortController();let calls=0;
  await assert.rejects(withMinuteLimitRetry(async()=>{calls++;throw Error(message);},{signal:controller.signal,onWait:()=>controller.abort()}),{name:'AbortError'});
  assert.equal(calls,1);
});
