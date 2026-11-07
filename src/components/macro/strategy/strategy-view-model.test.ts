// Strategy UI view helpers (spec §3, §5.3, §5.6, §9.1): load states, exact decimal display, node states, playbook
// marks, matrix / cycle cells, mobile groups, review sections, explanation panel and deviation rows.
import {describe,expect,it} from 'vitest';
import type {Cell,CycleTableView,DeviationCase,Episode,EventRow,ExplanationProjection,F4Summary,Fact,NodeView,ObsRef,PlaybookView,PolicyResponseView,ReviewFacts,TransmissionView} from '@/lib/macro/strategy/contract';
import {MINUS,MISSING,barGeometry,closedMonths,columnMedians,coverageText,cycleCell,cycleGroups,deviationRows,episodeView,errorCode,eventRows,explainErrorText,f4SummaryDisplay,failureLabel,flowRows,
 episodesEmptyKey,formatBpText,formatInstant,formatPctRatio,formatRaw,formatValueText,hasSnapshot,headerLine,latestFor,loadStateOf,matrixCell,matrixGroups,matrixMeta,eventEvidence,matrixScale,nextRequestId,nodeDisplay,panelState,playbookCards,playbookNotice,
 projectionOfError,quantile7,remainingToday,renderedSections,reviewGrid,reviewSections,roundDecimalText,strategyApi,toneClass,toneLevel,toneOfText,uniformReason,type StrategyT} from './strategy-view-model';

const t:StrategyT=(k,v)=>v?`${k}${JSON.stringify(v)}`:k;
const ref=(series:string,pe:string,v:string):ObsRef=>({observation_id:`obs:${series}:${pe}:v1`,series_id:series,period_end:pe,value_text:v,version:1,available_at:`${pe}T12:00:00Z`,source:{kind:'snapshot',snapshot_id:'snap:US:1'}});
const node=(o:Partial<NodeView>):NodeView=>({id:'n',state:'observed',label:{zh:'美债 10Y',en:'UST 10Y'},value_text:'4.10',unit:'pct',period_end:'2026-10-31',inputs:[ref('US_DGS10','2026-10-31','4.10')],reason:null,...o});
const ev=(o:Partial<EventRow>):EventRow=>({effective_date:'2022-03-17',change_bp:'25',basis:'range',base:{period_end:'2022-02-28',value_text:'112.6',inputs:[]},end:{period_end:'2022-05-31',value_text:'115.48',inputs:[]},change_raw:2.5577,change_text:null,selected:true,exclusion:null,...o});

describe('load states (spec §9.1)',()=>{
 it('maps capability-matrix answers to page states',()=>{
  expect(loadStateOf(200,{a:1})).toEqual({kind:'ok',data:{a:1}});
  expect(loadStateOf(404,{error:{code:'strategy_disabled',message:''}})).toEqual({kind:'disabled'});
  expect(loadStateOf(503,{error:{code:'macro_foundation_unavailable',message:''}})).toEqual({kind:'foundation'});
  expect(loadStateOf(404,{error:{code:'no_published_snapshot',message:''}})).toEqual({kind:'no_snapshot'});
  expect(loadStateOf(404,{error:{code:'judgments_disabled',message:''}})).toEqual({kind:'judgments_disabled'});
  expect(loadStateOf(503,{error:{code:'judgments_unavailable',message:''}})).toEqual({kind:'judgments_unavailable'});
  expect(loadStateOf(404,{error:{code:'review_not_found',message:''}})).toEqual({kind:'not_found'});
  expect(loadStateOf(500,null)).toEqual({kind:'error',code:'http_500'});
  expect(errorCode({error:{code:'x'}})).toBe('x');expect(errorCode('nope')).toBeNull();
 });
 it('builds the API urls',()=>{
  expect(strategyApi.transmission('CN')).toBe('/api/macro/strategy/transmission?region=CN');
  expect(strategyApi.explanations('snapshot','snap:US:1')).toBe('/api/macro/strategy/explanations?subject_kind=snapshot&subject_id=snap%3AUS%3A1');
  expect(strategyApi.review('US','2026-10')).toBe('/api/macro/strategy/reviews/US/2026-10');
 });
});

