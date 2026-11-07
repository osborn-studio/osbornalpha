// src/lib/evals/gold/schema.test.ts
// One counter-example per §4.2/§4.3/§4.6 rule; each asserts the exact '<path>: <code>' error line.
import {describe,expect,it} from 'vitest';
import {EvalError} from '../errors';
import type {RecordersFile} from '../types';
import {canonicalFromPrinted,parseGoldSetF6,specOfUnit,unitOfSpec} from './schema';

// Plain JSON builders; every test mutates a fresh copy.
type J=Record<string,any>;
const RECORDERS:RecordersFile={version:1,recorders:[
 {id:'owner',role:'owner',modules:['facts','metrics','macro'],added_at:'2026-11-06',approved_by:'owner'},
 {id:'reviewer2',role:'reviewer',modules:['facts'],added_at:'2026-11-06',approved_by:'owner'},
 {id:'claude-code',role:'agent',modules:['facts'],added_at:'2026-11-06',approved_by:'owner'},
 {id:'macro-only',role:'reviewer',modules:['macro'],added_at:'2026-11-06',approved_by:'owner'},
]};
const META={path:'src/lib/evals/fixtures/gold/facts/test.json',sha256:'a'.repeat(64)};
const goodCase=():J=>({
 case_id:'AAPL/revenue/2022-10-01..2023-09-30/consolidated/USD',subject:{market:'US',cik:'320193'},
 target:{type:'fact',concept:'revenue',period_start:'2022-10-01',period_end:'2023-09-30',duration:'12M',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}},
 expect:'present',printed:{text:'383,285',unit_label:'In millions',scale:'1000000'},canonical:{value:'383285000000'},binding:'document',
 source:{document_type:'10-K',document_id:{kind:'edgar_accession',value:'0000320193-23-000106'},url:'https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm',sha256:'b'.repeat(64),available_date:'2023-11-03',locator:{page:28,table:'CONSOLIDATED STATEMENTS OF OPERATIONS',row:'Total net sales',column:'2023'}},
 provenance_kind:'transcribed',recorded_by:'owner',recorded_at:'2026-11-06T00:00:00Z',reviewed_by:'reviewer2',reviewed_at:'2026-11-07T00:00:00Z',retracted:null,notes:'',
});
const instantCase=():J=>({...goodCase(),case_id:'AAPL/total_assets/2023-09-30',target:{type:'fact',concept:'total_assets',period_start:null,period_end:'2023-09-30',duration:'INSTANT',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}},printed:{text:'352,583',unit_label:'In millions',scale:'1000000'},canonical:{value:'352583000000'}});
const goodSet=():J=>({schema_version:1,set_id:'facts/test',version:1,module:'facts',artifact_class:'public',module_implementers:['claude-code','codex'],review_required:false,tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},optional_cases:[],history:[],cases:[goodCase(),instantCase()]});
function errorsOf(mutate:(s:J)=>void,recorders:RecordersFile=RECORDERS):string[]{
 const s=goodSet();mutate(s);
 try{parseGoldSetF6(s,META,recorders);return [];}
 catch(e){expect(e).toBeInstanceOf(EvalError);expect((e as EvalError).code).toBe('gold_invalid');return (e as EvalError).detail.errors as string[];}
}

