// src/lib/macro/replay.test.ts
// Offline replay (spec §1.1 criterion 2, §4.4, §12): recorded evidence bytes → TS parsers → memory
// DB → derive → publish. Re-parsing the same bytes gives identical value_text and locators, and every
// observation in the published manifest traces (through derived_from) to a retrieval whose sha256 is
// listed in the fixture manifest. No network.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {MACRO_CATALOG,catalogById} from './catalog';
import type {MacroDb} from './db';
import {deriveSeries} from './derive';
import {evidencePath,sha256Hex} from './evidence';
import {memoryMacroDb} from './memory-db';
import {parseFredCsv} from './parsers/fred-csv';
import {parserFor} from './parsers/index';
import {publishRegion} from './snapshots';
import {overviewEnvelope} from './views';
import {SEED_BATCH,seedCatalog} from './testing/seed';
import type {Adapter,Locator,ObservationRow,ParsedPoint,Region} from './types';

vi.setConfig({testTimeout:60_000});   // derivation now really runs over every replayed series (it used to see empty inputs)
const TODAY='2026-11-06';
const DIRS:Record<Region,string>={US:join(__dirname,'fixtures','fred'),CN:join(__dirname,'fixtures','cn')};

// ── Part B adapters (Step 0: written against Tasks 4/5/8/9 of this plan; assertions stay unchanged) ──
interface FixtureEntry{file:string;sha256:string;adapter:Adapter;fetch_url:string;fetch_host:string;content_type:string;fetched_at:string;series_ids:string[]}
function readManifest(region:Region,dir:string):FixtureEntry[]{
 const raw=JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8'));
 if(region==='US')return (raw as {code:string;series_id:string;url:string;fetched_at:string;sha256:string;content_type:string}[]).map(m=>({
  file:`${m.code}.csv`,sha256:m.sha256,adapter:'fred_csv',fetch_url:m.url,fetch_host:new URL(m.url).hostname,content_type:m.content_type,fetched_at:m.fetched_at,series_ids:[m.series_id]}));
 return (raw as {files:{series_id:string;file:string;url:string;content_type:string;fetched_at:string;sha256:string}[]}).files.map(f=>({
  file:f.file,sha256:f.sha256,adapter:'akshare',fetch_url:f.url,fetch_host:new URL(f.url).hostname,content_type:f.content_type,fetched_at:f.fetched_at,series_ids:[f.series_id]}));
}
function parseFixture(seriesId:string,adapter:Adapter,bytes:Uint8Array):ParsedPoint[]{
 const def=catalogById(seriesId);
 if(!def?.source)throw new Error(`no source for ${seriesId}`);
 if(adapter==='fred_csv')return parseFredCsv(bytes,{seriesId,code:def.source.seriesKey,period:def.period});
 const p=parserFor(seriesId);
 if(!p)throw new Error(`no parser for ${seriesId}`);
 return p.parse(bytes);
}
async function deriveAll(db:MacroDb,region:Region):Promise<void>{
 // month_end/index_minus_100/yoy inputs are native, so one pass in catalog order suffices
 for(const def of MACRO_CATALOG.filter(d=>d.region===region&&d.derive&&d.status==='active')){
  const inputs=await db.eligibleHistory(def.derive!.from,{includeBatch:SEED_BATCH,maxRows:20000});   // the seed batch is still running here: public reads would hide it
  const writes=deriveSeries(def,inputs,{now:new Date(`${TODAY}T06:00:00.000Z`)});
  if(writes.length===0)continue;
  const res=await db.writeObservations(SEED_BATCH,'replay',writes);
  expect(res.conflicts,def.id).toEqual([]);
 }
}
// ── end adapters ──

