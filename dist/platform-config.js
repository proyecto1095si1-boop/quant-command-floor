(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.QCFPlatform=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const DEFAULTS=Object.freeze({
    environment:'development',backendBaseUrl:'http://localhost:8787',healthPath:'/v1/health',agentPath:'/v1/agents/execute',streamUrl:'ws://localhost:8787/v1/stream',
    provider:'openai-compatible',model:'local-model',temperature:.1,topP:.9,maxTokens:900,timeoutMs:8000,retries:2,circuitFailures:3,circuitCooldownMs:30000
  });
  const AI_PROFILES=Object.freeze({
    research:{temperature:.35,topP:.9,maxTokens:1800,responseSchema:'strategy-candidate-v1'},
    classification:{temperature:0,topP:.2,maxTokens:500,responseSchema:'classified-signal-v1'},
    code:{temperature:.1,topP:.85,maxTokens:2400,responseSchema:'code-artifact-v1'},
    board:{temperature:.2,topP:.8,maxTokens:1200,responseSchema:'investment-memo-v1'},
    audit:{temperature:0,topP:.1,maxTokens:1000,responseSchema:'security-findings-v1'}
  });
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,Number(x)));
  function isLocalHost(host){return host==='localhost'||host==='127.0.0.1'||host==='[::1]'}
  function validateUrl(value,{websocket=false}={}){try{const u=new URL(value),local=isLocalHost(u.hostname),allowed=websocket?(u.protocol==='wss:'||(local&&u.protocol==='ws:')):(u.protocol==='https:'||(local&&u.protocol==='http:'));return{valid:allowed,local,protocol:u.protocol,host:u.hostname,reason:allowed?'':`Se requiere ${websocket?'wss':'https'} fuera de localhost`}}catch(e){return{valid:false,local:false,reason:'URL inválida'}}}
  function normalizePath(v,fallback){const x=String(v||fallback).trim();return('/'+x.replace(/^\/+/,'' )).replace(/\/{2,}/g,'/')}
  function sanitize(raw={}){const environment=['development','staging','production'].includes(raw.environment)?raw.environment:DEFAULTS.environment;return{
    environment,backendBaseUrl:String(raw.backendBaseUrl||DEFAULTS.backendBaseUrl).replace(/\/+$/,''),healthPath:normalizePath(raw.healthPath,DEFAULTS.healthPath),agentPath:normalizePath(raw.agentPath,DEFAULTS.agentPath),streamUrl:String(raw.streamUrl||DEFAULTS.streamUrl),
    provider:String(raw.provider||DEFAULTS.provider).slice(0,60),model:String(raw.model||DEFAULTS.model).slice(0,100),temperature:clamp(raw.temperature??DEFAULTS.temperature,0,2),topP:clamp(raw.topP??DEFAULTS.topP,0,1),maxTokens:Math.round(clamp(raw.maxTokens??DEFAULTS.maxTokens,64,8192)),timeoutMs:Math.round(clamp(raw.timeoutMs??DEFAULTS.timeoutMs,500,60000)),retries:Math.round(clamp(raw.retries??DEFAULTS.retries,0,5)),circuitFailures:Math.round(clamp(raw.circuitFailures??DEFAULTS.circuitFailures,1,20)),circuitCooldownMs:Math.round(clamp(raw.circuitCooldownMs??DEFAULTS.circuitCooldownMs,1000,300000))
  }}
  function validate(config){const c=sanitize(config),api=validateUrl(c.backendBaseUrl),stream=validateUrl(c.streamUrl,{websocket:true}),errors=[];if(!api.valid)errors.push(`API: ${api.reason}`);if(!stream.valid)errors.push(`Stream: ${stream.reason}`);if(c.environment==='production'&&(api.local||stream.local))errors.push('Producción no puede apuntar a localhost');return{valid:errors.length===0,errors,config:c}}
  class ConfigStore{constructor(storage,key='qcf-platform-config'){this.storage=storage;this.key=key}load(){try{return sanitize(JSON.parse(this.storage?.getItem(this.key)||'{}'))}catch(e){return sanitize()}}save(raw){const out=validate(raw);if(!out.valid)throw new Error(out.errors.join('; '));this.storage?.setItem(this.key,JSON.stringify(out.config));return out.config}clear(){this.storage?.removeItem(this.key);return sanitize()}}
  class CircuitBreaker{constructor({failures=3,cooldownMs=30000}={}){this.limit=failures;this.cooldownMs=cooldownMs;this.failures=0;this.openedAt=0}get state(){if(!this.openedAt)return'closed';if(Date.now()-this.openedAt>=this.cooldownMs)return'half-open';return'open'}allow(){return this.state!=='open'}success(){this.failures=0;this.openedAt=0}failure(){this.failures++;if(this.failures>=this.limit)this.openedAt=Date.now()}snapshot(){return{state:this.state,failures:this.failures,retryInMs:this.state==='open'?Math.max(0,this.cooldownMs-(Date.now()-this.openedAt)):0}}}
  class InfraHealth{
    constructor({alpha=.2,window=31,zLimit=3.5}={}){this.alpha=alpha;this.window=window;this.zLimit=zLimit;this.samples=[];this.ewma=null}
    add(value,at=Date.now()){value=Number(value);if(!Number.isFinite(value))throw new Error('sample must be finite');this.ewma=this.ewma===null?value:this.alpha*value+(1-this.alpha)*this.ewma;this.samples.push({value,at});if(this.samples.length>this.window)this.samples.shift();return this.snapshot(value)}
    snapshot(current=this.samples.at(-1)?.value||0){const xs=this.samples.map(x=>x.value).sort((a,b)=>a-b),median=xs.length?xs[Math.floor(xs.length/2)]:0,deviations=xs.map(x=>Math.abs(x-median)).sort((a,b)=>a-b),mad=deviations.length?deviations[Math.floor(deviations.length/2)]:0,robustZ=mad?0.6745*(current-median)/mad:0,anomaly=Math.abs(robustZ)>this.zLimit;return{current,ewma:this.ewma??0,median,mad,robustZ,anomaly,count:xs.length}}
  }
  function agentRequest(config,agentId,input,profile='classification'){const c=sanitize(config),params={...AI_PROFILES[profile],temperature:c.temperature,top_p:c.topP,max_tokens:c.maxTokens};return{url:c.backendBaseUrl+c.agentPath,body:{request_id:`qcf_${Date.now()}`,agent_id:agentId,input,model:{provider:c.provider,name:c.model,...params},policy:{paper_only:true,timeout_ms:c.timeoutMs}},timeoutMs:c.timeoutMs,retries:c.retries}}
  class PlatformClient{
    constructor(config,fetcher=typeof fetch==='function'?fetch.bind(globalThis):null){this.config=sanitize(config);this.fetcher=fetcher;this.breaker=new CircuitBreaker({failures:this.config.circuitFailures,cooldownMs:this.config.circuitCooldownMs})}
    update(config){this.config=sanitize(config);this.breaker=new CircuitBreaker({failures:this.config.circuitFailures,cooldownMs:this.config.circuitCooldownMs});return this}
    async execute(agentId,input,profile='classification'){
      if(!this.fetcher)throw new Error('fetch unavailable');if(!this.breaker.allow())throw new Error('circuit-open');const req=agentRequest(this.config,agentId,input,profile);let last;
      for(let attempt=0;attempt<=req.retries;attempt++){const controller=typeof AbortController!=='undefined'?new AbortController():null,timer=controller?setTimeout(()=>controller.abort(),req.timeoutMs):null;try{const response=await this.fetcher(req.url,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(req.body),signal:controller?.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json();const result=normalizeAgentResult(data,agentId);this.breaker.success();return{...result,attempt:attempt+1}}catch(e){last=e;if(attempt===req.retries)this.breaker.failure()}finally{if(timer)clearTimeout(timer)}}throw last
    }
  }
  function normalizeAgentResult(raw={},agentId='unknown'){const signal=clamp(raw.signal??0,-1,1),confidence=clamp(raw.confidence??0,0,1),evidence=Array.isArray(raw.evidence)?raw.evidence.slice(0,20).map(String):[];return{agentId:String(raw.agent_id||raw.agentId||agentId),version:String(raw.version||'external'),status:raw.status==='error'?'error':'ok',signal,confidence,evidence,latencyMs:Math.max(0,Number(raw.latency_ms??raw.latencyMs??0)),at:String(raw.at||new Date().toISOString()),source:'gateway'}}
  return{DEFAULTS,AI_PROFILES,validateUrl,sanitize,validate,ConfigStore,CircuitBreaker,InfraHealth,agentRequest,PlatformClient,normalizeAgentResult};
});