describe('parseGoldSetF6: the valid set',()=>{
 it('parses, derives required from optional_cases, as_of from available_date, ready=true and no gaps',()=>{
  const s=goodSet();s.optional_cases=['AAPL/total_assets/2023-09-30'];
  const set=parseGoldSetF6(s,META,RECORDERS);
  expect(set).toMatchObject({format:'f6',ready:true,set_id:'facts/test',path:META.path,sha256:META.sha256,optional_cases:['AAPL/total_assets/2023-09-30']});
  expect(set.cases.map(c=>[c.case_id,c.required,c.pending,c.provenance_gaps,c.as_of])).toEqual([
   ['AAPL/revenue/2022-10-01..2023-09-30/consolidated/USD',true,false,[],'2023-11-03'],
   ['AAPL/total_assets/2023-09-30',false,false,[],'2023-11-03'],
  ]);
  expect(errorsOf(()=>{})).toEqual([]);
 });
 it('accepts expect=missing with target.unit and source but no printed/canonical/locator',()=>{
  expect(errorsOf(s=>{const c=s.cases[0];c.expect='missing';delete c.printed;delete c.canonical;delete c.source.locator;})).toEqual([]);
 });
 it('accepts a synthetic set recorded by "synthetic" with no reviewer',()=>{
  expect(errorsOf(s=>{for(const c of s.cases){c.provenance_kind='synthetic';c.recorded_by='synthetic';c.reviewed_by=null;c.reviewed_at=null;}})).toEqual([]);
 });
});

