const assert=require('node:assert/strict'),{executeLLM,safeBase,extract}=require('../server/llm-client.js');
(async()=>{
  assert.equal(safeBase('http://localhost:11434/v1'),'http://localhost:11434/v1');assert.throws(()=>safeBase('file:///tmp/model'));
  assert.deepEqual(extract('{"signal":2,"confidence":-1,"evidence":["a"]}'),{signal:1,confidence:0,evidence:['a']});
  let authorization='';const result=await executeLLM({agent_id:'Macro News Reader',input:{headline:'CPI'},model:{name:'qwen',temperature:.1},policy:{timeout_ms:1000}},{baseUrl:'http://localhost:11434/v1',apiKey:'secret',fetcher:async(url,options)=>{authorization=options.headers.authorization;return{ok:true,json:async()=>({choices:[{message:{content:'{"signal":0.3,"confidence":0.8,"evidence":["CPI"]}'}}]})}}});
  assert.equal(authorization,'Bearer secret');assert.equal(result.signal,.3);assert.equal(result.version,'llm:qwen');console.log('llm client tests: ok');
})().catch(e=>{console.error(e);process.exit(1)});
