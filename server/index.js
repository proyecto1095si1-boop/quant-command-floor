'use strict';
require('./env.js').loadEnv();
const {createGateway}=require('./gateway.js');
const gateway=createGateway();
gateway.listen().then(address=>console.log(`Quant Command Floor gateway listening on http://${address.address}:${address.port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>gateway.close().finally(()=>process.exit(0)));
