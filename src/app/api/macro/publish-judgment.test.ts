// Real production composition -> routes -> publishRegion -> F4 produce/register, with local persistence.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import {memoryMacroDb} from '@/lib/macro/memory-db';
import {macroReadApi} from '@/lib/macro/read-api';
import {evidencePath} from '@/lib/macro/evidence';
import {collectableOf} from '@/lib/macro/catalog';
import {macroDb,macroInputsDb,loadMacroFixture} from '@/lib/judgments/testing/macro-fixture';
import {productionMacroJudgmentHook} from '@/lib/judgments/on-macro-published';
import {compensateMacro} from '@/lib/judgments/compensate';

const wiring=vi.hoisted(()=>({macro:vi.fn(),tables:vi.fn(),judgments:vi.fn(),evidence:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({})}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({})}));
vi.mock('@/lib/macro/db',async original=>({...await original<typeof import('@/lib/macro/db')>(),supabaseMacroDb:wiring.macro}));
vi.mock('@/lib/macro/evidence',async original=>({...await original<typeof import('@/lib/macro/evidence')>(),supabaseEvidenceStore:wiring.evidence}));
vi.mock('@/lib/db/table-client',async original=>({...await original<typeof import('@/lib/db/table-client')>(),supabaseTableClient:wiring.tables}));
vi.mock('@/lib/judgments/deps',()=>({productionJudgmentDeps:wiring.judgments}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:()=> 'a'.repeat(40)}));
import {GET as sync} from '../cron/macro-sync/route';
import {POST as ingest} from './ingest/route';

