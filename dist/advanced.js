(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.QCFAdvanced=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const erf=x=>{const s=Math.sign(x),a=Math.abs(x),t=1/(1+.3275911*a),y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-a*a);return s*y},cdf=x=>(1+erf(x/Math.sqrt(2)))/2;
  function blackScholes({spot,strike,time,rate=0,vol,type='put'}){const d1=(Math.log(spot/strike)+(rate+vol*vol/2)*time)/(vol*Math.sqrt(time)),d2=d1-vol*Math.sqrt(time),call=spot*cdf(d1)-strike*Math.exp(-rate*time)*cdf(d2),put=strike*Math.exp(-rate*time)*cdf(-d2)-spot*cdf(-d1),delta=type==='call'?cdf(d1):cdf(d1)-1;return{price:type==='call'?call:put,delta,d1,d2}}
  function triangularArbitrage(rates,fees=.001){const path=['USDT','ETH','UNI','USDT'];let amount=1;for(let i=0;i<3;i++){const r=rates[`${path[i]}_${path[i+1]}`];if(!r)return{valid:false,profit:0,path};amount*=r*(1-fees)}return{valid:true,profit:amount-1,path}}
  const fundingYield=({fundingRate,periodsPerYear=1095,borrowRate=0,fees=0})=>fundingRate*periodsPerYear-borrowRate-fees;
  const gasPlan=(samples,urgency=.5)=>{const sorted=[...samples].sort((a,b)=>a-b),i=Math.min(sorted.length-1,Math.floor((.25+.5*urgency)*sorted.length));return{target:sorted[i]||0,percentile:Math.round((.25+.5*urgency)*100)}};
  const reconcile=(expected,actual,tolerance=.01)=>Object.keys({...expected,...actual}).map(asset=>({asset,expected:expected[asset]||0,actual:actual[asset]||0,diff:(actual[asset]||0)-(expected[asset]||0)})).map(x=>({...x,ok:Math.abs(x.diff)<=tolerance}));
  return{blackScholes,triangularArbitrage,fundingYield,gasPlan,reconcile};
});
