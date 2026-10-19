import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {checkMap} from './workshop/quick-check.mjs';
const root=new URL('./',import.meta.url),catalog=JSON.parse(fs.readFileSync(new URL('catalog.json',root))),id=Number(process.argv[2]),map=catalog.maps.find(x=>x.id===id);
if(!map){console.error('用法：node accept-map.mjs <地图编号>');process.exit(1);}
const folder=new URL(map.directory+'/',root),read=f=>fs.readFileSync(new URL(f,folder));
const atlas=JSON.parse(read('territories.json')),data=read('territories.u16'),ids=new Uint16Array(data.buffer,data.byteOffset,data.byteLength/2),examples=JSON.parse(read('demo-pairs.json'));
const began=performance.now();
try{const report=checkMap(atlas,ids,examples,undefined,JSON.parse(fs.readFileSync(new URL('ui/manifest.json',root))));Object.assign(report,{mapId:id,durationMs:Math.round(performance.now()-began),atlasSha256:createHash('sha256').update(read('territories.json')).digest('hex'),idsSha256:createHash('sha256').update(data).digest('hex')});fs.writeFileSync(new URL('quick-acceptance.json',folder),JSON.stringify(report,null,2));console.log(JSON.stringify({mapId:id,passed:true,scenarios:report.results.length,durationMs:report.durationMs}));}
catch(error){fs.writeFileSync(new URL('quick-acceptance.json',folder),JSON.stringify({mapId:id,passed:false,error:error.message},null,2));console.error(error.message);process.exit(1);}
