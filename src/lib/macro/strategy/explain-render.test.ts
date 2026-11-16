// src/lib/macro/strategy/explain-render.test.ts
import {describe,expect,it} from 'vitest';
import type {Fact,StrategyManifest} from './contract';
import {buildSnapshotFactsManifest,explanationFacts,flattenReviewFacts} from './facts';
import {memoryStrategyPort} from './port';
import {buildReviewManifest,reviewFromManifest} from './review';
import {daily,FIXTURE_CATALOG,fixture,monthly,obs,snap} from './testing/fixture';
import {formatSlot,namesFrom,renderExplanation,renderFact,renderFacts,roundDecimal,roundDecimalToInteger,TEMPLATE_IDS} from './explain-render';
import {FORBIDDEN_TERMS,REGIME_TERMS} from './explain-validate';

const CATALOG=[{id:'US_CPI_YOY',name:{zh:'美国 CPI 同比',en:'US CPI YoY'}},{id:'US_DGS10',name:{zh:'美债 10 年',en:'UST 10Y'}},{id:'CN_CGB_10Y',name:{zh:'中债 10 年',en:'CGB 10Y'}},{id:'US_WTI',name:{zh:'WTI 原油',en:'WTI crude'}}];
const names=namesFrom(CATALOG);
const v=(value_text:string,unit:string)=>({value_text,unit});
const fact=(template:string,slots:Fact['slots'],fact_id=`x:${template}`):Fact=>({fact_id,kind:'level',template,slots,source_inputs:[]});
// One sample per template id with its exact zh / en sentence.
const SAMPLES:[Fact,string,string][]=[
 [fact('level',{series:'US_CPI_YOY',period:'2026-09-30',value:v('2.9','pct')}),'美国 CPI 同比（2026-09-30）为 2.9%。','US CPI YoY (2026-09-30) was 2.9%.'],
 [fact('change',{series:'US_DGS10',prev_period:'2026-08-31',period:'2026-09-30',change:v('-7','bp')}),'美债 10 年 2026-09-30 较 2026-08-31 变化 -7 个基点。','UST 10Y changed by -7 bp from 2026-08-31 to 2026-09-30.'],
 [fact('derived_spread',{a:'US_DGS10',b:'CN_CGB_10Y',period:'2026-09-30',a_value:v('4.16','pct'),b_value:v('1.85','pct'),value:v('2.31','pp_level')}),'2026-09-30 美债 10 年 4.16% 减 中债 10 年 1.85%，利差为 2.31 个百分点。','On 2026-09-30, UST 10Y 4.16% minus CGB 10Y 1.85% gives a spread of 2.31 pp.'],
 [fact('policy_event',{date:'2026-10-28',upper_from:v('3.75','pct'),upper_to:v('4','pct'),lower_from:v('3.5','pct'),lower_to:v('3.75','pct'),change:v('25','bp')}),'2026-10-28 联邦基金目标利率由 3.5%–3.75% 调整为 3.75%–4%（上限变化 +25 个基点）。','On 2026-10-28 the federal funds target moved from 3.5%–3.75% to 3.75%–4% (upper bound +25 bp).'],
 [fact('release',{series:'US_CPI_YOY',prev_period:'2026-08-31',prev_value:v('2.7','pct'),period:'2026-09-30',value:v('2.9','pct')}),'美国 CPI 同比 新发布 2026-09-30 数据 2.9%（基线最新期 2026-08-31：2.7%）。','US CPI YoY released 2026-09-30 at 2.9% (baseline latest 2026-08-31: 2.7%).'],
 [fact('release_first',{series:'US_CPI_YOY',period:'2026-09-30',value:v('2.9','pct')}),'美国 CPI 同比 新发布 2026-09-30 数据 2.9%（基线快照中无此序列）。','US CPI YoY released 2026-09-30 at 2.9% (absent from the baseline snapshot).'],
 [fact('revision',{series:'US_CPI_YOY',period:'2026-08-31',from:v('2.7','pct'),to:v('2.8','pct')}),'美国 CPI 同比 2026-08-31 数据由 2.7% 修订为 2.8%。','US CPI YoY for 2026-08-31 was revised from 2.7% to 2.8%.'],
 [fact('timeliness_late',{series:'US_CPI_YOY',date:'2026-11-03',period:'2026-08-31'}),'截至 2026-11-03，美国 CPI 同比 发布迟于预期（最新期 2026-08-31）。','As of 2026-11-03, US CPI YoY was late (latest period 2026-08-31).'],
 [fact('timeliness_missing',{series:'US_CPI_YOY',date:'2026-11-03'}),'截至 2026-11-03，美国 CPI 同比 在快照中无观测。','As of 2026-11-03, US CPI YoY had no observation in the snapshot.'],
 [fact('episode_opened',{direction:'hike',start:'2026-10-28',end:'2026-10-28',events:v('1','count'),upper_from:v('3.75','pct'),upper_to:v('4','pct'),cumulative:v('25','bp')}),'加息行动段自 2026-10-28 开始，至 2026-10-28 共 1 次变动，上限 3.75% → 4%，累计 +25 个基点。','A hike episode began on 2026-10-28: 1 moves through 2026-10-28, upper bound 3.75% → 4%, cumulative +25 bp.'],
 [fact('episode_ended',{direction:'cut',start:'2025-09-17',end:'2025-12-10',events:v('3','count'),upper_from:v('4.5','pct'),upper_to:v('3.75','pct'),cumulative:v('-75','bp')}),'2025-09-17 至 2025-12-10 的降息行动段已结束（3 次变动，上限 4.5% → 3.75%，累计 -75 个基点）。','The cut episode from 2025-09-17 to 2025-12-10 ended (3 moves, upper bound 4.5% → 3.75%, cumulative -75 bp).'],
 [fact('asset_move',{series:'US_WTI',base_period:'2026-09-30',period:'2026-10-31',from:v('62','usd_per_bbl'),to:v('60.5','usd_per_bbl'),change:v('60.5/62','pct_ratio')}),'WTI 原油 2026-09-30 → 2026-10-31：62 美元/桶 → 60.5 美元/桶（-2.4%）。','WTI crude 2026-09-30 → 2026-10-31: 62 USD/bbl → 60.5 USD/bbl (-2.4%).'],
 [fact('asset_missing',{series:'US_WTI',base_month:'2026-09',month:'2026-10',reason:'out_of_coverage'}),'WTI 原油 2026-09 至 2026-10 无法比较：月末观测不全。','WTI crude 2026-09 to 2026-10 not comparable: month-end observations incomplete.'],
 [fact('coverage',{verified:v('1234','count'),missing:v('4','count'),restricted:v('5','count')}),'快照目录计数：已核实 1,234，缺失 4，受限 5。','Snapshot catalog counts: verified 1,234, missing 4, restricted 5.'],
 [fact('events_truncated',{date:'2026-11-03',sources:'US_FED_TARGET_UPPER_D'}),'截至 2026-11-03，政策事件序列读取被截断（US_FED_TARGET_UPPER_D），本节无法列出。','As of 2026-11-03, the policy event history read was truncated (US_FED_TARGET_UPPER_D); this section cannot be listed.'],
 [fact('baseline_unavailable',{series:'US_CPI_YOY',state:'truncated'}),'美国 CPI 同比 的基线数据读取被截断，无法判断其为新发布或修订。','US CPI YoY baseline data unavailable (read truncated); release and revision could not be determined.'],
 [fact('catalog_unavailable',{series:'US_ISM_PMI',status:'missing'}),'US_ISM_PMI 目录状态：缺失。','US_ISM_PMI catalog status: missing.'],
];

