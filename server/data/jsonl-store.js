'use strict';
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const safe=x=>String(x).replace(/[^A-Za-z0-9_.-]/g,'_');
class JsonlStore{
  constructor(root,{clock=()=>new Date()}={}){this.root=path.resolve(root);this.clock=clock;this.queues=new Map()}
  file(stream,at=this.clock()){return path.join(this.root,safe(stream),at.toISOString().slice(0,10)+'.jsonl')}
  append(stream,event){const file=this.file(stream),previous=this.queues.get(file)||Promise.resolve(),next=previous.then(async()=>{await fsp.mkdir(path.dirname(file),{recursive:true});const payload=JSON.stringify(event),checksum=crypto.createHash('sha256').update(payload).digest('hex');await fsp.appendFile(file,JSON.stringify({checksum,payload:event})+'\n',{mode:0o600});return{file,checksum}});this.queues.set(file,next.catch(()=>{}));return next}
  async replay(stream,{from=0,to=Infinity,limit=10000}={}){const dir=path.join(this.root,safe(stream));if(!fs.existsSync(dir))return[];const files=(await fsp.readdir(dir)).filter(x=>x.endsWith('.jsonl')).sort(),out=[];for(const name of files){const lines=(await fsp.readFile(path.join(dir,name),'utf8')).split('\n').filter(Boolean);for(const line of lines){const row=JSON.parse(line),payload=JSON.stringify(row.payload),checksum=crypto.createHash('sha256').update(payload).digest('hex');if(checksum!==row.checksum)throw new Error(`checksum-mismatch:${name}`);const at=Date.parse(row.payload.exchangeAt||row.payload.receivedAt||0);if(at>=from&&at<=to)out.push(row.payload);if(out.length>=limit)return out}}return out}
  async flush(){await Promise.all([...this.queues.values()])}
}
module.exports={JsonlStore};