describe('parseGoldSetF6: one counter-example per rule',()=>{
 const cases:[string,(s:J)=>void,string][]=[
  ['target.unit required (present)',s=>{delete s.cases[0].target.unit;},'cases[0].target.unit: required'],
  ['target.unit required (missing)',s=>{const c=s.cases[0];c.expect='missing';delete c.printed;delete c.canonical;delete c.target.unit;},'cases[0].target.unit: required'],
  ['currency must be ISO',s=>{s.cases[0].target.unit={kind:'currency',currency:'XXX'};},'cases[0].target.unit: currency_requires_iso_currency'],
  ['macro unit kinds are not facts units',s=>{s.cases[0].target.unit={kind:'index'};},'cases[0].target.unit: not_a_facts_unit'],
  ['unit kind must match the concept',s=>{s.cases[0].target.unit={kind:'shares'};},'cases[0].target.unit.kind: concept_revenue_expects_currency'],
  ['scale whitelist',s=>{s.cases[0].printed.scale='100';},'cases[0].printed.scale: not_in_whitelist'],
  ['canonical must equal parse(printed) × scale',s=>{s.cases[0].canonical.value='383285000001';},'cases[0].canonical.value: does_not_match_printed:383285000000'],
  ['canonical must be canonical text',s=>{s.cases[0].canonical.value='383285000000.0';},'cases[0].canonical.value: not_canonical:383285000000'],
  ['canonical must be a decimal string (not a JSON number)',s=>{s.cases[0].canonical.value=383285000000;},'cases[0].canonical.value: decimal_string_required'],
  ['printed text must be a printed number',s=>{s.cases[0].printed.text='$383,285';},'cases[0].printed.text: unparseable'],
  ['thousands grouping must be well formed',s=>{s.cases[0].printed.text='3832,85';},'cases[0].printed.text: unparseable'],
  ['% only for ratio',s=>{s.cases[0].printed.text='12.5%';},'cases[0].printed.text: unparseable'],
  ['source.sha256 required',s=>{delete s.cases[0].source.sha256;},'cases[0].source.sha256: 64_lowercase_hex_required'],
  ['source.sha256 must be 64 lowercase hex',s=>{s.cases[0].source.sha256='B'.repeat(64);},'cases[0].source.sha256: 64_lowercase_hex_required'],
  ['source.url must be https',s=>{s.cases[0].source.url='http://www.sec.gov/x';},'cases[0].source.url: https_url_required'],
  ['locator required for present',s=>{delete s.cases[0].source.locator;},'cases[0].source.locator: required_for_present'],
  ['document binding needs document_id',s=>{delete s.cases[0].source.document_id;},'cases[0].source.document_id: required_for_document_binding'],
  ['current binding needs available_date',s=>{s.cases[0].binding='current';delete s.cases[0].source.available_date;},'cases[0].source.available_date: required_for_current_binding'],
  ['accession format',s=>{s.cases[0].source.document_id.value='320193-23-106';},'cases[0].source.document_id.value: accession_format'],
  ['edgar accession only for US',s=>{s.cases[0].subject={market:'CN',ticker:'600519.SH'};},'cases[0].source.document_id: edgar_accession_requires_US'],
  ['recorded_by must be a recorder',s=>{s.cases[0].recorded_by='stranger';},'cases[0].recorded_by: not_in_recorders:stranger'],
  ['reviewed_by must be a recorder',s=>{s.cases[0].reviewed_by='stranger';},'cases[0].reviewed_by: not_in_recorders:stranger'],
  ['recorded_by must not be a module implementer',s=>{s.cases[0].recorded_by='claude-code';},'cases[0].recorded_by: is_module_implementer:claude-code'],
  ['reviewed_by must not be a module implementer',s=>{s.cases[0].reviewed_by='claude-code';},'cases[0].reviewed_by: is_module_implementer:claude-code'],
  ['recorder must cover the module',s=>{s.cases[0].reviewed_by='macro-only';},'cases[0].reviewed_by: recorder_not_for_module:macro-only'],
  ['reviewer differs from recorder',s=>{s.cases[0].reviewed_by='owner';},'cases[0].reviewed_by: same_as_recorded_by'],
  ['reviewed_at comes with reviewed_by',s=>{s.cases[0].reviewed_at=null;},'cases[0].reviewed_at: required_with_reviewed_by'],
  ['recorded_at required',s=>{s.cases[0].recorded_at=null;},'cases[0].recorded_at: date_or_timestamp_required'],
  ['missing has no printed',s=>{s.cases[0].expect='missing';delete s.cases[0].canonical;},'cases[0].printed: forbidden_when_missing'],
  ['missing has no canonical',s=>{s.cases[0].expect='missing';delete s.cases[0].printed;},'cases[0].canonical: forbidden_when_missing'],
  ['subject has no issuer_id',s=>{s.cases[0].subject.issuer_id='00000000-0000-4000-8000-000000000000';},'cases[0].subject.issuer_id: forbidden'],
  ['subject needs cik or ticker',s=>{s.cases[0].subject={market:'US'};},'cases[0].subject: cik_or_ticker_required'],
  ['tolerance rel < 1',s=>{s.tolerance={rel:'1'};},'tolerance: must_be_{rel}_with_0<=rel<1'],
  ['tolerance rel is a non-negative decimal string',s=>{s.tolerance={rel:'-0.1'};},'tolerance: must_be_{rel}_with_0<=rel<1'],
  ['tolerance is relative only',s=>{s.tolerance={rel:'0',abs:'1'};},'tolerance: must_be_{rel}_with_0<=rel<1'],
  ['min_coverage_optional ≤ 1',s=>{s.thresholds.min_coverage_optional='1.5';},'thresholds: must_be_{max_fail>=0,0<=min_coverage_optional<=1}'],
  ['optional_cases must name cases',s=>{s.optional_cases=['nope'];},'optional_cases: unknown_case:nope'],
  ['concept must be in CONCEPT_IDS',s=>{s.cases[0].target.concept='revenues';},'cases[0].target.concept: not_in_CONCEPT_IDS'],
  ['period_start key required in f6 (absent only in legacy)',s=>{delete s.cases[0].target.period_start;},'cases[0].target.period_start: required_(null_for_instant)'],
  ['instant concept needs INSTANT and null period_start',s=>{s.cases[1].target.duration='12M';},'cases[1].target: instant_concept_requires_INSTANT_and_null_period_start'],
  ['duration concept needs a period_start',s=>{s.cases[0].target.period_start=null;},'cases[0].target: duration_concept_requires_period_start_and_duration'],
  ['fact targets need module facts',s=>{s.module='metrics';},'cases[0].target.type: fact_target_requires_module_facts'],
  ['modules without adapters are rejected',s=>{s.module='macro';},'module: unsupported_in_this_phase'],
  ['duplicate case_id',s=>{s.cases[1]=goodCase();},'cases[1].case_id: duplicate'],
  ['unknown case key',s=>{s.cases[0].value='1';},'cases[0].value: unknown_key'],
  ['unknown set key',s=>{s.threshold={};},'threshold: unknown_key'],
  ['version > 1 needs a history entry',s=>{s.version=2;},'history: missing_entry_for_current_version'],
  ['history versions increase',s=>{s.version=3;s.history=[{version:3,changed_at:'2026-11-06',changed_by:'owner',reason:'r',fields:['thresholds']},{version:2,changed_at:'2026-11-06',changed_by:'owner',reason:'r',fields:['thresholds']}];},'history[1].version: not_increasing'],
  ['no mixing synthetic and transcribed',s=>{const c=s.cases[1];c.provenance_kind='synthetic';c.recorded_by='synthetic';c.reviewed_by=null;c.reviewed_at=null;},'cases: mixed_provenance_kind'],
  ['synthetic cases are recorded by "synthetic"',s=>{for(const c of s.cases){c.provenance_kind='synthetic';c.reviewed_by=null;c.reviewed_at=null;}},'cases[0].recorded_by: must_be_synthetic_for_synthetic_cases'],
  ['retracted.by must be a recorder',s=>{s.cases[0].retracted={at:'2026-11-06',by:'stranger',reason:'typo'};},'cases[0].retracted.by: not_in_recorders:stranger'],
  ['schema_version must be 1',s=>{s.schema_version=2;},'schema_version: must_be_1'],
 ];
 for(const [name,mutate,expected] of cases)it(name,()=>{expect(errorsOf(mutate)).toContain(expected);});
 it('reports every violation at once',()=>{
  expect(errorsOf(s=>{delete s.cases[0].source.sha256;s.cases[1].recorded_by='stranger';}).length).toBeGreaterThanOrEqual(2);
 });
});