describe('decimal display (spec §5.6: rounding only at display)',()=>{
 it('rounds decimal strings half away from zero without float drift',()=>{
  expect(roundDecimalText('2.9381',2)).toBe('2.94');expect(roundDecimalText('4.8',2)).toBe('4.80');
  expect(roundDecimalText('-0.005',2)).toBe('-0.01');expect(roundDecimalText('-0.004',2)).toBe('0.00');
  expect(roundDecimalText('1.5',0)).toBe('2');expect(roundDecimalText('999.995',2)).toBe('1000.00');
  expect(roundDecimalText('1e5',2)).toBe(MISSING);
 });
 it('keeps source precision up to two decimals',()=>{
  expect(formatValueText('2.9381')).toBe('2.94');expect(formatValueText('4.80')).toBe('4.80');expect(formatValueText('50')).toBe('50');
 });
 it('pct to 0.1 %, bp to 1 bp, with a real minus sign',()=>{
  expect(formatRaw(1.2345,'pct')).toBe('+1.2%');expect(formatRaw(-0.36,'pct')).toBe(`${MINUS}0.4%`);
  expect(formatRaw(0.04,'pct')).toBe('0.0%');expect(formatRaw(-0.04,'pct')).toBe('0.0%');
  expect(formatRaw(209,'bp')).toBe('+209 bp');expect(formatRaw(-47.5,'bp')).toBe(`${MINUS}48 bp`);
  expect(formatRaw(null,'bp')).toBe(MISSING);expect(formatRaw(Number.NaN,'pct')).toBe(MISSING);
  expect(formatBpText('525')).toBe('+525 bp');expect(formatBpText('-12.5')).toBe(`${MINUS}13 bp`);expect(formatBpText('0')).toBe('0 bp');
 });
 it('tones follow the displayed sign; three wash levels per column',()=>{
  expect(toneOfText('+1.2%')).toBe('up');expect(toneOfText(`${MINUS}3 bp`)).toBe('down');expect(toneOfText('0.0%')).toBe('flat');expect(toneOfText(MISSING)).toBe('missing');
  expect([toneLevel(1,9),toneLevel(-4,9),toneLevel(9,9),toneLevel(null,9),toneLevel(3,0)]).toEqual([1,2,3,1,1]);
  expect(toneClass('up',3)).toBe('bg-[color-mix(in_srgb,var(--up)_16%,transparent)]');expect(toneClass('down',1)).toBe('bg-[color-mix(in_srgb,var(--down)_6%,transparent)]');
  expect(toneClass('flat',2)).toBe('');expect(toneClass('missing',1)).toBe('text-text-dim');
 });
 it('instants print in UTC',()=>{expect(formatInstant('2026-11-03T06:02:09Z')).toBe('2026-11-03 06:02 UTC');expect(formatInstant('x')).toBe(MISSING);});
});

describe('transmission nodes (spec §5.1)',()=>{
 it('derived spread shows the exact formula and opens its two inputs',()=>{
  const d=nodeDisplay(node({id:'spread',state:'derived',label:{zh:'中美 10Y 利差',en:'US–CN 10Y spread'},value_text:'2.25',unit:'pp',inputs:[ref('US_DGS10','2026-10-31','4.10'),ref('CN_CGB_10Y','2026-10-31','1.85')]}),'zh');
  expect(d).toEqual({id:'spread',badgeKey:'state.derived',label:'中美 10Y 利差',value:'2.25',unit:' pp',period:'2026-10-31',reason:null,formula:`4.10 ${MINUS} 1.85 = 2.25`,dashed:false,drill:true,seriesId:null});
 });
 it('a spread with mismatched periods is missing with its reason, still drillable to both inputs, no formula',()=>{
  const d=nodeDisplay(node({state:'missing',value_text:null,unit:'pp',period_end:null,reason:{zh:'两条输入数据期不同',en:'periods differ'},inputs:[ref('US_DGS10','2026-10-31','4.10'),ref('CN_CGB_10Y','2026-09-30','1.92')]}),'en');
  expect(d).toMatchObject({value:null,reason:'periods differ',formula:null,dashed:true,drill:true,badgeKey:'state.missing'});
 });
 it('observed nodes link to the indicator; restricted / not-in-catalog nodes are dashed and carry no value',()=>{
  expect(nodeDisplay(node({}),'zh')).toMatchObject({value:'4.10',unit:'%',seriesId:'US_DGS10',dashed:false,drill:false});
  expect(nodeDisplay(node({state:'restricted',value_text:null,inputs:[],reason:{zh:'第三方版权',en:'third-party rights'}}),'zh')).toMatchObject({value:null,dashed:true,seriesId:null,reason:'第三方版权'});
 });
 it('table view rows and the no-snapshot check',()=>{
  const v:TransmissionView={version:'macro-transmission/1',region:'US',manifest_id:'m',cutoff:'c',snapshots:{US:null,CN:null},catalog_version:'cat',
   stages:[{stage:'rates',label:{zh:'无风险利率',en:'Risk-free rates'},nodes:[node({id:'a'}),node({id:'b',state:'not_in_catalog',value_text:null,period_end:null,inputs:[],reason:{zh:'未纳入',en:'not in catalog'}})],edge:null}]};
  expect(flowRows(v,'zh')).toEqual([
   {key:'rates:a',stage:'无风险利率',node:'美债 10Y',stateKey:'state.observed',value:'4.10%',period:'2026-10-31',reason:''},
   {key:'rates:b',stage:'无风险利率',node:'美债 10Y',stateKey:'state.not_in_catalog',value:MISSING,period:MISSING,reason:'未纳入'}]);
  expect(hasSnapshot(v)).toBe(false);expect(hasSnapshot({...v,snapshots:{US:'s',CN:null}})).toBe(true);expect(hasSnapshot({...v,snapshots:{US:null,CN:'s'}})).toBe(false);
 });
});