describe('explain-render templates (spec §6.3 输出分工)',()=>{
 it('covers exactly the template ids produced by facts.ts and review.ts',()=>{
  expect([...TEMPLATE_IDS].sort()).toEqual(SAMPLES.map(([f])=>f.template).sort());
 });
 it.each(SAMPLES.map(([f,zh,en])=>[f.template,f,zh,en] as const))('%s renders the fixed zh and en sentences',(_,f,zh,en)=>{
  expect(renderFact(f,'zh',names)).toBe(zh);
  expect(renderFact(f,'en',names)).toBe(en);
 });
 it('no rendered sentence contains a forbidden or regime term',()=>{
  const text=SAMPLES.flatMap(([f])=>[renderFact(f,'zh',names),renderFact(f,'en',names)]).join('\n').toLowerCase();
  for(const t of [...FORBIDDEN_TERMS,...REGIME_TERMS])expect(text.includes(t.toLowerCase()),t).toBe(false);
 });
 it('single-target events render one value, not a range',()=>{
  const f=fact('policy_event',{date:'2008-10-29',upper_from:v('1.5','pct'),upper_to:v('1','pct'),lower_from:v('1.5','pct'),lower_to:v('1','pct'),change:v('-50','bp')});
  expect(renderFact(f,'en',names)).toBe('On 2008-10-29 the federal funds target moved from 1.5% to 1% (upper bound -50 bp).');
 });
 it('fails loudly on an unknown template, a missing slot or a slot of the wrong shape',()=>{
  expect(()=>renderFact(fact('nope',{}),'zh',names)).toThrow('unknown_template:nope');
  expect(()=>renderFact(fact('level',{series:'US_CPI_YOY',period:'2026-09-30'}),'zh',names)).toThrow('missing_slot:level:value');
  expect(()=>renderFact(fact('level',{series:'US_CPI_YOY',period:'2026-09-30',value:'2.9'}),'zh',names)).toThrow('slot_not_value:level:value');
 });
 it('unknown series ids fall back to the id',()=>{
  expect(renderFact(fact('timeliness_missing',{series:'ZZ',date:'2026-11-03'}),'en',names)).toBe('As of 2026-11-03, ZZ had no observation in the snapshot.');
 });
});

