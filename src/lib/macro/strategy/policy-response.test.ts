// policy-response.ts (spec §5.3): N-month windows (worked example 2022-03-16), eligibility, cross-direction greedy
// independence over closed month ranges (a shared endpoint month overlaps), exclusion reasons, n<5, type-7 stats, QE/QT,
// restricted / not-in-catalog columns, non-positive base, spread endpoints, truncated reads, coverage, sentences, the
// window N frozen in manifest.params.
import {describe,expect,it} from 'vitest';
import type {Cell,ManifestInput,ManifestRead,StoredManifest,StrategyManifest,StrategyPolicyEvent} from './contract';
import {freezeDef,manifestHash,monthEnd} from './manifest';
import {canonicalJson} from './hash';
import {RESPONSE_DIMS_V1} from './data/response-dims-v1';
import {cellSentence} from './policy-response-explain';
import {add} from './numeric';
import {buildPolicyResponse,buildPolicyResponseManifest} from './policy-response';
import {memoryStrategyPort} from './port';
import {FIXTURE_CATALOG,fixture,monthly,snap} from './testing/fixture';

const CUTOFF='2026-11-03T06:02:00Z';
const ev=(d:string,bp:string):StrategyPolicyEvent=>({kind:'policy_target_change',region:'US',effective_date:d,upper_from:'0',upper_to:'0',lower_from:'0',lower_to:'0',change_bp:bp,source:'derived',evidence:['a','b','c','d'],version:'macro-events/1',basis:'range'});
/** Monthly inputs 'dim:<id>:month_end' from [YYYY-MM, value|null]. */
function series(id:string,pts:[string,string|null][]):ManifestInput[]{
 return pts.flatMap(([ym,v])=>v===null?[]:[{series_id:id,role:`dim:${id}:month_end`,observation_id:`obs:${id}:${monthEnd(ym)}:v1`,period_end:monthEnd(ym),value_text:v,version:1,available_at:`${monthEnd(ym)}T12:00:00Z`,source:{kind:'history' as const,as_of:CUTOFF}}]);
}
/** Consecutive months from first, one value each. */
const run=(first:string,vals:(string|null)[]):[string,string|null][]=>vals.map((v,i)=>{const [y,m]=first.split('-').map(Number);const t=y*12+m-1+i;return [`${Math.floor(t/12)}-${String(t%12+1).padStart(2,'0')}`,v];});
function manifest(events:StrategyPolicyEvent[],inputs:ManifestInput[],reads:ManifestRead[]=[]):StoredManifest{
 const body:StrategyManifest={kind:'policy_response',params:{},cutoff:CUTOFF,snapshots:{US:null,CN:null},catalog:FIXTURE_CATALOG.map(freezeDef),reads,inputs,events,gaps:[],catalog_version:'macro-catalog/test',method_version:'macro-policy-response/1',code_version:'test'};
 return {manifest_id:'00000000-0000-4000-8000-000000000002',manifest_hash:manifestHash(body),body,created_at:CUTOFF};
}
/** The view for window N: N is a manifest parameter, so each N is its own stored manifest (same frozen data, other identity). */
function view(m:StoredManifest,window:1|3|6){const body={...m.body,params:{window,dims:canonicalJson(RESPONSE_DIMS_V1)}};return buildPolicyResponse({...m,manifest_hash:manifestHash(body),body});}
const cell=(v:ReturnType<typeof buildPolicyResponse>,dir:'hike'|'cut'|'qe_qt',dim:string):Cell=>v.rows.find(r=>r.direction===dir)!.cells[dim];
const eventsOf=(c:Cell)=>'events' in c?c.events:[];