describe('playbooks (spec §5.2)',()=>{
 const pb=(regime:PlaybookView['regime']):PlaybookView=>({regime,title:{zh:regime,en:regime},triggers:[{rule_id:'pmi.1',type:'pmi',condition:{zh:'50 ≤ v < 55',en:'50 ≤ v < 55'},support:0.5},{rule_id:'x.1',type:'fx',condition:{zh:'c',en:'c'},support:1}],
  mechanism:[{zh:'需求回升',en:'demand recovers'}],implications:{favored:[{zh:'权益',en:'equities'}],disfavored:[{zh:'现金',en:'cash'}]},watch:[{series_id:'US_CPI_YOY',name:{zh:'CPI 同比',en:'CPI YoY'}}]});
 const mark=(regime:PlaybookView['regime'],match:boolean)=>({mark:{regime,judgment_id:'j1',snapshot_match:match,as_of:'2026-10-14T03:00:00Z'}});
 it('renders rule rows verbatim with the rule parameter, never a percentage',()=>{
  const [c]=playbookCards([pb('recovery')],'zh',null);
  expect(c.triggers).toEqual(['pmi · 50 ≤ v < 55 · 0.5','fx · c · 1.0']);
  expect(c).toMatchObject({mechanism:['需求回升'],favored:['权益'],disfavored:['现金'],watch:[{id:'US_CPI_YOY',name:'CPI 同比'}],marked:false});
 });
 it('marks only the F4 card category on the manifest snapshot',()=>{
  const cards=playbookCards([pb('recovery'),pb('overheat')],'zh',mark('overheat',true));
  expect(cards.map(c=>c.marked)).toEqual([false,true]);
  expect(playbookCards([pb('overheat')],'zh',mark('overheat',false))[0].marked).toBe(false);
 });
 it('notice per judgment state',()=>{
  expect(playbookNotice('disabled',null)).toEqual({key:'playbook.offNote'});
  expect(playbookNotice('unavailable',null)).toEqual({key:'dependency.judgmentsUnavailable'});
  expect(playbookNotice('ok',mark('overheat',false))).toEqual({key:'playbook.earlier',date:'2026-10-14'});
  expect(playbookNotice('ok',mark('overheat',true))).toBeNull();
 });
 it('F4 summary is words only',()=>{
  const s:F4Summary={judgment_id:'j1',selected:'overheat',lifecycle:'settled',outcome:'miss',calibration:'insufficient_sample',methodology:{id:'macro_regime',version:'v1'},as_of:'2026-10-14T03:00:00Z',href:'/intel/methods/macro_regime'};
  expect(f4SummaryDisplay(s,t)).toEqual({category:'regime.overheat',lifecycle:'f4.lifecycle.settled_miss',calibration:'f4.calibration{"value":"f4.calibrationState.insufficient_sample"}',
   method:'f4.method{"id":"macro_regime","version":"v1"}',asOf:'f4.asOf{"date":"2026-10-14"}',href:'/intel/methods/macro_regime'});
  expect(f4SummaryDisplay({...s,lifecycle:'open',outcome:null,calibration:'custom',selected:null},t)).toMatchObject({category:MISSING,lifecycle:'f4.lifecycle.open',calibration:'f4.calibration{"value":"custom"}'});
  expect(f4SummaryDisplay({...s,lifecycle:'voided'},t).lifecycle).toBe('f4.lifecycle.other{"value":"voided"}');
 });
});

