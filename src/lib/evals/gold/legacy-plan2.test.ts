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

type Raw=Record<string,any>;
describe('parseLegacyPlan2 on the real plan2.json (properties, not counts)',()=>{
 const file=real() as Raw;
 const set=parseLegacyPlan2(file,meta);
 const idOf=(e:Raw)=>`${e.issuer.ticker}/${e.concept}/${e.period_end}/${e.duration??(['total_assets','cash','equity_parent','short_term_borrowings','long_term_borrowings','bonds_payable'].includes(e.concept)?'INSTANT':'12M')}/${e.unit}`;
 it('keeps the file identity: set id, version, ready, byte hash, path',()=>{
  expect(set).toMatchObject({schema_version:1,format:'legacy_plan2',set_id:LEGACY_SET_ID,version:file.version,module:'facts',artifact_class:'public',ready:file.ready,path:PLAN2,sha256:meta.sha256,
   module_implementers:['claude-code','codex'],tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},history:[]});
 });
 it('maps every entry to a unique deterministic case id, in file order',()=>{
  expect(set.cases).toHaveLength(file.entries.length);
  expect(new Set(set.cases.map(c=>c.case_id)).size).toBe(set.cases.length);
  set.cases.forEach((c,i)=>{
   const e=file.entries[i];
   expect(c.case_id.startsWith(`${e.issuer.ticker}/${e.concept}/${e.period_end}/`)).toBe(true);
   expect(c.case_id.endsWith(`/${e.unit}`)).toBe(true);
   if(e.concept==='revenue')expect(c.case_id).toBe(idOf(e));
  });
 });
 it('US cases follow required.US, CN cases follow required.CN; optional_cases lists exactly the non-required',()=>{
  for(const [i,c] of set.cases.entries()){
   const m=file.entries[i].issuer.market as 'US'|'CN';
   expect(c.required).toBe(file.required[m]);
  }
  expect(set.optional_cases).toEqual(set.cases.filter(c=>!c.required).map(c=>c.case_id));
  expect(set.cases.some(c=>c.subject.market==='CN')).toBe(true);
 });
 it('an entry is pending exactly when recorded_by or value is <pending>',()=>{
  set.cases.forEach((c,i)=>{const e=file.entries[i];expect(c.pending).toBe(e.recorded_by==='<pending>'||e.value==='<pending>');});
  expect(set.cases.every(c=>c.pending)).toBe(true);
 });
 it('binds current, as_of = entry.as_of ?? null, period_start ABSENT, subject {market,ticker}, canonical only for a non-pending value',()=>{
  set.cases.forEach((c,i)=>{
   const e=file.entries[i];
   expect(c).toMatchObject({binding:'current',as_of:e.as_of??null,subject:{market:e.issuer.market,ticker:e.issuer.ticker},expect:'present',reviewed_by:null,retracted:null});
   expect('period_start' in c.target).toBe(false);
   expect(c.canonical).toEqual(e.value==='<pending>'?undefined:{value:e.value});
   expect(c.printed).toBeUndefined();
   expect(c.source.document_id).toBeUndefined();
  });
 });
 it('every case lists the gaps no legacy entry can fill, in the fixed order',()=>{
  for(const c of set.cases){
   expect(c.provenance_gaps.slice(0,2)).toEqual(['source.document_id','source.sha256']);
   expect(c.provenance_gaps.at(-1)).toBe('reviewed_by');
   expect(c.provenance_gaps).toContain('printed');
  }
 });
 it('its gold block keeps any run incomplete (§3.2 rule 1)',()=>{
  const g=goldBlockOf(set);
  expect(g).toMatchObject({format:'legacy_plan2',ready:file.ready,pending:set.cases.length});
  expect(g.provenance_gaps).toBe(set.cases.length);
 });
});

