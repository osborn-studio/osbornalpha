// scripts/company/manifest-hash.ts
/**
 * Checks (default) or writes (--write) the sha256 of every fixture listed in src/lib/company/fixtures/manifest.json.
 *   node --import tsx scripts/company/manifest-hash.ts [--write]
 * Exit 0 = all match (or written), 1 = mismatch in check mode, 2 = bad arguments. Touches fixtures[].sha256 only.
 */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {MANIFEST_PATH,type Manifest} from '../../src/lib/company/fixtures/manifest';

const args=process.argv.slice(2);
if(args.some(a=>a!=='--write')){console.error('usage: manifest-hash.ts [--write]');process.exit(2);}
const write=args.includes('--write');
const m=JSON.parse(readFileSync(MANIFEST_PATH,'utf8')) as Manifest;
let mismatch=0;
for(const f of m.fixtures){
 const sha=createHash('sha256').update(readFileSync(f.path)).digest('hex');
 if(sha!==f.sha256){mismatch++;console.log(`${write?'set':'MISMATCH'} ${f.id} ${f.path} ${sha}`);f.sha256=sha;}
}
if(write){writeFileSync(MANIFEST_PATH,`${JSON.stringify(m,null,2)}\n`);console.log(`written (${mismatch} updated)`);}
else if(mismatch>0)process.exit(1);
else console.log('all fixture hashes match');