let db:Awaited<ReturnType<typeof macroDb>>,macro:ReturnType<typeof memoryMacroDb>;
let inputDb:ReturnType<typeof macroInputsDb>;
let fail=false;
beforeEach(async()=>{
 vi.clearAllMocks();vi.stubEnv('MACRO_JUDGMENTS_ENABLED','1');vi.stubEnv('CRON_SECRET','test-secret');vi.stubEnv('MACRO_INGEST_SECRET','test-secret');
 db=await macroDb('active');db.setNow(new Date().toISOString());fail=false;
 const tables=memoryTableClient({ingest_batches:['batch_id'],dq_quarantine:['id'],dq_freshness:['dataset']});
 macro=memoryMacroDb({tables});
 inputDb={...macroInputsDb(loadMacroFixture('us-2026-09-11')),macro:macroReadApi(macro,{judgments:true})};
 wiring.macro.mockReturnValue(macro);wiring.tables.mockReturnValue(tables);
 wiring.evidence.mockReturnValue({put:async(e:import('@/lib/macro/types').EvidenceInput)=>({objectPath:evidencePath(e.adapter,e.sha256,e.contentType),status:'stored'})});
 wiring.judgments.mockImplementation(()=>{if(fail)throw new Error('test setup unavailable');return {db,inputsDb:inputDb,tables:db.tables};});
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{
  const code=new URL(String(input)).searchParams.get('id');
  const def=collectableOf('fred_csv').find(d=>d.source!.seriesKey===code)!;
  return new Response(def.period==='day'?`observation_date,${code}\n2026-06-30,4.0\n2026-07-31,4.1\n2026-08-31,4.2\n2026-09-30,4.3\n2026-10-01,4.3\n`:`observation_date,${code}\n2025-06-01,50\n2025-07-01,50\n2025-08-01,50\n2025-09-01,50\n2026-06-01,51\n2026-07-01,51\n2026-08-01,51\n2026-09-01,51\n`);
 }));
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const runUS=(preview=false)=>sync(new Request(`https://local/api/cron/macro-sync${preview?'?preview=1':''}`,{headers:{authorization:'Bearer test-secret'}}));
const cnPost=(body:unknown)=>ingest(new Request('https://local/api/macro/ingest',{method:'POST',headers:{authorization:'Bearer test-secret'},body:JSON.stringify(body)}));
async function runCN(empty=false){
 const started=await (await cnPost({action:'start',tool_versions:{collector:'test'}})).json();
 if(empty){const finish={action:'finish',batch_id:started.batch_id,owner_token:started.owner_token,total:0,series_outcomes:[]};return {response:await cnPost(finish),finish};}
 const manifest=JSON.parse(readFileSync('src/lib/macro/fixtures/cn/manifest.json','utf8')) as {files:{series_id:string;file:string;sha256:string;url:string;status:number;content_type:string;fetched_at:string}[]};
 // Synthetic bond history supplies the missing 3-month comparison in the recorded fixture;
 // all bytes still pass the real parser, evidence hash, ingest and derivation boundaries.
 const evidence=manifest.files.map(({file,...f})=>{
  const bytes=f.series_id==='CN_CGB_10Y_D'?Buffer.from('<table><tr><td>曲线名称</td><td>日期</td><td>10年</td></tr>'+['2026-06-30','2026-07-31','2026-08-31','2026-09-30','2026-10-31','2026-11-01'].map(date=>`<tr><td>中债国债收益率曲线</td><td>${date}</td><td>2.0</td></tr>`).join('')+'</table>'):readFileSync(`src/lib/macro/fixtures/cn/${file}`);
  return {...f,sha256:createHash('sha256').update(bytes).digest('hex'),fetched_at:new Date().toISOString(),bytes_b64:bytes.toString('base64')};
 });
 const parsers=await import('@/lib/macro/parsers');
 const claims=evidence.flatMap(f=>parsers.parserFor(f.series_id)!.parse(new Uint8Array(Buffer.from(f.bytes_b64,'base64'))).map(p=>({series_id:f.series_id,period_label:p.periodEnd,value_text:p.valueText})));
 const chunk=await cnPost({action:'chunk',batch_id:started.batch_id,owner_token:started.owner_token,seq:0,total:1,evidence,claims});
 expect(chunk.status).toBe(200);
 const finish={action:'finish',batch_id:started.batch_id,owner_token:started.owner_token,total:1,series_outcomes:[...new Set(manifest.files.map(f=>f.series_id))].map(series_id=>({series_id,ok:true}))};
 return {response:await cnPost(finish),finish};
}
async function expectBound(region:'US'|'CN'){
 const snap=await macro.activeSnapshot(region);expect(snap).not.toBeNull();
 const ids=await db.judgmentsBySnapshot(snap!.snapshot_id);expect(ids).toHaveLength(1);
 const row=await db.getJudgment(ids[0]);expect(row).toMatchObject({subject_type:'macro_region',subject_key:region,as_of:snap!.as_of,methodology_id:'macro_regime',methodology_version:'v2',abstained:false});
 return snap!;
}
it('US production sync immediately registers the exact published snapshot through the real producer',async()=>{
 const r=await runUS();expect(r.status).toBe(200);expect((await r.json()).publish).toMatchObject({status:'published',hook:'ok'});
 await expectBound('US');expect(wiring.judgments).toHaveBeenCalledTimes(1);
});
it('CN finish registers once and a keyed finish replay preserves the same judgment',async()=>{
 const {response,finish}=await runCN();expect(response.status).toBe(200);expect((await response.json()).publish).toMatchObject({status:'published',hook:'ok'});
 const snap=await expectBound('CN');expect((await macro.regimeOf(snap.snapshot_id))!.regime!.coverage).toBe(0.6);const ids=await db.judgmentsBySnapshot(snap.snapshot_id);
 expect((await cnPost(finish)).status).toBe(200);expect(await db.judgmentsBySnapshot(snap.snapshot_id)).toEqual(ids);expect(wiring.judgments).toHaveBeenCalledTimes(1);
});
it.each([undefined,'0','true'])('flag %s publishes facts without constructing judgment dependencies',async flag=>{
 vi.stubEnv('MACRO_JUDGMENTS_ENABLED',flag);const r=await runUS();expect((await r.json()).publish.hook).toBe('skipped');expect(wiring.judgments).not.toHaveBeenCalled();
});
it('preview and all-failed sync never create judgments',async()=>{
 expect((await runUS(true)).status).toBe(200);expect(wiring.judgments).not.toHaveBeenCalled();
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('bad csv')));
 const r=await runUS();expect((await r.json()).publish.status).toBe('skipped');expect(wiring.judgments).not.toHaveBeenCalled();
});
it('hook setup failure leaves the valid snapshot published for compensation',async()=>{
 fail=true;const r=await runUS();expect((await r.json()).publish).toMatchObject({status:'published',hook:'failed'});expect(await macro.activeSnapshot('US')).not.toBeNull();
});
it('returned producer failure is visible as hook failed, without rolling back publication',async()=>{
 vi.spyOn(db,'methodology').mockResolvedValue(null);const r=await runUS();expect((await r.json()).publish).toMatchObject({status:'published',hook:'failed'});expect(await macro.activeSnapshot('US')).not.toBeNull();
 expect((db.tables as ReturnType<typeof memoryTableClient>).rows('ingest_batches').filter(b=>b.dataset==='judgments.produce.macro_regime')).toContainEqual(expect.objectContaining({status:'failed'}));
});
it('publication hook and compensation for the same binding retain one idempotent judgment',async()=>{
 await runUS();const snap=await expectBound('US');const ids=await db.judgmentsBySnapshot(snap.snapshot_id);
 await compensateMacro({db,inputsDb:inputDb,tables:db.tables,codeVersion:'a'.repeat(40),triggeredBy:'cron',signal:new AbortController().signal});
 expect(await db.judgmentsBySnapshot(snap.snapshot_id)).toEqual(ids);
});

