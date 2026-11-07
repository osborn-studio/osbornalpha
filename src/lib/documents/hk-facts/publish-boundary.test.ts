// F3 review (codex Task 13 F1): the HK publish boundary, statically. spec-2's publish_sync_run is landed and
// not ours to change, so a service_role caller COULD publish an HK run through it (documented in
// fact-citations.integration.test.ts as an accepted residual risk and an interface request to spec-2:
// market-aware authorization on publish_sync_run). What F3 guarantees is that none of ITS code does:
// outside the landed src/lib/facts/*, nothing calls publish_sync_run / publishRun except the in-memory
// stand-in of publish_hk_run (facts-port.ts, after its evidence check) and the integration test that
// documents the bypass. HkFactsPort exposes no generic publish.
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';
import {describe,expect,it} from 'vitest';

const ROOT=process.cwd();
const ALLOWED=new Set(['src/lib/documents/hk-facts/facts-port.ts','src/lib/documents/fact-citations.integration.test.ts','src/lib/documents/hk-facts/publish-boundary.test.ts']);
function walk(dir:string,out:string[]=[]):string[]{
 for(const n of readdirSync(dir)){
  if(n==='node_modules'||n.startsWith('.'))continue;
  const p=join(dir,n);const st=statSync(p);
  if(st.isDirectory())walk(p,out);else if(/\.(ts|tsx|mjs|js)$/.test(n))out.push(p);
 }
 return out;
}
describe('HK publish boundary',()=>{
 it('only publish_hk_run publishes HK: no other file outside src/lib/facts calls publish_sync_run or publishRun',()=>{
  const offenders=[...walk(join(ROOT,'src')),...walk(join(ROOT,'scripts'))].map(f=>relative(ROOT,f))
   .filter(f=>!f.startsWith('src/lib/facts/')&&!ALLOWED.has(f))
   .filter(f=>/publish_sync_run|\bpublishRun\b/.test(readFileSync(join(ROOT,f),'utf8')));
  expect(offenders).toEqual([]);
 });
 it('facts-port.ts exposes no generic publishRun on HkFactsPort and reaches the spec-2 publish exactly once, after assertEvidence',()=>{
  const src=readFileSync(join(ROOT,'src/lib/documents/hk-facts/facts-port.ts'),'utf8');
  const iface=src.slice(src.indexOf('export interface HkFactsPort{'),src.indexOf('type PassThrough'));
  expect(iface).not.toMatch(/publishRun|publish_sync_run/);
  expect(src.match(/facts\.publishRun\(/g)).toHaveLength(1);
  expect(src.indexOf('assertEvidence(run);')).toBeGreaterThan(-1);
  expect(src.indexOf('assertEvidence(run);')).toBeLessThan(src.indexOf('facts.publishRun('));
 });
});
