'use strict';
require('./env.js').loadEnv();
const {createGateway}=require('./gateway.js');
const {MarketDataService}=require('./data/service.js');
const gateway=createGateway(),products=(process.env.MARKET_PRODUCTS||'BTC-USD,ETH-USD').split(',').map(x=>x.trim()).filter(Boolean),data=new MarketDataService({products,pollMs:Number(process.env.MARKET_POLL_MS||5000),publish:gateway.publish});if(process.env.MARKET_WS_ENABLED==='true')data.enableStream();gateway.setDataService(data);
gateway.listen().then(async address=>{console.log(`Quant Command Floor gateway listening on http://${address.address}:${address.port}`);if(process.env.MARKET_DATA_ENABLED!=='false'){try{await data.start();console.log(`Market data online: ${products.join(', ')}`)}catch(e){console.error(`Market data degraded: ${e.message}`)}}});
const maintenance=setInterval(async()=>{try{await data.store.compact({before:new Date(Date.now()-86400000)});await data.store.enforceRetention({days:Number(process.env.DATA_RETENTION_DAYS||30)})}catch(e){console.error(`Storage maintenance degraded: ${e.message}`)}},Number(process.env.DATA_MAINTENANCE_MS||3600000));maintenance.unref();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(maintenance);data.stop().then(()=>gateway.close()).finally(()=>process.exit(0))});
