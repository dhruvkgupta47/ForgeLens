const {setTimeout: sleep}=require('node:timers/promises');

function minuteLimitDelay(message){
  if(!/429/.test(message)||!/per minute|requests per minute|\bRPM\b/i.test(message))return null;
  if(/per day|daily|\bRPD\b/i.test(message))return null;
  const match=message.match(/retry in\s+([\d.]+)s\b/i);
  const seconds=match?Number(match[1]):60;
  if(!Number.isFinite(seconds)||seconds>120)return null;
  return Math.ceil(Math.max(60,seconds+5)*1000);
}

async function withMinuteLimitRetry(action,{signal,onWait,wait=sleep}){
  for(let attempt=0;;attempt++){
    signal.throwIfAborted();
    try{return await action(attempt);}catch(error){
      signal.throwIfAborted();
      const delay=minuteLimitDelay(error.message);
      if(delay===null||attempt>=2)throw error;
      onWait(delay,attempt+1);
      await wait(delay,undefined,{signal});
    }
  }
}
module.exports={minuteLimitDelay,withMinuteLimitRetry};