describe('parseGoldSetF6: review_required (§4.6, Codex plan round 1 P2-3)',()=>{
 it('is a required boolean header field',()=>{
  expect(errorsOf(s=>{delete s.review_required;})).toEqual(['review_required: boolean_required']);
  expect(errorsOf(s=>{s.review_required='yes';})).toEqual(['review_required: boolean_required']);
 });
 it('true: every case needs a reviewer different from the recorder (30-company counter-example)',()=>{
  expect(errorsOf(s=>{s.review_required=true;})).toEqual([]);
  expect(errorsOf(s=>{s.review_required=true;(s.cases as J[])[0].reviewed_by=null;(s.cases as J[])[0].reviewed_at=null;})).toEqual(['cases[0].reviewed_by: required_by_review_required']);
 });
 it("set ids under 'facts/plan3' must set review_required true",()=>{
  expect(errorsOf(s=>{s.set_id='facts/plan3-30';})).toEqual(['review_required: must_be_true_for_this_set']);
  expect(errorsOf(s=>{s.set_id='facts/plan3-30';s.review_required=true;})).toEqual([]);
 });
});

describe('canonicalFromPrinted / unitOfSpec',()=>{
 const usd={kind:'currency',currency:'USD'} as const;
 it('removes thousands separators and applies the scale',()=>{
  expect(canonicalFromPrinted('383,285','1000000',usd)).toBe('383285000000');
  expect(canonicalFromPrinted('1,234.5','1000',usd)).toBe('1234500');
  expect(canonicalFromPrinted('0.12','1',usd)).toBe('0.12');
 });
 it('parentheses and a leading minus are negative',()=>{
  expect(canonicalFromPrinted('(1,234)','1000',usd)).toBe('-1234000');
  expect(canonicalFromPrinted('-1,234','1000',usd)).toBe('-1234000');
  expect(canonicalFromPrinted('(0)','1',usd)).toBe('0');
 });
 it('% divides by 100 for ratio only',()=>{
  expect(canonicalFromPrinted('12.5%','1',{kind:'ratio'})).toBe('0.125');
  expect(canonicalFromPrinted('(3%)','1',{kind:'ratio'})).toBe('-0.03');
  expect(canonicalFromPrinted('12.5%','1',usd)).toBeNull();
 });
 it('rejects non-numbers',()=>{
  for(const t of ['','$1','1 234','1,23','1e5','--1','(1','12.5 %x','１'])expect(canonicalFromPrinted(t,'1',usd),t).toBeNull();
 });
 it('maps unit specs to facts units and back',()=>{
  expect(unitOfSpec({kind:'currency',currency:'USD'})).toBe('USD');
  expect(unitOfSpec({kind:'shares'})).toBe('shares');
  expect(unitOfSpec({kind:'per_share',currency:'CNY'})).toBe('CNY/share');
  expect(unitOfSpec({kind:'ratio'})).toBe('pure');
  expect(unitOfSpec({kind:'index'})).toBeNull();
  expect(['USD','shares','CNY/share','pure'].map(u=>unitOfSpec(specOfUnit(u)!))).toEqual(['USD','shares','CNY/share','pure']);
  expect(specOfUnit('USD/EUR')).toBeNull();
 });
});