describe('policy response matrix (spec §5.3)',()=>{
 const stats:Cell={status:'stats',n:6,median_raw:1.2345,q1_raw:-0.4,q3_raw:2.94,unit:'pct',events:[ev({})]};
 const view:PolicyResponseView={version:'macro-policy-response/1',window:3,manifest_id:'m',cutoff:'c',sentences:[],
  dims:[{id:'US_DTWEXBGS',label:{zh:'美元广义',en:'Broad USD'},unit:'pct',kind:'series',series:'US_DTWEXBGS',coverage:{from:'2006-01-31',to:'2026-10-31'}},
   {id:'US_SP500',label:{zh:'标普',en:'S&P'},unit:'pct',kind:'restricted',coverage:{from:null,to:null}}],
  rows:[{direction:'hike',cells:{US_DTWEXBGS:stats,US_SP500:{status:'restricted',reason:{zh:'受限',en:'restricted'}}}},
   {direction:'qe_qt',cells:{US_DTWEXBGS:{status:'missing',reason:{zh:'目录无联储资产负债表序列',en:'no balance sheet series'}},US_SP500:{status:'missing',reason:{zh:'目录无联储资产负债表序列',en:'no balance sheet series'}}}}]};
 it('cells: stats with quartiles, events-only, insufficient, restricted',()=>{
  expect(matrixCell(stats,'zh',t)).toEqual({main:'+1.2%',sub:`matrix.quartiles{"q1":"${MINUS}0.4%","q3":"+2.9%","n":6}`,tone:'up',drill:true,raw:1.2345});
  expect(matrixCell({status:'events_only',n:3,unit:'bp',events:[]},'zh',t)).toEqual({main:'matrix.n{"n":3}',sub:'matrix.fewEvents',tone:'flat',drill:true,raw:null});
  expect(matrixCell({status:'insufficient',unit:'bp',events:[]},'zh',t)).toMatchObject({main:MISSING,drill:false});
  expect(matrixCell({status:'restricted',reason:{zh:'受限',en:'restricted'}},'en',t)).toEqual({main:'state.restricted',sub:'restricted',tone:'missing',drill:false,raw:null});
 });
 it('per-event rows keep selected and excluded events with reasons',()=>{
  expect(eventRows([ev({}),ev({effective_date:'2022-05-05',change_bp:'50',selected:false,exclusion:'overlap',change_raw:null,end:null})],'pct')).toEqual([
   {key:'2022-03-17',date:'2022-03-17',changeBp:'+25 bp',base:'2022-02 · 112.6',end:'2022-05 · 115.48',change:'+2.6%',selected:true,exclusionKey:null},
   {key:'2022-05-05',date:'2022-05-05',changeBp:'+50 bp',base:'2022-02 · 112.6',end:MISSING,change:MISSING,selected:false,exclusionKey:'matrix.exclusion.overlap'}]);
  expect(eventRows([ev({change_text:'-7',change_raw:null})],'bp')[0].change).toBe(`${MINUS}7 bp`);
  expect(eventRows([ev({change_text:'115.48/112.6'})],'pct')[0].change).toBe('+2.6%');   // exact ratio, rounded once
 });
 it('pct changes are rounded once from the exact ratio (no double rounding at the boundary)',()=>{
  expect(formatPctRatio('100.04996/100')).toBe('0.0%');expect(formatPctRatio('99.95004/100')).toBe('0.0%');
  expect(formatPctRatio('100.05/100')).toBe('+0.1%');expect(formatPctRatio('99.95/100')).toBe(`${MINUS}0.1%`);
  expect(formatPctRatio('-14.5424')).toBe(MISSING);
 });
 it('column scale, uniform-missing rows, coverage header and mobile groups',()=>{
  expect(matrixScale(view)).toEqual({US_DTWEXBGS:1.2345,US_SP500:0});
  expect(uniformReason(view.rows[1],view.dims,'zh')).toBe('目录无联储资产负债表序列');
  expect(uniformReason(view.rows[0],view.dims,'zh')).toBeNull();
  expect(coverageText(view.dims[0],t)).toBe('matrix.coverage{"from":"2006-01","to":"2026-10"}');
  expect(coverageText(view.dims[1],t)).toBe('matrix.noCoverage');
  const g=matrixGroups(view,'zh',t);
  expect(g.map(x=>x.label)).toEqual(['美元广义 %','标普 %']);
  expect(g[0].rows.map(r=>[r.direction,r.cell.main])).toEqual([['hike','+1.2%'],['qe_qt','state.missing']]);
 });
 it('mobile groups keep the desktop drill: every drillable cell carries its Cell, n < 5 included',()=>{
  const g=matrixGroups(view,'zh',t);
  for(const grp of g)for(const r of grp.rows)expect([r.cell.drill,r.source===view.rows.find(x=>x.direction===r.direction)!.cells[grp.id]]).toEqual([r.cell.drill,true]);
  const few:PolicyResponseView={...view,rows:[{direction:'hike',cells:{US_DTWEXBGS:{status:'events_only',n:3,unit:'pct',events:[ev({})]},US_SP500:{status:'missing',reason:{zh:'无',en:'none'}}}}]};
  const fg=matrixGroups(few,'zh',t)[0].rows[0];
  expect([fg.cell.drill,fg.cell.main,fg.cell.sub,fg.source.status]).toEqual([true,'matrix.n{"n":3}','matrix.fewEvents','events_only']);
  expect(matrixGroups(few,'zh',t)[1].rows[0].cell.drill).toBe(false);
 });
 it('matrix meta links its own manifest and shows cutoff and version',()=>{
  expect(matrixMeta({...view,manifest_id:'man-pr',cutoff:'2026-11-03T00:00:00Z',version:'macro-policy-response/1'},t)).toEqual({
   href:'/api/macro/strategy/manifests/man-pr',manifest:'meta.manifest{"id":"man-pr"}',fullId:'man-pr',cutoff:'meta.cutoff{"time":"2026-11-03 00:00 UTC"}',version:'macro-policy-response/1'});
 });
 it('event evidence exposes base and end inputs with exact dates, values, versions and sources',()=>{
  const base=[ref('US_DTWEXBGS','2022-02-28','112.6')],end=[{...ref('US_DTWEXBGS','2022-05-31','115.48'),version:3,source:{kind:'history' as const,as_of:'2026-11-03T00:00:00Z'}}];
  const e=ev({base:{period_end:'2022-02-28',value_text:'112.6',inputs:base},end:{period_end:'2022-05-31',value_text:'115.48',inputs:end}});
  const out=eventEvidence([e,ev({effective_date:'2022-06-16',base:null,end:null,selected:false,exclusion:'missing_endpoint'})]);
  expect(out).toEqual([{key:'2022-03-17',date:'2022-03-17',base:base,end:end},{key:'2022-06-16',date:'2022-06-16',base:[],end:[]}]);
  expect(out[0].end[0]).toMatchObject({value_text:'115.48',version:3,available_at:'2022-05-31T12:00:00Z',source:{kind:'history'}});
 });
});