describe('window endpoints',()=>{
 const m=manifest([ev('2022-03-16','25')],series('US_DGS10',run('2022-01',['1.70','1.83','2.32','2.89','2.85','2.98','2.67','3.15'])));
 it('worked example: 2022-03-16, N=3 → base 2022-02 month end, end 2022-05 month end, exact bp',()=>{
  const r=eventsOf(cell(view(m,3),'hike','US_DGS10'))[0];
  expect(r.base?.period_end).toBe('2022-02-28');expect(r.end?.period_end).toBe('2022-05-31');
  expect(r.change_text).toBe('102');expect(r.change_raw).toBe(102);expect(r.selected).toBe(true);expect(r.exclusion).toBeNull();
  expect(r.base?.inputs.map(i=>i.observation_id)).toEqual(['obs:US_DGS10:2022-02-28:v1']);
 });
 it('N=1 → 2022-02 to 2022-03; N=6 → 2022-02 to 2022-08',()=>{
  const r1=eventsOf(cell(view(m,1),'hike','US_DGS10'))[0];
  expect([r1.base?.period_end,r1.end?.period_end,r1.change_text]).toEqual(['2022-02-28','2022-03-31','49']);
  const r6=eventsOf(cell(view(m,6),'hike','US_DGS10'))[0];
  expect([r6.base?.period_end,r6.end?.period_end,r6.change_text]).toEqual(['2022-02-28','2022-08-31','132']);
 });
 it('a missing month inside the window → incomplete_window; a missing endpoint → missing_endpoint',()=>{
  const gap=manifest([ev('2022-03-16','25')],series('US_DGS10',run('2022-01',['1.70','1.83','2.32',null,'2.85','2.98'])));
  expect(eventsOf(cell(view(gap,3),'hike','US_DGS10'))[0]).toMatchObject({exclusion:'incomplete_window',selected:false,change_text:null});
  expect(eventsOf(cell(view(gap,1),'hike','US_DGS10'))[0].exclusion).toBeNull();
  expect(eventsOf(cell(view(gap,6),'hike','US_DGS10'))[0]).toMatchObject({exclusion:'missing_endpoint',end:null});
 });
});

describe('independence across directions',()=>{
 const m=manifest([ev('2022-03-16','25'),ev('2022-04-20','-25'),ev('2022-09-21','75')],series('US_DGS10',run('2022-01',['1','1.1','1.2','1.3','1.4','1.5','1.6','1.7','1.8','1.9','2','2.1'])));
 it('N=3: the cut whose base month precedes the selected hike end month is excluded as overlap',()=>{
  const v=view(m,3);
  expect(eventsOf(cell(v,'cut','US_DGS10'))[0]).toMatchObject({effective_date:'2022-04-20',exclusion:'overlap',selected:false,change_text:'30'});
  expect(eventsOf(cell(v,'hike','US_DGS10')).map(r=>[r.effective_date,r.selected])).toEqual([['2022-03-16',true],['2022-09-21',true]]);
 });
 it('N=1: windows are closed month ranges, so sharing an endpoint month is an overlap',()=>{
  // hike [2022-02, 2022-03], cut [2022-03, 2022-04]: base 2022-03 = last selected end 2022-03 → overlap
  const v=view(m,1);
  expect(eventsOf(cell(v,'cut','US_DGS10'))[0]).toMatchObject({selected:false,exclusion:'overlap'});
  expect(eventsOf(cell(v,'hike','US_DGS10')).map(r=>[r.effective_date,r.selected])).toEqual([['2022-03-16',true],['2022-09-21',true]]);
 });
 it('events are scanned in effective-date order whatever the manifest order',()=>{
  const shuffled=manifest([ev('2022-09-21','75'),ev('2022-04-20','-25'),ev('2022-03-16','25')],m.body.inputs);
  expect(JSON.stringify(view(shuffled,3).rows)).toBe(JSON.stringify(view(m,3).rows));
 });
 it('an ineligible event does not block a later one',()=>{
  // the hike's window [2022-02, 2022-05] lacks March → incomplete_window; the cut is then the first eligible event and is selected
  const g=manifest([ev('2022-03-16','25'),ev('2022-05-18','-25')],series('US_DGS10',run('2022-01',['1','1.1',null,'1.3','1.4','1.5','1.6'])));
  const v=view(g,3);
  expect(eventsOf(cell(v,'hike','US_DGS10'))[0].exclusion).toBe('incomplete_window');
  expect(eventsOf(cell(v,'cut','US_DGS10'))[0]).toMatchObject({selected:true,exclusion:null,change_text:'30'});
 });
});