const metricCase=():J=>({case_id:'AAPL/gross_margin/2022-10-01..2023-09-30',subject:{market:'US',cik:'320193'},
 target:{type:'metric',metric:'gross_margin',period_start:'2022-10-01',period_end:'2023-09-30',duration:'12M',basis:'us_standard',input_unit:'USD',formula_version:'facts-derive/1.0',unit:{kind:'ratio'}},
 expect:'present',printed:{text:'44.1%',unit_label:'percent',scale:'1'},canonical:{value:'0.441'},binding:'current',
 source:{document_type:'10-K',url:'https://www.sec.gov/x',sha256:'b'.repeat(64),available_date:'2023-11-03',locator:{page:1}},
 provenance_kind:'transcribed',recorded_by:'owner',recorded_at:'2026-11-06',reviewed_by:null,reviewed_at:null,retracted:null,notes:''});
const metricSet=():J=>({...goodSet(),set_id:'metrics/test',module:'metrics',cases:[metricCase()]});
function errs(s:J):string[]{try{parseGoldSetF6(s,META,RECORDERS);return [];}catch(e){expect(e).toBeInstanceOf(EvalError);return (e as EvalError).detail.errors as string[];}}
describe('review follow-ups: metric targets',()=>{
 it('a valid metric set parses with as_of from available_date',()=>{
  const set=parseGoldSetF6(metricSet(),META,RECORDERS);
  expect(set.cases[0]).toMatchObject({binding:'current',as_of:'2023-11-03'});
 });
 const rej:[string,(s:J)=>void,string][]=[
  ['binding must be current',s=>{s.cases[0].binding='document';s.cases[0].source.document_id={kind:'edgar_accession',value:'0000320193-23-000106'};},'cases[0].binding: metric_requires_current_binding'],
  ['available_date required',s=>{delete s.cases[0].source.available_date;},'cases[0].source.available_date: required_for_current_binding'],
  ['unknown metric',s=>{s.cases[0].target.metric='nope';},'cases[0].target.metric: not_in_metricNames'],
  ['CN-only metric for US',s=>{s.cases[0].target.metric='q_single_capex_incl_intangibles';},'cases[0].target.metric: not_in_metricNames'],
  ['duration',s=>{s.cases[0].target.duration='1Y';},'cases[0].target.duration: invalid'],
  ['basis',s=>{s.cases[0].target.basis='cn_standard';},'cases[0].target.basis: not_emitted_by_derive'],
  ['input_unit',s=>{s.cases[0].target.input_unit='xyz';},'cases[0].target.input_unit: not_a_facts_unit'],
  ['formula_version',s=>{s.cases[0].target.formula_version='facts-derive/0.1';},'cases[0].target.formula_version: not_FORMULA_VERSION'],
  ['metric under facts',s=>{s.module='facts';},'cases[0].target.type: metric_target_requires_module_metrics'],
 ];
 for(const [n,m,e] of rej)it(n,()=>{const s=metricSet();m(s);expect(errs(s)).toContain(e);});
 it('TTM duration is allowed',()=>{const s=metricSet();s.cases[0].target.metric='roe';s.cases[0].target.duration='TTM';expect(errs(s)).toEqual([]);});
});
describe('review follow-ups: dates, retraction, grammar, history',()=>{
 const rej:[string,(s:J)=>void,string][]=[
  ['impossible calendar date',s=>{s.cases[0].target.period_end='2023-02-30';},'cases[0].target.period_end: date'],
  ['impossible available_date',s=>{s.cases[0].source.available_date='2023-13-01';},'cases[0].source.available_date: date'],
  ['period_start before period_end',s=>{s.cases[0].target.period_start='2023-09-30';},'cases[0].target: period_start_must_precede_period_end'],
  ['retracted.by implementer',s=>{s.cases[0].retracted={at:'2026-11-06',by:'claude-code',reason:'r'};},'cases[0].retracted.by: is_module_implementer:claude-code'],
  ['retracted.by module coverage',s=>{s.cases[0].retracted={at:'2026-11-06',by:'macro-only',reason:'r'};},'cases[0].retracted.by: recorder_not_for_module:macro-only'],
  ['600-digit text',s=>{s.cases[0].printed.text='9'.repeat(600);},'cases[0].printed.text: unparseable'],
  ['leading zeros',s=>{s.cases[0].printed.text='000123';},'cases[0].printed.text: unparseable'],
  ['leading zero group',s=>{s.cases[0].printed.text='0,123';},'cases[0].printed.text: unparseable'],
  ['history changed_by',s=>{s.version=2;s.history=[{version:2,changed_at:'2026-11-06',changed_by:'stranger',reason:'r',fields:['x']}];},'history[0].changed_by: not_in_recorders:stranger'],
  ['cninfo requires CN',s=>{s.cases[0].source.document_id={kind:'cninfo_announcement',value:'123'};},'cases[0].source.document_id: cninfo_announcement_requires_CN'],
  ['cninfo digits',s=>{s.cases[0].subject={market:'CN',ticker:'600519.SH'};s.cases[0].source.document_id={kind:'cninfo_announcement',value:'12a'};},'cases[0].source.document_id.value: digits'],
  ['not a facts document',s=>{s.cases[0].source.document_id={kind:'file_sha256',value:'a'};},'cases[0].source.document_id.kind: not_a_facts_document'],
  ['synthetic reviewer must be null',s=>{const c=s.cases[0];c.provenance_kind='synthetic';c.recorded_by='synthetic';},'cases[0].reviewed_by: must_be_null_for_synthetic_cases'],
  ['reviewed_at without reviewer',s=>{s.cases[0].reviewed_by=null;},'cases[0].reviewed_at: forbidden_without_reviewed_by'],
  ['history above version',s=>{s.version=2;s.history=[{version:2,changed_at:'2026-11-06',changed_by:'owner',reason:'r',fields:['x']},{version:3,changed_at:'2026-11-06',changed_by:'owner',reason:'r',fields:['x']}];},'history[1].version: above_set_version'],
  ['canonical shape',s=>{s.cases[0].canonical={value:'1',x:1};},'cases[0].canonical: must_be_{value}'],
 ];
 for(const [n,m,e] of rej){it(n,()=>{const s=goodSet();m(s);expect(errs(s)).toContain(e);});}
 it('space before % is rejected; ratio needs scale 1',()=>{
  expect(canonicalFromPrinted('12.5 %','1',{kind:'ratio'})).toBeNull();
  const m=metricSet();m.cases[0].printed.scale='1000';m.cases[0].canonical.value='441';m.cases[0].printed.text='0.441';
  expect(errs(m)).toContain('cases[0].printed.scale: ratio_requires_scale_1');
 });
 it('canonicalFromPrinted never throws',()=>{expect(()=>canonicalFromPrinted('9'.repeat(300),'1000000000',{kind:'ratio'})).not.toThrow();});
});