describe('policy action episodes × assets (spec §5.5)',()=>{
 const ep=(o:Partial<Episode>):Episode=>({index:0,direction:'hike',start:'2022-03-17',end:'2023-07-27',events:11,upper_from:'0.25',upper_to:'5.50',cumulative_bp:'525',left_censored:false,ongoing:false,gap_after:false,...o});
 const view:CycleTableView={version:'macro-cycle-table/1',episodes_version:'macro-policy-episodes/1',boundary:'month_end',manifest_id:'m',cutoff:'c',gaps:[],
  episodes:[ep({}),ep({index:1,direction:'cut',start:'2024-09-19',end:'2025-12-11',cumulative_bp:'-175',events:6,ongoing:true,upper_from:'5.50',upper_to:'3.75'})],
  columns:[{id:'US_UST10Y',label:{zh:'美债10Y',en:'UST 10Y'},change_kind:'bp',daily_series:'US_DGS10_D',monthly_series:'US_DGS10',restricted:false},
   {id:'US_WTI',label:{zh:'WTI',en:'WTI'},change_kind:'pct',daily_series:'US_WTI_D',monthly_series:'US_WTI',restricted:false}],
  cells:{'0':{US_UST10Y:{status:'ok',from:ref('US_DGS10','2022-02-28','1.93'),to:ref('US_DGS10','2023-07-31','3.96'),change_raw:null,change_text:'203',change_kind:'bp'},
   US_WTI:{status:'ok',from:ref('US_WTI','2022-02-28','95.72'),to:ref('US_WTI','2023-07-31','81.8'),change_raw:-14.5424,change_text:'81.8/95.72',change_kind:'pct'}},
   '1':{US_UST10Y:{status:'ok',from:ref('US_DGS10','2024-08-30','3.91'),to:ref('US_DGS10','2025-12-31','4.15'),change_raw:null,change_text:'24',change_kind:'bp'},US_WTI:{status:'missing',reason:'month_not_closed'}}}};
 it('ok cells show the change and both endpoints; missing cells say why',()=>{
  expect(cycleCell(view.cells['0'].US_UST10Y,t)).toMatchObject({main:'+203 bp',sub:'1.93 (2022-02-28) → 3.96 (2023-07-31)',tone:'up',drill:true,raw:203});
  expect(cycleCell(view.cells['0'].US_WTI,t)).toMatchObject({main:`${MINUS}14.5%`,tone:'down',raw:-14.5424});
  expect(cycleCell(view.cells['0'].US_WTI,t).refs.map(r=>r.observation_id)).toEqual(['obs:US_WTI:2022-02-28:v1','obs:US_WTI:2023-07-31:v1']);
  expect(cycleCell({status:'missing',reason:'degenerate'},t)).toEqual({main:'state.missing',sub:'history.missing.degenerate',tone:'missing',drill:false,raw:null,refs:[]});
  expect(cycleCell({status:'restricted'},t).main).toBe('state.restricted');
 });
 it('an empty episode list says why: truncated event history vs no episodes',()=>{
  expect(episodesEmptyKey(view)).toBeNull();
  expect(episodesEmptyKey({...view,episodes:[]})).toBe('history.noEpisodes');
  expect(episodesEmptyKey({...view,episodes:[],gaps:[{kind:'history_truncated',reason:'US_FED_TARGET_UPPER_D',near:'2026-11-03'}]})).toBe('history.eventsTruncated');
 });
 it('episode header with flags',()=>{
  expect(episodeView(view.episodes[1],t)).toEqual({key:'cut:2024-09-19',direction:'history.direction.cut',dates:'2024-09-19 → 2025-12-11',
   line:`history.episodeLine{"from":"5.50","to":"3.75","bp":"${MINUS}175 bp","n":6}`,flags:['history.flag.ongoing']});
  expect(episodeView({...view.episodes[0],left_censored:true,gap_after:true},t).flags).toEqual(['history.flag.leftCensored','history.flag.gapAfter']);
 });
 it('mobile groups keep episode annotations and the endpoint drill',()=>{
  const v:CycleTableView={...view,episodes:[{...view.episodes[0],left_censored:true,gap_after:true},view.episodes[1]]};
  const g=cycleGroups(v,t,'zh');
  expect(g[0].rows[0]).toMatchObject({flags:['history.flag.leftCensored','history.flag.gapAfter'],line:expect.stringContaining('history.episodeLine'),
   cell:{drill:true},drillTitle:'history.cellTitle{"episode":"history.direction.hike 2022-03-17 → 2023-07-27","column":"美债10Y"}'});
  expect(g[0].rows[0].refs.map(r=>r.observation_id)).toEqual(['obs:US_DGS10:2022-02-28:v1','obs:US_DGS10:2023-07-31:v1']);
  expect(g[0].rows[1].flags).toEqual(['history.flag.ongoing']);
  expect(g[1].rows[1]).toMatchObject({cell:{drill:false},refs:[]});
 });
 it('type-7 median per column and centred bars',()=>{
  expect(quantile7([1,2,3,4],0.5)).toBe(2.5);expect(quantile7([1,2,3,4],0.25)).toBe(1.75);expect(quantile7([7],0.5)).toBe(7);
  expect(columnMedians(view).map(c=>[c.id,c.n,c.median,c.scaleMax])).toEqual([['US_UST10Y',2,113.5,203],['US_WTI',1,-14.5424,14.5424]]);
  expect(barGeometry(-50,100,100)).toEqual({x:50,width:50});expect(barGeometry(100,100,100)).toEqual({x:100,width:100});expect(barGeometry(null,100,100)).toEqual({x:100,width:0});
 });
 it('mobile groups: one per column, one line per episode',()=>{
  const g=cycleGroups(view,t,'en');
  expect(g.map(x=>x.label)).toEqual(['UST 10Y','WTI']);
  expect(g[1].rows.map(r=>r.cell.main)).toEqual([`${MINUS}14.5%`,'state.missing']);
  expect(g[0].rows[0].episode).toBe('history.direction.hike 2022-03-17 → 2023-07-27');
 });
});