describe('number formatting rules',()=>{
 it('bp rounds half away from zero to whole bp without floats',()=>{
  expect(roundDecimalToInteger('12.5')).toBe('13');expect(roundDecimalToInteger('-12.5')).toBe('-13');
  expect(roundDecimalToInteger('12.49')).toBe('12');expect(roundDecimalToInteger('-0.4')).toBe('0');expect(roundDecimalToInteger('7')).toBe('7');
  expect(formatSlot(v('-0.4','bp'),'en')).toBe('0 bp');
 });
 it('percent changes are rounded once from the exact ratio, half away from zero, to one decimal; a zero result has no sign',()=>{
  expect(formatSlot(v('121/120.5','pct_ratio'),'zh')).toBe('+0.4%');expect(formatSlot(v('60.5/62','pct_ratio'),'en')).toBe('-2.4%');
  expect(formatSlot(v('110/100','pct_ratio'),'en')).toBe('+10.0%');
  expect(formatSlot(v('100.04996/100','pct_ratio'),'en')).toBe('0.0%');    // true +0.04996 %: no double rounding up to +0.1 %
  expect(formatSlot(v('99.95004/100','pct_ratio'),'zh')).toBe('0.0%');     // true −0.04996 %
  expect(formatSlot(v('100.05/100','pct_ratio'),'en')).toBe('+0.1%');expect(formatSlot(v('99.95/100','pct_ratio'),'en')).toBe('-0.1%');
  expect(roundDecimal('9.99',1)).toBe('10.0');expect(roundDecimal('0.0049',2)).toBe('0.00');
  expect(()=>formatSlot(v('2.4','pct_ratio'),'en')).toThrow('invalid_pct_ratio:2.4');expect(()=>roundDecimal('1e3',1)).toThrow('invalid_decimal:1e3');
 });
 it('pp and points keep the exact decimal with a sign; levels get thousands separators and unit suffixes',()=>{
  expect(formatSlot(v('0.2','pp'),'zh')).toBe('+0.2 个百分点');expect(formatSlot(v('-0.2','pp'),'en')).toBe('-0.2 pp');
  expect(formatSlot(v('0','pp'),'en')).toBe('0 pp');expect(formatSlot(v('0.3','points'),'en')).toBe('+0.3 pts');
  expect(formatSlot(v('12345.678','index'),'en')).toBe('12,345.678');
  expect(formatSlot(v('712.5','cny_per_100usd'),'zh')).toBe('712.5 元/100 美元');
 });
});

