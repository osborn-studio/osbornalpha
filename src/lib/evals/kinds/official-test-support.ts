// src/lib/evals/kinds/official-test-support.ts
// TEST-ONLY builders shared by kinds/official.test.ts, run-gold-set.test.ts and cli/run-cli.test.ts: an f6 GoldCase and
// GoldSet, a facts ReadRow, a fixed EvalEnv, and a scripted ModuleReader (optionally privileged) that records how it
// was called. Nothing outside tests imports this file.
import type {CaseTarget,DocumentId,EvalEnv,GoldCase,GoldSet,ModuleReader,PrivilegedReader,ProvenanceCheck,ReadResult,ReadRow} from '../types';

export const ISSUER='00000000-0000-4000-8000-000009990611';
export const ACCN='0009990611-24-000001';
export const env=(over:Partial<EvalEnv>={}):EvalEnv=>({today:'2026-11-20',now:()=>new Date('2026-11-20T00:00:00.000Z'),evaluatorCodeVersion:'a'.repeat(40),dirty:false,...over});
export function gcase(over:Partial<GoldCase>={}):GoldCase{
 return {case_id:'ZZEVU/revenue/2023-01-01..2023-12-31/consolidated/USD/document',subject:{market:'US',cik:'9990611'},
  target:{type:'fact',concept:'revenue',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}},
  expect:'present',printed:{text:'1,000',unit_label:'USD',scale:'1'},canonical:{value:'1000'},binding:'document',as_of:null,
  source:{document_type:'10-K',document_id:{kind:'edgar_accession',value:ACCN},url:'https://www.sec.gov/Archives/edgar/data/9990611/000999061124000001/',sha256:'d'.repeat(64),available_date:'2024-02-15',locator:{table:'companyfacts',row:'us-gaap:Revenues',column:'2023-01-01..2023-12-31'}},
  provenance_kind:'transcribed',recorded_by:'owner',recorded_at:'2026-11-06T00:00:00Z',reviewed_by:null,reviewed_at:null,retracted:null,notes:'',
  required:true,pending:false,provenance_gaps:[],...over};
}
export function gset(cases:GoldCase[],over:Partial<GoldSet>={}):GoldSet{
 return {schema_version:1,format:'f6',set_id:'facts/unit',version:1,module:'facts',artifact_class:'public',module_implementers:['claude-code','codex'],review_required:false,
  tolerance:{rel:'0'},thresholds:{max_fail:0,min_coverage_optional:'0.95'},optional_cases:cases.filter(c=>!c.required).map(c=>c.case_id),history:[],cases,
  ready:true,path:'src/lib/evals/fixtures/gold/facts/unit.json',sha256:'e'.repeat(64),...over};
}
export const readRow=(over:Partial<ReadRow>={}):ReadRow=>({value_text:'1000',unit:'USD',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',available_date:'2024-02-15',
 fact_id:'f-1',filing_id:'g-1',source_ref:ACCN,mapping_gen:1,mapping_version:'facts-map/1',raw_hash:'a'.repeat(64),run_id:'r-1',status:'ok',...over});

export interface ReaderCalls{resolve:string[];document:{target:CaseTarget;doc:DocumentId;today:string}[];current:{target:CaseTarget;asOf:string}[];nonVisible:{doc:DocumentId|null;asOf:string}[];provenance:{row:ReadRow;artifacts:boolean}[]}
export interface FakeReaderOptions{
 /** cik or ticker → issuer id (default {'9990611': ISSUER}). */
 subjects?:Record<string,string>;
 /** Rows of a read (doc null = current binding); a ReadResult injects errors / truncation. Default: [readRow()]. */
 rows?:(target:CaseTarget,doc:DocumentId|null,asOf:string)=>ReadRow[]|ReadResult;
 /** Present → the reader is a PrivilegedReader. */
 privileged?:{nonVisible?:'quarantined'|'superseded_generation'|null;provenance?:(row:ReadRow,opts:{artifacts:boolean})=>ProvenanceCheck};
 stateRev?:number|null;
}
export type FakeReader=(ModuleReader|PrivilegedReader)&{calls:ReaderCalls};
export function fakeReader(o:FakeReaderOptions={}):FakeReader{
 const calls:ReaderCalls={resolve:[],document:[],current:[],nonVisible:[],provenance:[]};
 const subjects=o.subjects??{'9990611':ISSUER};
 const result=(target:CaseTarget,doc:DocumentId|null,asOf:string):ReadResult=>{const r=(o.rows??(()=>[readRow()]))(target,doc,asOf);return Array.isArray(r)?{rows:r,truncated:false,stateRev:7}:r;};
 const base:ModuleReader&{calls:ReaderCalls}={
  module:'facts',privileged:false,calls,
  async resolveSubject(s){const key=s.cik??s.ticker??'';calls.resolve.push(key);const id=subjects[key];return id?{issuerId:id,market:s.market}:null;},
  async readDocumentBound(_ref,target,doc,today){calls.document.push({target,doc,today});return result(target,doc,today);},
  async readCurrent(_ref,target,asOf){calls.current.push({target,asOf});return result(target,null,asOf);},
  async project(){throw new Error('projector_missing');},
  async stateRev(){return o.stateRev===undefined?7:o.stateRev;},
 };
 if(!o.privileged)return base;
 const p=o.privileged;
 const priv:PrivilegedReader&{calls:ReaderCalls}={...base,privileged:true,
  async readNonVisible(_ref,_target,doc,asOf){calls.nonVisible.push({doc,asOf});return p.nonVisible??null;},
  async resolveProvenance(_ref,row,opts){calls.provenance.push({row,artifacts:opts.artifacts});return p.provenance?p.provenance(row,opts):{ok:true,missing:[],producer_code_version:'c'.repeat(40),object_path:`edgar/${ISSUER}/${'b'.repeat(64)}.json`,locator:'facts.us-gaap.Revenues.units.USD[0](accn=0009990611-24-000001,start=2023-01-01,end=2023-12-31)'};},
  async hints(){return [];},
 };
 return priv;
}
