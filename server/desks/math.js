'use strict';
const clamp=(x,a=-1,b=1)=>Math.max(a,Math.min(b,Number(x)||0)),mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0,std=xs=>{const m=mean(xs);return Math.sqrt(mean(xs.map(x=>(x-m)**2)))};
function ema(xs,period){if(!xs.length)return 0;const k=2/(period+1);return xs.slice(1).reduce((v,x)=>x*k+v*(1-k),xs[0])}
function rsi(closes,period=14){if(closes.length<period+1)return 50;const d=closes.slice(-period-1).slice(1).map((x,i)=>x-closes.slice(-period-1)[i]),gain=mean(d.map(x=>Math.max(0,x))),loss=mean(d.map(x=>Math.max(0,-x)));return loss?100-100/(1+gain/loss):100}
function atr(candles,period=14){if(candles.length<2)return 0;const rows=candles.slice(-period-1),tr=rows.slice(1).map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-rows[i].close),Math.abs(x.low-rows[i].close)));return mean(tr)}
function zscore(x,xs){const s=std(xs);return s?(x-mean(xs))/s:0}
function quantile(xs,q){if(!xs.length)return 0;const a=[...xs].sort((x,y)=>x-y),i=(a.length-1)*q,lo=Math.floor(i),hi=Math.ceil(i);return a[lo]+(a[hi]-a[lo])*(i-lo)}
function result(agent,signal,confidence,evidence,metrics={}){return{agent,version:'math-1.0.0',status:'ok',signal:clamp(signal),confidence:clamp(confidence,0,1),evidence:evidence.slice(0,12),metrics}}
module.exports={clamp,mean,std,ema,rsi,atr,zscore,quantile,result};
