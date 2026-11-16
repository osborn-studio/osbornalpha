// Reproducible CPU benchmark; no network, persistence, authentication or production latency is simulated.
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import type {Boundary,ManifestInput,StoredManifest,StrategyPolicyEvent} from './contract';
import {buildCycleTable} from './cycle-table';
import {canonicalJson,freezeDef,manifestHash,monthEnd} from './manifest';
import {FIXTURE_CATALOG} from './testing/fixture';

const series=['US_DGS10','CN_CGB_10Y','US_WTI','US_DTWEXBGS','CN_USDCNY_CP'];
const columns=['US_UST10Y','CN_CGB10Y','US_WTI','US_DTWEXBGS','CN_USDCNY_CP','US_SP500','UNKNOWN'];
const date=(day:number)=>new Date(Date.UTC(2000,0,1+day)).toISOString().slice(0,10);
function fixture(boundary:Boundary,offset=0):StoredManifest{
 const inputs:ManifestInput[]=[];
 const row=(id:string,d:string,value:number,tag:string):ManifestInput=>({series_id:id,role:`col:${id}:${tag}`,observation_id:`${id}:${d}`,period_end:d,value_text:`${value}.1234567890123456789`,version:1,available_at:`${d}T00:00:00Z`,source:{kind:'history',as_of:'2025-01-01T00:00:00Z'}});
 for(const id of series){
  for(let i=0;i<9000;i++)inputs.push(row(`${id}_D`,date(i),100+i+offset,'history'));
  for(let i=0;i<300;i++){const ym=`${2000+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`;inputs.push(row(id,monthEnd(ym),100+i+offset,'month_end'));}
 }
 // Unsorted frozen input and equal-period duplicates exercise stable selection semantics.
 inputs.reverse();
 inputs.push({...inputs[0],observation_id:'duplicate-period',value_text:'999.999'});
 const events:StrategyPolicyEvent[]=Array.from({length:120},(_,i)=>({kind:'policy_target_change',region:'US',effective_date:date(100+i*70),upper_from:'1',upper_to:'1.25',lower_from:'0.75',lower_to:'1',change_bp:Math.floor(i/2)%2?'-25':'25',source:'derived',evidence:['a','b','c','d'],version:'macro-events/1',basis:'range'}));
 const body:StoredManifest['body']={kind:'cycle_table',params:{boundary,columns:canonicalJson(columns)},cutoff:'2025-01-01T00:00:00Z',snapshots:{US:null,CN:null},catalog:FIXTURE_CATALOG.map(freezeDef),reads:[],inputs,events,gaps:[],catalog_version:'fixture',method_version:'macro-cycle-table/1',code_version:'fixture'};
 return {body,manifest_id:'00000000-0000-4000-8000-000000000003',manifest_hash:manifestHash(body),created_at:body.cutoff};
}
const digest=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
it('preserves complete cycle views and frozen provenance across representative histories',()=>{
 const results=[];
 for(const boundary of ['event_day','first_trading_day','month_end'] as const){
  const stored=fixture(boundary),before=canonicalJson(stored.body);
  const view=buildCycleTable(stored);
  expect(view.episodes).toHaveLength(60);
  expect(view.cells['0']['US_UST10Y'].status).toBe('ok');
  const hash=digest(view);
  // Pinned from the pre-optimization evaluator, including endpoint evidence and exact decimals.
  const expected:Record<Boundary,string>={event_day:'9120bcc21abae674315feb8846e18031980eadd273e7858f995adccb268c185f',first_trading_day:'5e407947b3e919fe199c62c2e92db4afeaa867dbb691ee4289b268dbcd34b7ec',month_end:'52770204efdf63557655d1c36217251a3306a242c7f1d43a0189c827a8da6f2d'};
  expect(hash).toBe(expected[boundary]);
  expect(canonicalJson(stored.body)).toBe(before);
  expect(manifestHash(stored.body)).toBe(stored.manifest_hash);
  // Request-local prepared histories must not leak across manifests or calls.
  const other=buildCycleTable(fixture(boundary,500));
  expect(other.cells['0']['US_UST10Y']).not.toEqual(view.cells['0']['US_UST10Y']);
  expect(buildCycleTable(stored)).toEqual(view);
  const samples:number[]=[];
  for(let i=0;i<17;i++){const start=performance.now();buildCycleTable(stored);if(i>=2)samples.push(performance.now()-start);}
  samples.sort((a,b)=>a-b);
  results.push({boundary,inputs:stored.body.inputs.length,episodes:view.episodes.length,hash,samples_ms:samples,median_ms:samples[7],p95_ms:samples[14]});
 }
 if(process.env.MACRO_CYCLE_BENCHMARK_OUTPUT)writeFileSync(process.env.MACRO_CYCLE_BENCHMARK_OUTPUT,JSON.stringify({node:process.version,results},null,2));
},30000);

it('bounds history preparation work independently of episode count',()=>{
 const stored=fixture('event_day');
 let roleReads=0;
 stored.body.inputs=stored.body.inputs.map(row=>new Proxy(row,{get(target,key,receiver){if(key==='role')roleReads++;return Reflect.get(target,key,receiver);}}));
 expect(buildCycleTable(stored).episodes).toHaveLength(60);
 // Five active columns: at most one full manifest scan for each, rather than one per cell.
 expect(roleReads).toBeLessThanOrEqual(stored.body.inputs.length*5);
});
