// src/lib/evals/gold/legacy-plan2.test.ts
// The adapter against the REAL plan2.json (read-only, spec §0 R5-1) and against an in-test recorded variant.
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {sha256Hex} from '../canonical-json';
import {EvalError} from '../errors';
import {goldBlockOf} from '../summary';
import {LEGACY_SET_ID,parseLegacyPlan2} from './legacy-plan2';

const PLAN2='src/lib/facts/fixtures/gold/plan2.json';
const bytes=readFileSync(PLAN2);
const meta={path:PLAN2,sha256:sha256Hex(bytes)};
const real=()=>JSON.parse(bytes.toString('utf8'));

describe('parseLegacyPlan2 on the real plan2.json',()=>{
 const set=parseLegacyPlan2(real(),meta);
 it('keeps the file identity: set id, version, ready, byte hash, path',()=>{
  expect(set).toMatchObject({schema_version:1,format:'legacy_plan2',set_id:LEGACY_SET_ID,version:1,module:'facts',artifact_class:'public',ready:false,path:PLAN2,sha256:meta.sha256,
   module_implementers:['claude-code','codex'],tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},history:[]});
 });
 it('maps the 3 entries to deterministic case ids; US required (required.US), CN optional (required.CN=false)',()=>{
  expect(set.cases.map(c=>[c.case_id,c.required])).toEqual([
   ['AAPL/revenue/2023-09-30/12M/USD',true],
   ['MSFT/revenue/2023-06-30/12M/USD',true],
   ['600519.SH/revenue/2023-12-31/12M/CNY',false],
  ]);
  expect(set.optional_cases).toEqual(['600519.SH/revenue/2023-12-31/12M/CNY']);
 });
 it('every entry is pending (recorded_by or value is <pending>)',()=>{
  expect(set.cases.map(c=>c.pending)).toEqual([true,true,true]);
 });
 it('binds current, as_of = entry.as_of ?? null, period_start ABSENT, duration 12M, subject {market,ticker}',()=>{
  const [aapl,msft,mt]=set.cases;
  expect(aapl).toMatchObject({binding:'current',as_of:'2023-11-03',subject:{market:'US',ticker:'AAPL'},expect:'present',canonical:{value:'383285000000'},recorded_by:'<pending>',recorded_at:null,reviewed_by:null,retracted:null});
  expect(aapl.target).toEqual({type:'fact',concept:'revenue',period_end:'2023-09-30',duration:'12M',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}});
  expect('period_start' in aapl.target).toBe(false);
  expect(msft.as_of).toBe('2023-07-27');
  expect(mt).toMatchObject({as_of:null,subject:{market:'CN',ticker:'600519.SH'}});
  expect(mt.canonical).toBeUndefined();
  expect(aapl.printed).toBeUndefined();
  expect(aapl.source.document_id).toBeUndefined();
 });
 it('lists every missing F6 provenance field',()=>{
  expect(set.cases[0].provenance_gaps).toEqual(['source.document_id','source.sha256','source.locator','printed','recorded_by','recorded_at','reviewed_by']);
  expect(set.cases[1].provenance_gaps).toEqual(['source.document_id','source.sha256','source.url','source.locator','printed','recorded_by','recorded_at','reviewed_by']);
  expect(set.cases[2].provenance_gaps).toEqual(['source.document_id','source.sha256','source.url','source.locator','printed','canonical','recorded_by','recorded_at','reviewed_by']);
 });
 it('its gold block keeps any run incomplete (§3.2 rule 1)',()=>{
  expect(goldBlockOf(set)).toEqual({format:'legacy_plan2',ready:false,pending:3,provenance_gaps:3});
 });
});

