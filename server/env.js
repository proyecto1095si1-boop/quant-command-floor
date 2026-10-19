'use strict';
const fs=require('node:fs'),path=require('node:path');
function loadEnv(file=path.resolve(process.cwd(),'.env')){if(!fs.existsSync(file))return false;for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const row=line.trim();if(!row||row.startsWith('#'))continue;const i=row.indexOf('=');if(i<1)continue;const key=row.slice(0,i).trim();if(!/^[A-Z][A-Z0-9_]*$/.test(key)||process.env[key]!==undefined)continue;let value=row.slice(i+1).trim();if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);process.env[key]=value}return true}
module.exports={loadEnv};
