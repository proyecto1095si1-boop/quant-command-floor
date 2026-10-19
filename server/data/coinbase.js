'use strict';
const N=require('./normalizers.js');
const {environmentFetch}=require('./http-client.js');
class CoinbaseConnector{
  constructor({baseUrl='https://api.exchange.coinbase.com',fetcher=environmentFetch,timeoutMs=8000,retries=2,userAgent='quant-command-floor/0.3'}={}){this.baseUrl=baseUrl.replace(/\/$/,'' );this.fetcher=fetcher;this.timeoutMs=timeoutMs;this.retries=retries;this.userAgent=userAgent;this.stats={requests:0,errors:0,lastSuccessAt:0,lastLatencyMs:0}}
  async get(route){let last;for(let attempt=0;attempt<=this.retries;attempt++){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs),started=Date.now();try{this.stats.requests++;const response=await this.fetcher(this.baseUrl+route,{headers:{accept:'application/json','user-agent':this.userAgent},signal:controller.signal});if(!response.ok)throw new Error(`coinbase-http-${response.status}`);const data=await response.json();this.stats.lastSuccessAt=Date.now();this.stats.lastLatencyMs=Date.now()-started;return data}catch(e){last=e;this.stats.errors++;if(attempt<this.retries)await new Promise(r=>setTimeout(r,Math.min(1000,100*2**attempt+Math.random()*50)))}finally{clearTimeout(timer)}}throw last}
  ticker(product){return this.get(`/products/${encodeURIComponent(product)}/ticker`).then(x=>N.coinbaseTicker(product,x))}
  book(product,level=2){return this.get(`/products/${encodeURIComponent(product)}/book?level=${Math.max(1,Math.min(2,level))}`).then(x=>N.coinbaseBook(product,x))}
  trades(product,limit=100){return this.get(`/products/${encodeURIComponent(product)}/trades?limit=${Math.max(1,Math.min(1000,limit))}`).then(x=>N.coinbaseTrades(product,x))}
  candles(product,{granularity=60,start,end}={}){const qs=new URLSearchParams({granularity:String(granularity)});if(start)qs.set('start',new Date(start).toISOString());if(end)qs.set('end',new Date(end).toISOString());return this.get(`/products/${encodeURIComponent(product)}/candles?${qs}`).then(x=>N.coinbaseCandles(product,x,granularity))}
  health(){const age=this.stats.lastSuccessAt?Date.now()-this.stats.lastSuccessAt:Infinity,errorRate=this.stats.requests?this.stats.errors/this.stats.requests:0;return{source:'coinbase',status:age<30000&&errorRate<.2?'healthy':age<120000?'degraded':'down',ageMs:age,errorRate,lastLatencyMs:this.stats.lastLatencyMs,...this.stats}}
}
module.exports={CoinbaseConnector};