describe('cells',()=>{
 // hikes in 2020-02, -06, -10, 2021-02, -06 each move US_DGS10 by +10..+50 bp in their own month, flat otherwise
 const bumps:Record<string,string>={'2020-02':'0.1','2020-06':'0.2','2020-10':'0.3','2021-02':'0.4','2021-06':'0.5'};
 let level='1';const pts=run('2020-01',Array(20).fill('')).map(([ym])=>{level=add(level,bumps[ym]??'0');return [ym,level] as [string,string];});
 const hikes=Object.keys(bumps).map(ym=>ev(`${ym}-15`,'25'));
 it('n ≥ 5 → median and type-7 quartiles at full precision',()=>{
  const c=cell(view(manifest(hikes,series('US_DGS10',pts)),1),'hike','US_DGS10');
  expect(c).toMatchObject({status:'stats',n:5,median_raw:30,q1_raw:20,q3_raw:40,unit:'bp'});
 });
 it('1 ≤ n < 5 → events only; n = 0 → insufficient',()=>{
  const v=view(manifest(hikes.slice(0,4),series('US_DGS10',pts)),1);
  expect(cell(v,'hike','US_DGS10')).toMatchObject({status:'events_only',n:4});
  expect(cell(v,'cut','US_DGS10')).toMatchObject({status:'insufficient',events:[]});
 });
 it('pct uses (end/base − 1) × 100 once as a float and keeps the exact text; base ≤ 0 is excluded',()=>{
  const m=manifest([ev('2022-03-16','25'),ev('2022-09-21','75')],series('US_WTI',[['2022-02','80'],['2022-03','100'],['2022-08','0'],['2022-09','5']]));
  const rows=eventsOf(cell(view(m,1),'hike','US_WTI'));
  expect(rows[0].change_text).toBe('100/80');expect(rows[0].change_raw).toBeCloseTo(25,12);   // exact ratio; rounded once at display
  expect(rows[1]).toMatchObject({exclusion:'non_positive_base',change_raw:null});
 });
 it('QE/QT row is missing; restricted and not-in-catalog columns are whole-column states',()=>{
  const v=view(manifest([ev('2022-03-16','25')],series('US_DGS10',run('2022-01',['1','1.1','1.2']))),1);
  expect(cell(v,'qe_qt','US_DGS10')).toEqual({status:'missing',reason:{zh:'目录无联储资产负债表序列',en:'No Fed balance-sheet series in the catalog'}});
  expect(cell(v,'hike','US_SP500').status).toBe('restricted');expect(cell(v,'qe_qt','CN_CSI300').status).toBe('restricted');
  expect(cell(v,'cut','CN_NORTHBOUND').status).toBe('not_in_catalog');
  expect(v.dims.find(d=>d.id==='US_SP500')?.kind).toBe('restricted');
  expect(cell(v,'hike','US_DTWEXBGS')).toMatchObject({status:'insufficient'});   // active, no data → every event missing_endpoint
  expect(eventsOf(cell(v,'hike','US_DTWEXBGS'))[0].exclusion).toBe('missing_endpoint');
 });
 it('spread endpoints are exact same-month differences carrying both inputs; coverage is the joint range',()=>{
  const m=manifest([ev('2022-03-16','25')],[...series('US_DGS10',run('2022-01',['1.70','1.83','2.32'])),...series('CN_CGB_10Y',run('2022-02',['2.80','2.79','2.83']))]);
  const v=view(m,1);
  const r=eventsOf(cell(v,'hike','US_CN_10Y_SPREAD'))[0];
  expect(r.base).toMatchObject({period_end:'2022-02-28',value_text:'-0.97'});
  expect(r.base?.inputs.map(i=>i.series_id)).toEqual(['US_DGS10','CN_CGB_10Y']);
  expect(r.end?.value_text).toBe('-0.47');expect(r.change_text).toBe('50');
  expect(v.dims.find(d=>d.id==='US_CN_10Y_SPREAD')?.coverage).toEqual({from:'2022-02-28',to:'2022-03-31'});
 });
 it('a truncated history read makes the column missing (history_truncated)',()=>{
  const v=view(manifest([ev('2022-03-16','25')],[],[{series_id:'US_DGS10',purpose:'dim',state:'truncated'}]),1);
  expect(cell(v,'hike','US_DGS10')).toMatchObject({status:'missing'});
  expect(JSON.stringify(cell(v,'hike','US_DGS10'))).toContain('history_truncated');
 });
});