describe('renderFacts / renderExplanation',()=>{
 const facts=[fact('level',{series:'US_CPI_YOY',period:'2026-09-30',value:v('2.9','pct')},'obs:US_CPI_YOY'),fact('timeliness_missing',{series:'US_DGS10',date:'2026-11-03'},'tml:US_DGS10')];
 it('renders the list in order with ids',()=>{
  expect(renderFacts(facts,'en',CATALOG)).toEqual([{fact_id:'obs:US_CPI_YOY',text:'US CPI YoY (2026-09-30) was 2.9%.'},{fact_id:'tml:US_DGS10',text:'As of 2026-11-03, UST 10Y had no observation in the snapshot.'}]);
 });
 it('fact sentences of cited facts in first-cited order, then model hypotheses and counterpoints',()=>{
  const r=renderExplanation(facts,{points:[{fact_ids:['tml:US_DGS10','obs:US_CPI_YOY'],hypothesis:'h'}],counterpoints:[{fact_ids:['obs:US_CPI_YOY'],text:'c'}]},'en',CATALOG);
  expect(r.facts.map(f=>f.fact_id)).toEqual(['tml:US_DGS10','obs:US_CPI_YOY']);
  expect(r.hypotheses).toEqual([{text:'h',fact_ids:['tml:US_DGS10','obs:US_CPI_YOY']}]);
  expect(r.counterpoints).toEqual([{text:'c',fact_ids:['obs:US_CPI_YOY']}]);
  expect(()=>renderExplanation(facts,{points:[{fact_ids:['nope'],hypothesis:'h'}],counterpoints:[]},'en',CATALOG)).toThrow('unknown_fact:nope');
 });
});

