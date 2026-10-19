(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.QCFOps=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  class RiskEngine{
    constructor(limits={}){this.limits={maxDrawdown:.12,maxVaR:.05,maxExposure:.45,maxCorrelation:.9,minLiquidity:3,...limits};this.halted=false}
    halt(on=true){this.halted=on}
    kelly(winRate,payoff,fraction=.25){if(payoff<=0)return 0;return clamp(fraction*((winRate*(payoff+1)-1)/payoff),0,.1)}
    evaluate(p,ctx={}){const checks=[['system',!this.halted],['drawdown',(ctx.drawdown||0)<=this.limits.maxDrawdown],['VaR',(ctx.var||0)<=this.limits.maxVaR],['exposure',((ctx.exposure||0)+(p.notional||0))/(ctx.equity||1)<=this.limits.maxExposure],['correlation',(ctx.correlation||0)<=this.limits.maxCorrelation],['liquidity',(ctx.liquidityScore??10)>=this.limits.minLiquidity]];const failed=checks.filter(x=>!x[1]).map(x=>x[0]);return{approved:!failed.length,decision:failed.length?'VETO':'APPROVE',failed,checks:checks.map(([name,pass])=>({name,pass}))}}
  }
  class PaperBroker{
    constructor(opts={}){this.cash=opts.cash||100000;this.fee=opts.fee??.0006;this.slippage=opts.slippage??.0005;this.positions={};this.ledger=[];this.ids=new Set();this.risk=opts.risk||new RiskEngine()}
    submit(order,market,ctx={}){if(!order.id||this.ids.has(order.id))return{status:'rejected',reason:'duplicate-id'};this.ids.add(order.id);const px=+market.price,qty=Math.max(0,+order.qty),notional=px*qty,review=this.risk.evaluate({...order,notional},{equity:this.equity(px),...ctx});if(!review.approved){const row={type:'veto',order,review,at:Date.now()};this.ledger.push(row);return{status:'veto',review}}const fillPx=px*(1+(order.side==='buy'?1:-1)*this.slippage),fee=fillPx*qty*this.fee;if(order.side==='buy'&&fillPx*qty+fee>this.cash)return{status:'rejected',reason:'insufficient-cash'};const sign=order.side==='buy'?1:-1;this.cash-=sign*fillPx*qty+fee;this.positions[order.symbol]=(this.positions[order.symbol]||0)+sign*qty;const fill={type:'fill',id:order.id,symbol:order.symbol,side:order.side,qty,price:fillPx,fee,at:Date.now(),paper:true};this.ledger.push(fill);return{status:'filled',fill,review}}
    twap(parent,market,ctx={},parts=5){return Array.from({length:parts},(_,i)=>this.submit({...parent,id:`${parent.id}:${i+1}`,qty:parent.qty/parts},market,ctx))}
    equity(mark){return this.cash+Object.values(this.positions).reduce((a,q)=>a+q*mark,0)}
    reconcile(){const fees=this.ledger.filter(x=>x.type==='fill').reduce((a,x)=>a+x.fee,0);return{cash:this.cash,positions:{...this.positions},fills:this.ledger.filter(x=>x.type==='fill').length,vetos:this.ledger.filter(x=>x.type==='veto').length,fees}}
  }
  return{RiskEngine,PaperBroker};
});