describe('parseLegacyPlan2 on a recorded variant',()=>{
 const recorded=()=>{
  const f=real();
  f.ready=true;
  f.entries[0]={...f.entries[0],recorded_by:'owner',recorded_at:'2026-11-06',source:{...f.entries[0].source,page_or_row:'p. 28, Total net sales'}};
  f.entries.push({issuer:{ticker:'AAPL',market:'US'},concept:'total_assets',period_end:'2023-09-30',unit:'USD',value:'352583000000',recorded_by:'owner',recorded_at:'2026-11-06',source:{document:'10-K',page_or_row:'p. 30',url:'https://www.sec.gov/x'}});
  f.entries.push({issuer:{ticker:'AAPL',market:'US'},concept:'eps_basic',period_end:'2023-09-30',duration:'12M',unit:'USD/share',value:'6.16',recorded_by:'owner',recorded_at:'2026-11-06'});
  return f;
 };
 const set=parseLegacyPlan2(recorded(),meta);
 it('a recorded entry is not pending but still has the gaps no legacy entry can fill',()=>{
  expect(set.ready).toBe(true);
  expect(set.cases[0].pending).toBe(false);
  expect(set.cases[0].source.locator).toEqual({page_or_row:'p. 28, Total net sales'});
  expect(set.cases[0].provenance_gaps).toEqual(['source.document_id','source.sha256','printed','reviewed_by']);
  expect(goldBlockOf(set)).toMatchObject({ready:true,pending:2,provenance_gaps:5});
 });
 it('instant concepts default to INSTANT; per-share units map to per_share; explicit duration is kept',()=>{
  expect(set.cases[3]).toMatchObject({case_id:'AAPL/total_assets/2023-09-30/INSTANT/USD',as_of:null,target:{duration:'INSTANT'},source:{url:'https://www.sec.gov/x'}});
  expect(set.cases[4]).toMatchObject({case_id:'AAPL/eps_basic/2023-09-30/12M/USD/share',target:{unit:{kind:'per_share',currency:'USD'}},source:{url:''}});
 });
});

describe('legacy pending by value',()=>{
 it('value <pending> alone makes the entry pending',()=>{
  const f=real();f.entries[0]={...f.entries[0],recorded_by:'owner',value:'<pending>'};
  expect(parseLegacyPlan2(f,meta).cases[0].pending).toBe(true);
 });
});

describe('parseLegacyPlan2 throws only for structurally invalid files',()=>{
 const code=(mutate:(f:Record<string,any>)=>void)=>{const f=real();mutate(f);try{parseLegacyPlan2(f,meta);return null;}catch(e){expect(e).toBeInstanceOf(EvalError);return (e as EvalError).detail.errors;}};
 it('accepts pending values and missing sources',()=>{expect(code(f=>{delete f.entries[0].source;f.entries[0].value='<pending>';})).toBeNull();});
 it('rejects bad structure',()=>{
  expect(code(f=>{f.ready='no';})).toEqual(['ready: boolean']);
  expect(code(f=>{delete f.required;})).toEqual(['required: {US:boolean,CN:boolean}']);
  expect(code(f=>{f.entries[0].concept='revenues';})).toEqual(['entries[0].concept: not_in_CONCEPT_IDS']);
  expect(code(f=>{f.entries[0].unit='USD/EUR';})).toEqual(['entries[0].unit: not_a_facts_unit']);
  expect(code(f=>{f.entries[0].value='383,285';})).toEqual(['entries[0].value: decimal_or_<pending>']);
  expect(code(f=>{f.entries[0].duration='1Y';})).toEqual(['entries[0].duration: invalid']);
  expect(code(f=>{f.entries[0].issuer.market='HK';})).toEqual(['entries[0].issuer: {ticker,market:US|CN}']);
  expect(code(f=>{f.entries.push(f.entries[0]);})).toEqual(['entries[3]: duplicate_case:AAPL/revenue/2023-09-30/12M/USD']);
  expect(code(f=>{f.entries[0].as_of='2023/11/03';})).toEqual(['entries[0].as_of: date_or_null']);
 });
});