describe('producer ↔ template compatibility (facts.ts / review.ts output renders in both locales)',()=>{
 const BASE_ROWS=[...monthly('US_CPI_YOY','2026-08',['2.7']),obs('US_UNRATE','2026-08-31','4.2'),...monthly('US_DGS10','2026-08',['4.23']),...monthly('US_DTWEXBGS','2026-08',['121.2'])];
 const CUR_ROWS=[...monthly('US_CPI_YOY','2026-09',['2.9']),obs('US_UNRATE','2026-08-31','4.3',{version:2,availableAt:'2026-10-02T12:00:00Z'}),...monthly('US_DGS10','2026-09',['4.16']),...monthly('US_DTWEXBGS','2026-09',['120.5'])];
 const MONTH_ENDS=[...monthly('US_WTI','2026-09',['62','60.5']),obs('US_DGS10','2026-10-31','4.08'),obs('US_DTWEXBGS','2026-10-31','121')];
 const EVENT_DAYS:[string,string,string][]=[['2025-09-16','4.5','4.25'],['2025-09-17','4.25','4'],['2025-10-29','4','3.75'],['2025-12-10','3.75','3.5'],['2026-10-28','4','3.75']];
 const EVENTS=[...daily('US_FED_TARGET_UPPER_D',EVENT_DAYS.map(([d,u])=>[d,u])),...daily('US_FED_TARGET_LOWER_D',EVENT_DAYS.map(([d,,l])=>[d,l]))];
 const BASE_SNAP=snap('US','2026-09-14T06:00:00Z',BASE_ROWS.map(o=>o.observation_id));
 const CUR_SNAP=snap('US','2026-10-15T06:00:00Z',CUR_ROWS.map(o=>o.observation_id),{counts:{verified:21,missing:4,restricted:5}});
 const port=(snapshots=[BASE_SNAP,CUR_SNAP])=>memoryStrategyPort(fixture({snapshots,observations:[...BASE_ROWS,...CUR_ROWS,...MONTH_ENDS,...EVENTS]}));
 const reviewFacts=async(edit:(m:StrategyManifest)=>StrategyManifest=m=>m,p=port()):Promise<Fact[]>=>flattenReviewFacts(reviewFromManifest(edit(await buildReviewManifest(p,'US','2026-10','c'))).facts);
 const snapshotFactList=async():Promise<Fact[]>=>{
  const rows=[...monthly('US_CPI_YOY','2026-08',['2.7','2.9']),...monthly('US_DGS10','2026-08',['4.23','4.16']),...monthly('US_DTWEXBGS','2026-08',['121.2','120.5'])];
  const cn=monthly('CN_CGB_10Y','2026-09',['1.85']);const s=snap('US','2026-10-15T06:00:00Z',rows.map(o=>o.observation_id));
  const p=memoryStrategyPort(fixture({snapshots:[s,snap('CN','2026-10-10T06:00:00Z',cn.map(o=>o.observation_id))],observations:[...rows,...cn,...EVENTS]}));
  const m=await buildSnapshotFactsManifest(p,s.snapshot_id,'c');if(!m)throw new Error('no manifest');return explanationFacts(m);
 };
 const catalog=FIXTURE_CATALOG.map(d=>({id:d.id,name:d.name}));
 const renderAll=(facts:Fact[])=>facts.flatMap(f=>(['zh','en'] as const).map(l=>({f,l,text:renderFact(f,l,namesFrom(catalog))})));
 const BAD=/undefined|\[object|NaN|\{|\}/;

 it('every fact the producers emit renders in zh and en, with the id fallback never used for a catalog series',async()=>{
  const all=[...await snapshotFactList(),...await reviewFacts()];
  expect(all.length).toBeGreaterThan(20);
  for(const {f,l,text} of renderAll(all)){
   expect(text.length,`${f.fact_id} ${l}`).toBeGreaterThan(0);expect(text,`${f.fact_id} ${l}`).not.toMatch(BAD);
   const series=f.slots.series;if(typeof series==='string')expect(text.includes(series),`${f.fact_id} ${l} shows the raw id ${series}`).toBe(false);
  }
 });
 it('restricted and missing catalog entries, truncated and not-read baselines, both asset_missing reasons and timeliness_missing render',async()=>{
  const edited=await reviewFacts(m=>({...m,
   inputs:m.inputs.map(i=>i.role==='asset_base:US_WTI:month_end'?{...i,value_text:'-5'}:i),
   timeliness:[...(m.timeliness??[]),{series_id:'US_CPI_YOY',state:'missing'}]}));
  const by=new Map(edited.map(f=>[f.fact_id,f]));
  const restricted=edited.find(f=>f.template==='catalog_unavailable'&&f.slots.status==='restricted');
  expect(restricted,'a restricted catalog_unavailable fact').toBeDefined();
  expect(renderFact(restricted!,'zh',namesFrom(catalog))).toMatch(/目录状态：受限。$/);expect(renderFact(restricted!,'en',namesFrom(catalog))).toMatch(/catalog status: restricted\.$/);
  const missing=edited.find(f=>f.template==='catalog_unavailable'&&f.slots.status==='missing');
  expect(renderFact(missing!,'zh',namesFrom(catalog))).toMatch(/目录状态：缺失。$/);
  expect(renderFact(by.get('mv:US_WTI')!,'zh',namesFrom(catalog))).toMatch(/无法比较：基期值非正。$/);
  expect(renderFact(by.get('mv:US_WTI')!,'en',namesFrom(catalog))).toMatch(/not comparable: non-positive base value\.$/);
  expect(renderFact(by.get('tml:US_CPI_YOY')!,'en',namesFrom(catalog))).toMatch(/had no observation in the snapshot\.$/);
  // out_of_coverage: a month with no month-end observations
  const oc=(await reviewFacts(m=>({...m,inputs:m.inputs.filter(i=>i.role!=='asset_end:US_WTI:month_end')}))).find(f=>f.fact_id==='mv:US_WTI')!;
  expect(oc.template).toBe('asset_missing');expect(renderFact(oc,'en',namesFrom(catalog))).toMatch(/month-end observations incomplete\.$/);
  // baseline_unavailable: truncated (unresolved baseline id) and not_read (no read recorded)
  const broken=snap('US','2026-09-14T06:00:00Z',[...BASE_ROWS.map(o=>o.observation_id),'obs:not-in-store']);
  const trunc=(await reviewFacts(undefined,port([broken,CUR_SNAP]))).find(f=>f.template==='baseline_unavailable')!;
  expect(renderFact(trunc,'en',namesFrom(catalog))).toMatch(/\(read truncated\)/);expect(renderFact(trunc,'zh',namesFrom(catalog))).toMatch(/读取被截断/);
  const notRead=(await reviewFacts(m=>({...m,reads:m.reads.filter(r=>!(r.purpose==='review_base'&&r.series_id==='US_CPI_YOY')),inputs:m.inputs.filter(i=>i.role!=='review_base:US_CPI_YOY:latest')}))).find(f=>f.template==='baseline_unavailable'&&f.slots.series==='US_CPI_YOY')!;
  expect(renderFact(notRead,'en',namesFrom(catalog))).toMatch(/\(not read\)/);expect(renderFact(notRead,'zh',namesFrom(catalog))).toMatch(/未读取/);
  // events_truncated
  const cut=await reviewFacts(m=>({...m,events:[],gaps:[{kind:'history_truncated' as const,reason:'US_FED_TARGET_UPPER_D',near:'2026-11-03'}]}));
  expect(renderFact(cut.find(f=>f.template==='events_truncated')!,'zh',namesFrom(catalog))).toContain('US_FED_TARGET_UPPER_D');
 });
 it('together the producer fixtures cover every template id in TEMPLATE_IDS',async()=>{
  const thin=snap('US','2026-09-14T06:00:00Z',BASE_ROWS.filter(o=>o.series_id!=='US_CPI_YOY').map(o=>o.observation_id));
  const broken=snap('US','2026-09-14T06:00:00Z',[...BASE_ROWS.map(o=>o.observation_id),'obs:not-in-store']);
  const all=[...await snapshotFactList(),...await reviewFacts(),...await reviewFacts(undefined,port([thin,CUR_SNAP])),...await reviewFacts(undefined,port([broken,CUR_SNAP])),
   ...await reviewFacts(x=>({...x,inputs:x.inputs.map(i=>i.role==='asset_base:US_WTI:month_end'?{...i,value_text:'-5'}:i),timeliness:[...(x.timeliness??[]),{series_id:'US_CPI_YOY',state:'missing'}],events:[],gaps:[{kind:'history_truncated' as const,reason:'US_FED_TARGET_UPPER_D',near:'2026-11-03'}]})),
   ...await reviewFacts(x=>({...x,inputs:x.inputs.filter(i=>i.role!=='asset_end:US_WTI:month_end')}))];
  expect([...new Set(all.map(f=>f.template))].sort()).toEqual([...TEMPLATE_IDS].sort());
  for(const {f,l,text} of renderAll(all))expect(text,`${f.fact_id} ${l}`).not.toMatch(BAD);
 });
});