it('concurrent hook producers for a fresh binding register one judgment and leave the scan marker alone',async()=>{
 await runUS();const previous=await expectBound('US');const state=await macro.publishState('US');
 const published=await macro.republishSnapshot(previous.snapshot_id,state.revision,state.inputRevision);
 const snapshot=(await macro.snapshot(published.snapshot_id))!;
 const get=db.getJudgment.bind(db);let arrivals=0;let release!:()=>void;
 const bothRead=new Promise<void>(resolve=>{release=resolve;});
 vi.spyOn(db,'getJudgment').mockImplementation(async id=>{
  const row=await get(id);
  if(!row){if(++arrivals===2)release();await bothRead;}
  return row;
 });
 const hook=productionMacroJudgmentHook({codeVersion:'a'.repeat(40),triggeredBy:'cron'});
 await Promise.all([hook(snapshot),hook(snapshot)]);
 expect(arrivals).toBe(2);expect(await db.judgmentsBySnapshot(snapshot.snapshot_id)).toHaveLength(1);
 expect(await db.jobState('produce:macro_regime@v2')).toBeNull();
});
it('a newer active snapshot does not retarget an older publication callback',async()=>{
 await runUS();const older=await expectBound('US');
 const state=await macro.publishState('US');
 const newer=await macro.republishSnapshot(older.snapshot_id,state.revision,state.inputRevision);
 const hook=productionMacroJudgmentHook({codeVersion:'a'.repeat(40),triggeredBy:'cron'});
 await hook(older);
 expect(await macro.activeSnapshot('US')).toMatchObject({snapshot_id:newer.snapshot_id});
 expect(await db.judgmentsBySnapshot(older.snapshot_id)).toHaveLength(1);
 expect(await db.judgmentsBySnapshot(newer.snapshot_id)).toHaveLength(0);
});

it('CN preserves the exact flag gate and a no-native-outcomes finish never invokes the hook',async()=>{
 vi.stubEnv('MACRO_JUDGMENTS_ENABLED','true');
 const {response}=await runCN();expect((await response.json()).publish.hook).toBe('skipped');expect(wiring.judgments).not.toHaveBeenCalled();
 vi.stubEnv('MACRO_JUDGMENTS_ENABLED','1');
 const empty=await runCN(true);expect((await empty.response.json()).publish).toMatchObject({status:'skipped',reason:'no_native_outcomes'});expect(wiring.judgments).not.toHaveBeenCalled();
});
it('failed CN hook completes fact publication, replay skips it and compensation can recover',async()=>{
 fail=true;const {response,finish}=await runCN();expect((await response.json()).publish).toMatchObject({status:'published',hook:'failed'});
 const snap=(await macro.activeSnapshot('CN'))!;expect(snap).not.toBeNull();expect(await db.judgmentsBySnapshot(snap.snapshot_id)).toHaveLength(0);
 fail=false;expect((await cnPost(finish)).status).toBe(200);expect(wiring.judgments).toHaveBeenCalledTimes(1);
 await compensateMacro({db,inputsDb:inputDb,tables:db.tables,codeVersion:'a'.repeat(40),triggeredBy:'script',signal:new AbortController().signal});
 await expectBound('CN');
});
