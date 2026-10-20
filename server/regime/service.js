'use strict';
const M=require('./math.js');
const STATES=[
 {name:'risk_on_low_vol',mu:[.0006,.008,.018,.0005],sigma:[.001,.006,.025,.0005],riskMultiplier:1,allowed:['momentum','breakout','carry']},
 {name:'range_mean_reverting',mu:[0,.014,0,.0008],sigma:[.001,.008,.018,.0007],riskMultiplier:.8,allowed:['mean_reversion','market_neutral','options_income']},
 {name:'trend_high_vol',mu:[.0002,.035,.04,.0015],sigma:[.002,.015,.05,.001],riskMultiplier:.6,allowed:['trend','volatility','hedged_momentum']},
 {name:'risk_off_crisis',mu:[-.0015,.05,-.07,.003],sigma:[.003,.025,.07,.002],riskMultiplier:.35,allowed:['cash','protective_put','short_trend']}
];
const TRANSITION=[[.88,.07,.04,.01],[.08,.82,.08,.02],[.05,.08,.78,.09],[.02,.04,.14,.80]];
class RegimeService{
 constructor({record=async()=>{}}={}){this.record=record;this.latest=new Map()}
 analyze({asset='BTC',candles=[],book={}}={}){const prices=candles.map(x=>Number(x.close)).filter(x=>x>0);if(prices.length<60)throw Object.assign(new Error('regime-requires-60-candles'),{status:422});const rs=M.returns(prices),obs=M.features(prices,Number(book?.spreadBps||0)),probabilities=M.hmm(obs,STATES,TRANSITION),index=probabilities.indexOf(Math.max(...probabilities)),state=STATES[index],cp=M.changePoint(rs),uncertainty=-probabilities.reduce((s,p)=>p?s+p*Math.log(p):s,0)/Math.log(probabilities.length),result={asset,at:new Date().toISOString(),regime:state.name,probability:probabilities[index],probabilities:Object.fromEntries(STATES.map((s,i)=>[s.name,probabilities[i]])),expectedDuration:1/(1-TRANSITION[index][index]),transitionRisk:1-TRANSITION[index][index],riskMultiplier:cp.probability>.8?state.riskMultiplier*.75:state.riskMultiplier,allowedStrategies:state.allowed,blockedStrategies:STATES.flatMap(x=>x.allowed).filter(x=>!state.allowed.includes(x)),diagnostics:{meanReturn:M.mean(rs.slice(-20)),volatility:M.std(rs.slice(-20))*Math.sqrt(365*24),hurst:M.hurst(prices.slice(-120)),entropy:M.entropy(rs.slice(-60)),changePointProbability:cp.probability,changePointZ:cp.z,uncertainty}};this.latest.set(asset,result);this.record('regime.analysis',result).catch(()=>{});return result}
 status(){return{states:STATES.map(x=>({name:x.name,riskMultiplier:x.riskMultiplier,allowed:x.allowed})),latest:Object.fromEntries(this.latest),transition:TRANSITION}}
}
module.exports={RegimeService,STATES,TRANSITION};
