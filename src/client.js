const {sse}=require('./core');
class ForgeClient {
  constructor(base){this.base=base.replace(/\/$/,''); const u=new URL(this.base);if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw Error('TrueForge must run locally');}
  async fetch(route,options){try{return await fetch(this.base+'/api/v1'+route,options);}catch(e){if(options.signal?.aborted)throw e;throw Error(`Cannot reach TrueForge at ${this.base} (${e.cause?.code||e.message}). Open that URL in a browser and check ForgeLens Base URL. If 127.0.0.1 fails, try localhost.`,{cause:e});}}
  async request(route,body,method='POST',signal){const timeout=AbortSignal.timeout(15000);const r=await this.fetch(route,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:signal?AbortSignal.any([signal,timeout]):timeout});if(!r.ok)throw Error(`TrueForge HTTP ${r.status}: ${(await r.text()).slice(0,500)}`);if(r.status===204)return;return r.json();}
  stream(route,body,signal,method='POST'){return this.fetch(route,{method,headers:{'Content-Type':'application/json',Accept:'text/event-stream'},body:body===undefined?undefined:JSON.stringify(body),signal}).then(r=>sse(r));}
  cancel(id){return this.request(`/sessions/${encodeURIComponent(id)}/cancel`,{});}
  registerConnector(manifest,signal){return this.request('/settings/mcp-servers',{manifest},'PUT',signal);}
}
module.exports={ForgeClient};