describe('review round 2: INSTANT metrics and CN bases',()=>{
 const borrow=(market:'US'|'CN',basis:string,over:J={})=>{
  const s=metricSet();const c=s.cases[0];
  c.subject=market==='US'?{market:'US',cik:'320193'}:{market:'CN',ticker:'600519.SH'};
  c.case_id=`${market}/borrowings_total/2023-09-30`;
  c.target={...c.target,metric:'borrowings_total',period_start:'2023-09-30',period_end:'2023-09-30',duration:'INSTANT',basis,input_unit:market==='US'?'USD':'CNY',unit:{kind:'currency',currency:market==='US'?'USD':'CNY'},...over};
  c.printed={text:'1,000',unit_label:'',scale:'1'};c.canonical={value:'1000'};
  return s;
 };
 it('accepts US and CN borrowings_total (period_start === period_end)',()=>{
  expect(errs(borrow('US','us_standard'))).toEqual([]);
  expect(errs(borrow('CN','cn_incl_bonds'))).toEqual([]);
 });
 it('accepts every basis derive.ts emits for CN',()=>{
  for(const b of ['cn_standard','cn_incl_intangibles','cn_incl_bonds'])expect(errs(borrow('CN',b)),b).toEqual([]);
  expect(errs(borrow('US','cn_incl_bonds'))).toContain('cases[0].target.basis: not_emitted_by_derive');
 });
 it('INSTANT needs equal dates; duration metrics keep strict ordering',()=>{
  expect(errs(borrow('US','us_standard',{period_start:'2023-06-30'}))).toContain('cases[0].target: instant_metric_requires_equal_period_dates');
  const s=metricSet();s.cases[0].target.period_start='2023-09-30';s.cases[0].target.period_end='2023-09-30';
  expect(errs(s)).toContain('cases[0].target: period_start_must_precede_period_end');
 });
});