describe('sentences and manifest',()=>{
 it('one number-only sentence per stats cell',()=>{
  const bumps:Record<string,string>={'2020-02':'0.1','2020-04':'0.2','2020-06':'0.3','2020-08':'0.4','2020-10':'0.5'};
  let level='1';const pts=run('2020-01',Array(12).fill('')).map(([ym])=>{level=add(level,bumps[ym]??'0');return [ym,level] as [string,string];});
  // hikes every other month, N=1: windows [01,02], [03,04], … never share a month → all five selected (+10 … +50 bp)
  const v=view(manifest(Object.keys(bumps).map(ym=>ev(`${ym}-10`,'25')),series('US_DGS10',pts)),1);
  expect(v.sentences).toEqual([{zh:'5 次独立加息后 1 个月末，美国 10 年期国债收益率变化的中位数为 30 bp（四分位 20 bp 至 40 bp）',en:'After 5 independent hikes, the median change in U.S. 10-year Treasury yield over 1 month-end was 30 bp (interquartile 20 bp to 40 bp)'}]);
 });
 it('buildPolicyResponseManifest freezes events and monthly histories; the view is pure over it',async()=>{
  const us=snap('US',CUTOFF,[]);
  const f=fixture({snapshots:[us],observations:[...monthly('US_DGS10','2022-01',['1.70','1.83','2.32','2.89']),
   {...monthly('US_DGS10','2022-05',['9'])[0],available_at:'2026-12-01T00:00:00Z'}]});
  const body=await buildPolicyResponseManifest(memoryStrategyPort(f),{now:new Date('2026-11-05T00:00:00Z'),codeVersion:'test',window:3});
  expect(body.params).toEqual({window:3,dims:canonicalJson(RESPONSE_DIMS_V1)});
  const n1=await buildPolicyResponseManifest(memoryStrategyPort(f),{now:new Date('2026-11-05T00:00:00Z'),codeVersion:'test',window:1});
  expect(manifestHash(n1)).not.toBe(manifestHash(body));   // N is part of the identity
  expect(buildPolicyResponse({manifest_id:'00000000-0000-4000-8000-000000000002',manifest_hash:manifestHash(n1),body:n1,created_at:CUTOFF}).window).toBe(1);
  expect(body.kind).toBe('policy_response');expect(body.cutoff).toBe(CUTOFF);expect(body.snapshots.US?.snapshot_id).toBe(us.snapshot_id);
  expect(body.inputs.filter(i=>i.role==='dim:US_DGS10:month_end').map(i=>i.value_text)).toEqual(['1.70','1.83','2.32','2.89']);
  expect(body.reads.find(r=>r.series_id==='US_WTI')?.state).toBe('missing');
  expect(body.reads.some(r=>r.series_id==='US_SP500')).toBe(false);
  expect(body.catalog.find(d=>d.id==='US_SP500')?.status).toBe('restricted');
  expect(body.events).toEqual([]);expect(body.method_version).toBe('macro-policy-response/1');
 });
});

describe('rounding (half away from zero) and frozen dimensions',()=>{
 const dim={id:'D',label:{zh:'某',en:'X'},unit:'bp',kind:'series',coverage:{from:null,to:null}} as const;
 const stats=(median_raw:number,q1_raw:number,q3_raw:number):Cell=>({status:'stats',n:5,median_raw,q1_raw,q3_raw,unit:'bp',events:[]});
 it('half-bp values round away from zero; zero never prints as -0',()=>{
  const s=cellSentence('hike',dim,stats(-1.5,-0.5,2.5),1)!;
  expect(s.en).toContain('was -2 bp (interquartile -1 bp to 3 bp)');
  const z=cellSentence('cut',dim,stats(-0.4,0.4,-0.5),1)!;
  expect(z.en).toContain('was 0 bp (interquartile 0 bp to -1 bp)');
  expect(z.en).not.toContain('-0 bp');
 });
 it('dimension definitions are part of the manifest identity and replay reads only the manifest',async()=>{
  const f=fixture({snapshots:[snap('US',CUTOFF,[])],observations:[...monthly('US_DGS10','2022-01',['1.70','1.83','2.32','2.89'])]});
  const o={now:new Date('2026-11-05T00:00:00Z'),codeVersion:'test',window:1 as const};
  const as=(unit:'pct'|'bp')=>buildPolicyResponseManifest(memoryStrategyPort(f),{...o,dims:[{id:'US_DGS10',label:{zh:'x',en:'x'},unit,kind:'series',series:'US_DGS10'}]});
  const [bp,pct]=[await as('bp'),await as('pct')];
  expect(manifestHash(bp)).not.toBe(manifestHash(pct));
  const st=(b:StrategyManifest):StoredManifest=>({manifest_id:'00000000-0000-4000-8000-000000000002',manifest_hash:manifestHash(b),body:b,created_at:CUTOFF});
  expect(buildPolicyResponse(st(bp)).dims.map(d=>d.unit)).toEqual(['bp']);
  expect(buildPolicyResponse(st(pct)).dims.map(d=>d.unit)).toEqual(['pct']);
  expect(()=>buildPolicyResponse(st({...bp,params:{window:1}}))).toThrow('invalid_manifest_params:dims');
 });
});
