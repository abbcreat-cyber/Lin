// One geometry implementation for browser, acceptance and package generation.
import fs from 'node:fs';
import {clipPlayableMap} from './workshop/playable-area.mjs';
const folder=process.argv[2],layout=JSON.parse(fs.readFileSync(new URL('./ui/manifest.json',import.meta.url)));
const atlas=JSON.parse(fs.readFileSync(folder+'/territories.json')),bytes=fs.readFileSync(folder+'/territories.u16');
const result=clipPlayableMap(atlas,new Uint16Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/2),layout);
process.stdout.write(JSON.stringify({atlas:result.atlas,idsBase64:Buffer.from(result.ids.buffer).toString('base64')}));