describe('monthly review (spec §6.2)',()=>{
 const fact=(id:string,series?:string):Fact=>({fact_id:id,kind:'release',template:'release',slots:{},series_id:series,source_inputs:[]});
 const facts=(o:Partial<ReviewFacts>):ReviewFacts=>({region:'US',month:'2026-10',cutoff:'c',baseline_cutoff:'b',snapshot_id:'s',baseline_snapshot_id:'s0',baseline_missing:false,
  releases:[fact('obs:US_CPI_YOY','US_CPI_YOY')],revisions:[],timeliness:[],policy_events:[fact('evt:2026-10-29')],episode_changes:[],asset_moves:[],coverage:[],...o});
 it('seven sections in spec order with rendered fact text',()=>{
  const s=reviewSections(facts({}),f=>`T:${f.fact_id}`);
  expect(s.map(x=>x.key)).toEqual(['releases','revisions','timeliness','policy_events','episode_changes','asset_moves','coverage']);
  expect(s[0]).toEqual({key:'releases',titleKey:'review.section.releases',items:[{factId:'obs:US_CPI_YOY',text:'T:obs:US_CPI_YOY',seriesId:'US_CPI_YOY'}],emptyKey:null});
  expect(s[1].emptyKey).toBe('review.empty');expect(s[3].items[0].seriesId).toBeNull();
 });
 it('missing baseline empties sections 1–2 with their own note',()=>{
  const s=reviewSections(facts({baseline_missing:true}),f=>f.fact_id);
  expect([s[0].items,s[0].emptyKey,s[1].emptyKey,s[3].items.length]).toEqual([[],'review.baselineMissing','review.baselineMissing',1]);
 });
 it('index: closed months newest first; grid cells per region',()=>{
  expect(closedMonths(new Date('2026-01-15T00:00:00Z'),3)).toEqual(['2025-12','2025-11','2025-10']);
  const grid=reviewGrid(['2026-10','2026-09'],[{region:'US',month:'2026-10',status:'ok',generation:2,result_id:'r',updated_at:'2026-11-03T06:02:00Z'}],[{region:'CN',month:'2026-09',status:'insufficient',generation:1,result_id:'r2',updated_at:'u'}]);
  expect(grid).toEqual([{month:'2026-10',US:{status:'ok',updatedAt:'2026-11-03T06:02:00Z',generation:2},CN:{status:'none',updatedAt:null,generation:null}},
   {month:'2026-09',US:{status:'none',updatedAt:null,generation:null},CN:{status:'insufficient',updatedAt:'u',generation:1}}]);
 });
});