// These builders are synthetic contract examples, never admitted human labels.
describe('provenance admission boundaries',()=>{
 it.each(['2026-02-30','2025-02-29','2026-11-07T25:00:00Z','2026-11-07T00:00:00+25:00'])('rejects impossible recording/review dates: %s',date=>{
  expect(errorsOf(s=>{s.cases[0].recorded_at=date;})).toContain('cases[0].recorded_at: date_or_timestamp_required');
  expect(errorsOf(s=>{s.cases[0].reviewed_at=date;})).toContain('cases[0].reviewed_at: required_with_reviewed_by');
 });
 it('rejects impossible history and retraction dates',()=>{
  expect(errorsOf(s=>{s.version=2;s.history=[{version:2,changed_at:'2026-02-30',changed_by:'owner',reason:'test',fields:['notes']}];})).not.toEqual([]);
  expect(errorsOf(s=>{s.cases[0].retracted={at:'2026-02-30',by:'owner',reason:'test'};})).not.toEqual([]);
 });
 it.each([{row:' '},{'':'Revenue'},{page:0},{page:-1},{page:1.5},{page:'0'},{row:'Revenue',column:''}])('rejects unusable locators: %j',locator=>{
  expect(errorsOf(s=>{s.cases[0].source.locator=locator;})).not.toEqual([]);
 });
 it('accepts HTML row locators, positive printed page strings and leap-day provenance',()=>{
  expect(errorsOf(s=>{s.cases[0].source.locator={row:'Revenue'};s.cases[0].recorded_at='2024-02-29';})).toEqual([]);
  expect(errorsOf(s=>{s.cases[0].source.locator={page:'F-28'};})).toEqual([]);
 });
 it.each(['OWNER',' owner '])('rejects noncanonical implementer identities: %s',id=>{
  expect(errorsOf(s=>{s.module_implementers=[id];})).not.toEqual([]);
 });
});