export interface Replayed{db:MacroDb;entries:FixtureEntry[];dir:string}
export async function replayRegion(region:Region):Promise<Replayed>{
 const db=memoryMacroDb();await seedCatalog(db);
 db.setBatchStatus(SEED_BATCH,'running');   // the memory twin writes only into a declared running batch
 const dir=DIRS[region];const entries=readManifest(region,dir);
 for(const e of entries){
  const bytes=new Uint8Array(readFileSync(join(dir,e.file)));
  expect(sha256Hex(bytes),e.file).toBe(e.sha256);   // the manifest describes exactly these bytes
  const retrievalId=await db.putRetrieval(
   {sha256:e.sha256,object_path:evidencePath(e.adapter,e.sha256,e.content_type),adapter:e.adapter,content_type:e.content_type,byte_length:bytes.length},
   {fetch_url:e.fetch_url,fetch_host:e.fetch_host,http_status:200,fetched_at:e.fetched_at,batch_id:SEED_BATCH,tool_versions:{replay:'1'}});
  for(const sid of e.series_ids){
   const def=catalogById(sid);
   if(!def||def.status!=='active')continue;   // missing/restricted series are never written
   const points=parseFixture(sid,e.adapter,bytes);
   const res=await db.writeObservations(SEED_BATCH,'replay',points.map(p=>({series_id:p.seriesId,period_end:p.periodEnd,value_text:p.valueText,
    available_at:e.fetched_at,revisable:def.revisionPolicy==='revisable',retrieval_id:retrievalId,locator:p.locator})));
   expect(res.conflicts,sid).toEqual([]);
  }
 }
 await deriveAll(db,region);
 db.setBatchStatus(SEED_BATCH,'success');   // public reads and publishing see finished batches only
 const receipt=await publishRegion({db,env:{}},region,TODAY);
 expect(receipt.status).toBe('published');
 return {db,entries,dir};
}
/** sha256 of every evidence object behind an observation (native: its retrieval; derived: all inputs, recursively). */
export async function evidenceShasOf(db:MacroDb,row:ObservationRow,depth=0):Promise<string[]>{
 if(row.retrieval_id){const r=await db.retrieval(row.retrieval_id);return r?[r.sha256]:[];}
 if(!row.derived_from||depth>=4)return [];
 const inputs=await db.observationsByIds(row.derived_from);
 if(inputs.length!==row.derived_from.length)return [];   // an unreadable input breaks the trace
 return (await Promise.all(inputs.map(i=>evidenceShasOf(db,i,depth+1)))).flat();
}