describe('explanation panel (spec §3.6, §6.3)',()=>{
 const proj=(o:Partial<ExplanationProjection>):ExplanationProjection=>({explanation_id:'e1',subject_kind:'review',subject_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',locale:'zh',manifest_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',state:'accepted',
  rendered:null,failure_codes:[],provider:'deepseek',model:'deepseek-chat',prompt_version:'macro-explain-prompt/1',validator_version:'macro-explain-validator/1',created_at:'c',finished_at:null,...o});
 it('states: abandoned shows as failed',()=>{
  expect(panelState(null)).toBe('none');expect(panelState(proj({state:'running'}))).toBe('running');expect(panelState(proj({state:'abandoned'}))).toBe('failed');expect(panelState(proj({state:'rejected'}))).toBe('rejected');
 });
 it('latest projection in the page locale',()=>{
  expect(latestFor([proj({explanation_id:'en1',locale:'en'}),proj({explanation_id:'zh1'}),proj({explanation_id:'zh0'})],'zh')?.explanation_id).toBe('zh1');
  expect(latestFor([],'en')).toBeNull();
 });
 it('fact sentences are numbered; hypotheses cite them by number; unknown ids drop',()=>{
  expect(renderedSections({facts:[{fact_id:'obs:a',text:'A'},{fact_id:'chg:b',text:'B'}],hypotheses:[{text:'H',fact_ids:['chg:b','zz']}],counterpoints:[{text:'C',fact_ids:['obs:a']}]},'man-1')).toEqual({
   facts:[{n:1,factId:'obs:a',text:'A',href:'/api/macro/strategy/manifests/man-1#fact=obs%3Aa'},{n:2,factId:'chg:b',text:'B',href:'/api/macro/strategy/manifests/man-1#fact=chg%3Ab'}],
   hypotheses:[{text:'H',refs:[2],factIds:['chg:b']}],counterpoints:[{text:'C',refs:[1],factIds:['obs:a']}]});
 });
 it('header names subject, manifest, model, prompt and validator versions',()=>{
  expect(headerLine(proj({}),t)).toBe('explain.header{"subject":"explain.subject.review{\\"id\\":\\"aaaaaaaa…\\"}","manifest":"bbbbbbbb…","model":"deepseek/deepseek-chat","prompt":"macro-explain-prompt/1","validator":"macro-explain-validator/1"}');
  expect(headerLine(proj({provider:null,model:null}),t)).toContain(`"model":"${MISSING}"`);
 });
 it('failure codes, quota counts, request ids and error text',()=>{
  expect(failureLabel('numeral',t)).toBe('explain.failure.numeral');expect(failureLabel('weird_code',t)).toBe('weird_code');
  expect(remainingToday({usage:{perspectives:{used:2,limit:5}}})).toEqual({kind:'count',n:3});
  expect(remainingToday({usage:{perspectives:{used:9,limit:5}}})).toEqual({kind:'count',n:0});
  expect(remainingToday({usage:{perspectives:{used:0,limit:-1}}})).toEqual({kind:'unlimited'});
  expect(remainingToday(null)).toBeNull();
  expect(nextRequestId('keep',()=>'new')).toBe('keep');expect(nextRequestId(null,()=>'new')).toBe('new');
  expect(explainErrorText('quota_exceeded',t)).toBe('explain.quota');expect(explainErrorText('llm_not_configured',t)).toBe('explain.noModel');
  expect(explainErrorText('payload_conflict',t)).toBe('explain.conflict{"code":"payload_conflict"}');expect(explainErrorText('network',t)).toBe('explain.error{"code":"network"}');
  expect(projectionOfError({error:{code:'usage_audit_unavailable'},explanation:proj({state:'failed'})})?.state).toBe('failed');expect(projectionOfError({error:{code:'x'}})).toBeNull();
 });
});