// A fixed in-test fixture: variants are built from this, never from the real file.
const fixture=():Raw=>({version:1,ready:false,required:{US:true,CN:false},entries:[
 {issuer:{ticker:'AAPL',market:'US'},concept:'revenue',period_end:'2023-09-30',unit:'USD',value:'383285000000',as_of:'2023-11-03',source:{document:'10-K',page_or_row:'<pending>',url:'https://www.sec.gov/a/'},recorded_by:'<pending>',recorded_at:null},
 {issuer:{ticker:'MSFT',market:'US'},concept:'revenue',period_end:'2023-06-30',unit:'USD',value:'211915000000',as_of:'2023-07-27',source:{document:'10-K',page_or_row:'<pending>',url:'<pending>'},recorded_by:'<pending>',recorded_at:null},
 {issuer:{ticker:'600519.SH',market:'CN'},concept:'revenue',period_end:'2023-12-31',unit:'CNY',value:'<pending>',source:{document:'ar',page_or_row:'<pending>',url:'<pending>'},recorded_by:'<pending>',recorded_at:null},
]});
const fmeta={path:'fixture/plan2.json',sha256:'0'.repeat(64)};

describe('parseLegacyPlan2 on a fixed fixture',()=>{
 const set=parseLegacyPlan2(fixture(),fmeta);
 it('maps ids, required, optional and pending',()=>{
  expect(set.cases.map(c=>[c.case_id,c.required,c.pending])).toEqual([
   ['AAPL/revenue/2023-09-30/12M/USD',true,true],['MSFT/revenue/2023-06-30/12M/USD',true,true],['600519.SH/revenue/2023-12-31/12M/CNY',false,true]]);
  expect(set.optional_cases).toEqual(['600519.SH/revenue/2023-12-31/12M/CNY']);
  expect(set.cases[2].as_of).toBeNull();
  expect(set.cases[2].canonical).toBeUndefined();
  expect(set.cases[0]).toMatchObject({as_of:'2023-11-03',canonical:{value:'383285000000'}});
 });
 it('lists every missing F6 provenance field',()=>{
  expect(set.cases[0].provenance_gaps).toEqual(['source.document_id','source.sha256','source.locator','printed','recorded_by','recorded_at','reviewed_by']);
  expect(set.cases[1].provenance_gaps).toEqual(['source.document_id','source.sha256','source.url','source.locator','printed','recorded_by','recorded_at','reviewed_by']);
  expect(set.cases[2].provenance_gaps).toEqual(['source.document_id','source.sha256','source.url','source.locator','printed','canonical','recorded_by','recorded_at','reviewed_by']);
  expect(goldBlockOf(set)).toEqual({format:'legacy_plan2',ready:false,pending:3,provenance_gaps:3});
 });
});

describe('parseLegacyPlan2 on a recorded variant',()=>{
 const recorded=()=>{
  const f=fixture();
  f.ready=true;
  f.entries[0]={...f.entries[0],recorded_by:'owner',recorded_at:'2026-11-06',source:{...f.entries[0].source,page_or_row:'p. 28, Total net sales'}};
  f.entries.push({issuer:{ticker:'AAPL',market:'US'},concept:'total_assets',period_end:'2023-09-30',unit:'USD',value:'352583000000',recorded_by:'owner',recorded_at:'2026-11-06',source:{document:'10-K',page_or_row:'p. 30',url:'https://www.sec.gov/x'}});
  f.entries.push({issuer:{ticker:'AAPL',market:'US'},concept:'eps_basic',period_end:'2023-09-30',duration:'12M',unit:'USD/share',value:'6.16',recorded_by:'owner',recorded_at:'2026-11-06'});
  return f;
 };
 const set=parseLegacyPlan2(recorded(),fmeta);
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
  const f=fixture();f.entries[0]={...f.entries[0],recorded_by:'owner',value:'<pending>'};
  expect(parseLegacyPlan2(f,fmeta).cases[0].pending).toBe(true);
 });
});

describe('parseLegacyPlan2 throws only for structurally invalid files',()=>{
 const code=(mutate:(f:Record<string,any>)=>void)=>{const f=fixture();mutate(f);try{parseLegacyPlan2(f,fmeta);return null;}catch(e){expect(e).toBeInstanceOf(EvalError);return (e as EvalError).detail.errors;}};
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
