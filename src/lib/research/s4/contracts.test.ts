import {describe,it,expect,vi} from 'vitest';
import Ajv from 'ajv';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {digest,sha256} from '../ingest/pa-v1/json.js';
import observationSchema from '../../../../docs/handoffs/alpha-s4/alpha-observation-contract.schema.json';
import golden from '../../../../docs/handoffs/alpha-s4/alpha-observation-golden.json';
import klineSchema from '../../../../docs/handoffs/alpha-s4/kline-dto.schema.json';
import hashes from '../../../../docs/handoffs/alpha-s4/contract-hashes.json';
const mocks=vi.hoisted(()=>({resolve:vi.fn()}));
vi.mock('@/lib/data/kline/reliability',async original=>({...await original<typeof import('@/lib/data/kline/reliability')>(),resolveKline:mocks.resolve}));
import {GET} from '@/app/api/kline/[ticker]/route';
const root=join(process.cwd(),'docs/handoffs/alpha-s4');
describe('frozen S5 contracts',()=>{
 it('validates golden and rejects unfrozen rules, results, or invented fields',()=>{
  const validate=new Ajv({strict:true}).compile(observationSchema);
  expect(validate(golden),JSON.stringify(validate.errors)).toBe(true);
  for(const patch of [{market_policy_hash:'b'.repeat(64)},{status:'resolved'},{actual_start_at:'2026-09-23'},{unexpected:1}])expect(validate({...golden,...patch})).toBe(false);
 });
 it('independently verifies all committed byte and JCS digests',()=>{
  for(const [name,h] of Object.entries(hashes.files)){const raw=readFileSync(join(root,name));expect(sha256(raw),name).toBe(h.file_sha256);expect(digest(JSON.parse(raw.toString())),name).toBe(h.jcs_sha256);}
 });
 it('validates synthetic success, adjustment, fallback and missing DTOs',()=>{
  const validate=new Ajv({strict:true}).compile(klineSchema);
  for(const name of ['qfq','hfq','none','missing','empty']){const value=JSON.parse(readFileSync(join(root,`kline-${name}.synthetic.json`),'utf8'));expect(validate(value),JSON.stringify(validate.errors)).toBe(true);}
 });
 it('matches actual route output for qfq/hfq/none (provider synthetic, route real)',async()=>{
  const validate=new Ajv({strict:true}).compile(klineSchema);
  for(const adjustment of ['qfq','hfq','none']){
   mocks.resolve.mockResolvedValue({source:'eastmoney',bars:[{time:'2026-08-10',open:10,high:12,low:9,close:11,volume:100}],adjustment,volumeUnit:'shares',previousClose:9,availableBars:1,warmupCloses:[],asOfFallback:'2026-08-10',freshness:'fresh',fallbackUsed:false,cacheStatus:'shared-swr',completeness:'partial',partial:false,warnings:['partial_coverage'],fetchedAt:'2026-08-12T00:00:00.000Z'});
   const res=await GET(new Request(`http://localhost/api/kline/000001?range=1m&adjust=${adjustment}`),{params:Promise.resolve({ticker:'000001'})});const body=await res.json();
   expect(res.status).toBe(200);expect(validate(body),JSON.stringify(validate.errors)).toBe(true);expect(body.meta.adjustment).toBe(adjustment);
  }
 });
});