describe('deviation cases (spec §6.4)',()=>{
 const c:DeviationCase={judgment_id:'j',settlement_id:'s',region:'US',as_of:'2026-09-02',selected:'overheat',realized:'recovery',evidence_state:'complete',diffs:[
  {series_id:'US_DFF',period_end:'2026-08-31',role:'latest',kind:'unchanged',subkind:null,registered:{vintage_id:'v1',value:4.33},settled:{vintage_id:'v1',value:4.33}},
  {series_id:'US_UNRATE',period_end:'2026-08-31',role:'latest',kind:'newly_available',subkind:'later_period',registered:null,settled:{vintage_id:'v1',value:4.2}},
  {series_id:'US_CPI_YOY',period_end:'2026-08-31',role:'latest',kind:'revised',subkind:null,registered:{vintage_id:'v1',value:3},settled:{vintage_id:'v2',value:2.9}},
  {series_id:'US_PPI',period_end:'2026-07-31',role:'comparison',kind:'dropped',subkind:null,registered:{vintage_id:'v1',value:2.4},settled:null}]};
 it('orders revised, dropped, newly available; folds unchanged by default',()=>{
  const r=deviationRows(c,false);
  expect(r.hiddenUnchanged).toBe(1);
  expect(r.rows.map(x=>[x.series,x.kindKey,x.subkindKey,x.registered,x.settled])).toEqual([
   ['US_CPI_YOY','deviation.kind.revised',null,'v1 · 3','v2 · 2.9'],
   ['US_PPI','deviation.kind.dropped',null,'v1 · 2.4',MISSING],
   ['US_UNRATE','deviation.kind.newly_available','deviation.subkind.later_period',MISSING,'v1 · 4.2']]);
  expect(deviationRows(c,true).rows.map(x=>x.kindKey).at(-1)).toBe('deviation.kind.unchanged');
 });
});
