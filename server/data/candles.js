'use strict';
class CandleAggregator{
  constructor(timeframes=[60,300,900,3600]){this.timeframes=[...new Set(timeframes.map(Number))].sort((a,b)=>a-b);this.current=new Map()}
  add(trade){const closed=[];for(const seconds of this.timeframes){const ms=seconds*1000,start=Math.floor(Date.parse(trade.exchangeAt||trade.receivedAt)/ms)*ms,key=`${trade.symbol}:${seconds}`,existing=this.current.get(key);if(existing&&Date.parse(existing.openTime)!==start){existing.complete=true;closed.push({...existing});this.current.delete(key)}const candle=this.current.get(key)||{type:'candle',source:trade.source,symbol:trade.symbol,timeframeSec:seconds,openTime:new Date(start).toISOString(),closeTime:new Date(start+ms-1).toISOString(),open:trade.price,high:trade.price,low:trade.price,close:trade.price,volume:0,trades:0,complete:false};candle.high=Math.max(candle.high,trade.price);candle.low=Math.min(candle.low,trade.price);candle.close=trade.price;candle.volume+=trade.size;candle.trades++;candle.receivedAt=trade.receivedAt;this.current.set(key,candle)}return closed}
  snapshots(symbol){return[...this.current.values()].filter(x=>!symbol||x.symbol===symbol).map(x=>({...x}))}
}
module.exports={CandleAggregator};