// ── independent evidence reader (deliberately NOT the parsers): reads a value back from raw bytes at a locator ──
function splitCsvLine(l:string):string[]{return l.split(',');}   // fixture CSVs have no quoted commas
function readBack(bytes:Uint8Array,loc:Locator):string{
 const text=new TextDecoder().decode(bytes);
 if(loc.kind==='csv_row')return splitCsvLine(text.split(/\r?\n/)[loc.line-1])[loc.column].trim();
 if(loc.kind==='json_pointer'){
  let cur:unknown=JSON.parse(text);
  for(const raw of loc.pointer.split('/').slice(1)){
   const k=raw.replace(/~1/g,'/').replace(/~0/g,'~');
   cur=(cur as Record<string,unknown>)[k];
  }
  return String(cur);
 }
 const noComments=text.replace(/<!--[\s\S]*?-->/g,'');
 const tableStarts=[...noComments.matchAll(/<table\b/gi)];
 const from=tableStarts[loc.table].index!;
 const end=noComments.indexOf('</table>',from);
 const rows=[...noComments.slice(from,end).matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map(m=>m[0]);
 const cells=[...rows[loc.row].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m=>m[1].replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim());
 return cells[loc.cell];
}
const numEq=(a:string,b:string)=>Number(a.replace(/,/g,''))===Number(b);
describe.each(['US','CN'] as const)('replay %s evidence read-back',(region)=>{
 it('derives the expected indicators; every derived row reaches a native row with a manifest sha; every native value reads back from the evidence bytes',async()=>{
  const {db,entries,dir}=await replayRegion(region);
  const known=new Set(entries.map(e=>e.sha256));
  const expectedDerived=region==='US'?['US_CPI_YOY','US_DGS10']:['CN_CPI_YOY'];
  const derivedIds=MACRO_CATALOG.filter(d=>d.region===region&&d.derive&&d.status==='active').map(d=>d.id);
  for(const id of expectedDerived){
   expect(derivedIds,id).toContain(id);
   expect((await db.eligibleHistory(id,{maxRows:20000})).length,id).toBeGreaterThan(0);
  }
  let derivedSeen=0,nativeRead=0;
  for(const id of derivedIds){
   for(const row of await db.eligibleHistory(id,{maxRows:20000})){
    derivedSeen++;
    const shas=await evidenceShasOf(db,row);
    expect(shas.length,`${id}|${row.period_end}`).toBeGreaterThan(0);
    for(const s of shas)expect(known.has(s),`${id} → ${s}`).toBe(true);
   }
  }
  expect(derivedSeen).toBeGreaterThan(0);
  for(const e of entries){
   const bytes=new Uint8Array(readFileSync(join(dir,e.file)));
   for(const sid of e.series_ids){
    if(catalogById(sid)?.status!=='active')continue;
    for(const row of await db.eligibleHistory(sid,{maxRows:20000})){
     if(!row.locator||!row.retrieval_id||(await db.retrieval(row.retrieval_id))!.sha256!==e.sha256)continue;
     expect(numEq(readBack(bytes,row.locator),row.value_text),`${sid}|${row.period_end}|${JSON.stringify(row.locator)}`).toBe(true);
     nativeRead++;
    }
   }
  }
  expect(nativeRead).toBeGreaterThan(0);
 });
});
describe('replay CN html_cell goldens (hard-coded from the fixture files, not derived by any parser)',()=>{
 it.each([
  ['CN_CGB_10Y_D','2026-11-06','1.5868',{kind:'html_cell',table:1,row:1,cell:8}],     // CN_CGB_10Y_D-00.html line 201: <td>1.5868</td>
  ['CN_USDCNY_CP_D','2026-11-06','671.68',{kind:'html_cell',table:4,row:1,cell:1}],   // CN_USDCNY_CP_D-00.html line 285
  ['CN_USDCNY_CP_D','2026-01-05','702.3',{kind:'html_cell',table:4,row:203,cell:1}],  // CN_USDCNY_CP_D-00.html line 16647
 ] as const)('%s %s = %s',async(sid,period,value,locator)=>{
  const {db}=await replayRegion('CN');
  const row=(await db.eligibleHistory(sid,{maxRows:20000})).find(r=>r.period_end===period)!;
  expect(row.value_text).toBe(value);
  expect(row.locator).toEqual(locator);
 });
});
describe.each(['US','CN'] as const)('replay %s',(region)=>{
 it('re-parsing the same bytes yields identical value_text and locators, equal to the stored rows',async()=>{
  const {db,entries,dir}=await replayRegion(region);
  let checked=0;
  for(const e of entries){
   const bytes=new Uint8Array(readFileSync(join(dir,e.file)));
   for(const sid of e.series_ids){
    if(catalogById(sid)?.status!=='active')continue;
    const a=parseFixture(sid,e.adapter,bytes),b=parseFixture(sid,e.adapter,new Uint8Array(bytes));
    expect(b).toEqual(a);
    const stored=await db.seriesHistory(sid,{maxRows:20000});
    const byPeriod=new Map(a.map(p=>[p.periodEnd,p]));
    for(const row of stored){
     const p=byPeriod.get(row.period_end);
     if(!p)continue;   // the period came from another retrieval of the same series
     expect({value_text:row.value_text,locator:row.locator}).toEqual({value_text:p.valueText,locator:p.locator});
     checked++;
    }
   }
  }
  expect(checked).toBeGreaterThan(0);
 });
 it('every manifest observation traces to a retrieval whose sha256 is in the fixture manifest',async()=>{
  const {db,entries}=await replayRegion(region);
  const known=new Set(entries.map(e=>e.sha256));
  const snap=await db.activeSnapshot(region);
  expect(snap!.observation_ids.length).toBeGreaterThan(0);
  const rows=await db.observationsByIds(snap!.observation_ids);
  expect(rows).toHaveLength(snap!.observation_ids.length);
  for(const row of rows){
   const shas=await evidenceShasOf(db,row);
   expect(shas.length,`${row.series_id}|${row.period_end}`).toBeGreaterThan(0);
   for(const s of shas)expect(known.has(s),`${row.series_id} → ${s}`).toBe(true);
  }
 });
 it('two independent replays publish the same facts',async()=>{
  const facts=async()=>{const {db}=await replayRegion(region);const s=await db.activeSnapshot(region);
   return (await db.observationsByIds(s!.observation_ids)).map(r=>`${r.series_id}|${r.period_end}|${r.value_text}|${r.version}`).sort();};
  expect(await facts()).toEqual(await facts());
 });
});
describe.each(['US','CN'] as const)('replay %s → overview',(region)=>{
 it('every value shown on the overview traces to a fixture retrieval and equals the replayed observation',async()=>{
  const {db,entries}=await replayRegion(region);
  const known=new Set(entries.map(e=>e.sha256));
  const env=await overviewEnvelope({db,tables:memoryTableClient({dq_freshness:['dataset']})},region,TODAY);
  const shown=env.indicators.filter(r=>r.value_text!==null);
  expect(shown.length).toBeGreaterThan(0);
  const snap=await db.activeSnapshot(region);
  const manifest=await db.observationsByIds(snap!.observation_ids);
  for(const row of shown){
   const obs=manifest.find(o=>o.series_id===row.series_id&&o.period_end===row.period_end)!;
   expect(obs.value_text).toBe(row.value_text);
   expect(row.retrieval_id).not.toBeNull();
   const r=await db.retrieval(row.retrieval_id!);
   expect(known.has(r!.sha256),row.series_id).toBe(true);
   for(const s of await evidenceShasOf(db,obs))expect(known.has(s)).toBe(true);
  }
 });
});
