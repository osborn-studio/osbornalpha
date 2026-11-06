// src/lib/evals/kinds/official.test.ts
import {describe,expect,it} from 'vitest';
import {sha256Hex} from '../canonical-json';
import type {CaseReport,GoldCase,MetricTarget,ProvenanceCheck,ReadRow} from '../types';
import {ANON_PRODUCER,evaluateOfficial} from './official';
import type {OfficialContext} from './official';
import {ACCN,ISSUER,env,fakeReader,gcase,readRow} from './official-test-support';
import type {FakeReaderOptions} from './official-test-support';

const ctx=(over:Partial<OfficialContext>={}):OfficialContext=>({env:env(),privileged:false,verify:{artifacts:false,sources:false},tolerance:'0',...over});
const one=async(c:GoldCase,o:FakeReaderOptions={},over:Partial<OfficialContext>={}):Promise<CaseReport>=>(await evaluateOfficial([c],fakeReader(o),ctx(over)))[0];
const MISSING=gcase({case_id:'m',expect:'missing',printed:undefined,canonical:undefined});
const VERIFY_SOURCES={artifacts:false,sources:true};

describe('evaluateOfficial — every §3.3 outcome (spec §5.1)',()=>{
 it('pass: equal value; unprivileged provenance = required fields present, producer unavailable:anon, sources skipped',async()=>{
  const r=await one(gcase());
  expect(r.outcome).toEqual({result:'pass'});
  expect(r).toMatchObject({case_id:gcase().case_id,required:true,left:'1000',right:'1000',tolerance:'0'});
  expect(r.abs_diff).not.toBeNull();expect(r.rel_diff).not.toBeNull();
  expect(r.provenance).toEqual({ok:true,missing:[],producer_code_version:ANON_PRODUCER,source_verified:'skipped'});
  expect(r.detail).toMatchObject({binding:'document',as_of:null,document_type:'10-K',document_id:{kind:'edgar_accession',value:ACCN},locator:{table:'companyfacts'},fact_id:'f-1',source_ref:ACCN,unit:'USD',expected_unit:'USD',rows:1});
 });
 it('document binding reads the named filing at env.today; current binding reads at as_of, or env.today when as_of is null',async()=>{
  const reader=fakeReader();
  await evaluateOfficial([gcase(),gcase({case_id:'c1',binding:'current',as_of:'2024-02-15'}),gcase({case_id:'c2',binding:'current',as_of:null})],reader,ctx());
  expect(reader.calls.document).toEqual([{target:gcase().target,doc:{kind:'edgar_accession',value:ACCN},today:'2026-11-20'}]);
  expect(reader.calls.current.map(c=>c.asOf)).toEqual(['2024-02-15','2026-11-20']);
  expect(reader.calls.resolve).toEqual(['9990611','9990611','9990611']);
 });
 it('expect missing: no row of the target unit → expected_absent; a row of that unit → fail(unexpected_value)',async()=>{
  expect((await one(MISSING,{rows:()=>[]})).outcome).toEqual({result:'expected_absent'});
  expect((await one(MISSING,{rows:()=>[readRow({unit:'EUR'})]})).outcome).toEqual({result:'expected_absent'});
  const r=await one(MISSING);
  expect(r.outcome).toEqual({result:'fail',reason:'unexpected_value'});expect(r.left).toBe('1000');expect(r.right).toBeNull();
 });
 it('fail(value) carries both sides and no provenance; a relative tolerance admits a near value',async()=>{
  const r=await one(gcase(),{rows:()=>[readRow({value_text:'1005'})]});
  expect(r.outcome).toEqual({result:'fail',reason:'value'});
  expect(r).toMatchObject({left:'1005',right:'1000',provenance:null});
  expect((await one(gcase(),{rows:()=>[readRow({value_text:'1005'})]},{tolerance:'0.01'})).outcome).toEqual({result:'pass'});
 });
 it('more than one row in the target unit → fail(ambiguous)',async()=>{
  const r=await one(gcase(),{rows:()=>[readRow({fact_id:'f-1'}),readRow({fact_id:'f-2'})]});
  expect(r.outcome).toEqual({result:'fail',reason:'ambiguous'});
  expect(r.detail).toMatchObject({rows:2,fact_ids:['f-1','f-2']});
 });
 it('unit_mismatch: the only row is in another unit, or several rows none in the target unit; per_share maps to <ccy>/share',async()=>{
  const single=await one(gcase(),{rows:()=>[readRow({unit:'EUR'})]});
  expect(single.outcome).toEqual({result:'unit_mismatch'});
  expect(single).toMatchObject({left:'1000',detail:{units:['EUR'],expected_unit:'USD'}});
  expect((await one(gcase(),{rows:()=>[readRow({unit:'EUR'}),readRow({unit:'GBP'})]})).outcome).toEqual({result:'unit_mismatch'});
  const eps=gcase({target:{type:'fact',concept:'eps_diluted',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',unit:{kind:'per_share',currency:'USD'}},canonical:{value:'1.25'},printed:{text:'1.25',unit_label:'USD per share',scale:'1'}});
  expect((await one(eps,{rows:()=>[readRow({unit:'USD/share',value_text:'1.25'}),readRow({unit:'shares',value_text:'7'})]})).outcome).toEqual({result:'pass'});
 });
 it('provenance_incomplete: a passing value whose source chain lacks a required field (unprivileged)',async()=>{
  const r=await one(gcase(),{rows:()=>[readRow({raw_hash:undefined})]});
  expect(r.outcome).toEqual({result:'provenance_incomplete',reason:'fields_missing'});
  expect(r.provenance).toMatchObject({ok:false,missing:['raw_hash'],producer_code_version:ANON_PRODUCER});
  expect(r).toMatchObject({left:'1000',right:'1000'});
 });
 it('missing: no row in an unprivileged run (non-visible rows are never asked for, even of a privileged reader)',async()=>{
  const reader=fakeReader({rows:()=>[],privileged:{nonVisible:'quarantined'}});
  const [r]=await evaluateOfficial([gcase()],reader,ctx({privileged:false}));
  expect(r.outcome).toEqual({result:'missing'});expect(reader.calls.nonVisible).toEqual([]);
 });
 it('not_visible: privileged run, the key exists but quarantined or on a superseded generation; null → missing',async()=>{
  const reader=fakeReader({rows:()=>[],privileged:{nonVisible:'quarantined'}});
  const [r]=await evaluateOfficial([gcase()],reader,ctx({privileged:true}));
  expect(r.outcome).toEqual({result:'not_visible',reason:'quarantined'});
  expect(reader.calls.nonVisible).toEqual([{doc:{kind:'edgar_accession',value:ACCN},asOf:'2026-11-20'}]);
  expect((await one(gcase(),{rows:()=>[],privileged:{nonVisible:'superseded_generation'}},{privileged:true})).outcome).toEqual({result:'not_visible',reason:'superseded_generation'});
  expect((await one(gcase(),{rows:()=>[],privileged:{nonVisible:null}},{privileged:true})).outcome).toEqual({result:'missing'});
  const cur=fakeReader({rows:()=>[],privileged:{nonVisible:'quarantined'}});
  await evaluateOfficial([gcase({binding:'current',as_of:'2024-03-01'})],cur,ctx({privileged:true}));
  expect(cur.calls.nonVisible).toEqual([{doc:null,asOf:'2024-03-01'}]);
 });
 it('skipped: retracted and pending cases are never read',async()=>{
  const reader=fakeReader();
  const [a,b]=await evaluateOfficial([gcase({case_id:'r',retracted:{at:'2026-11-01',by:'owner',reason:'wrong period'}}),gcase({case_id:'p',pending:true})],reader,ctx());
  expect(a.outcome).toEqual({result:'skipped',reason:'retracted'});expect(a.detail.retracted).toMatchObject({by:'owner'});
  expect(b.outcome).toEqual({result:'skipped',reason:'pending'});
  expect(reader.calls.resolve).toEqual([]);
 });
 it('read_error: unresolved subject; reader errors and truncation pass through; a thrown read is read_failed',async()=>{
  expect((await one(gcase({subject:{market:'US',cik:'9990699'}}))).outcome).toEqual({result:'read_error',reason:'subject_unresolved'});
  expect((await one(gcase(),{rows:()=>({rows:[],truncated:false,stateRev:null,error:'filing_not_found'})})).outcome).toEqual({result:'read_error',reason:'filing_not_found'});
  expect((await one(gcase(),{rows:()=>({rows:[],truncated:false,stateRev:null,error:'filing_ambiguous'})})).outcome).toEqual({result:'read_error',reason:'filing_ambiguous'});
  expect((await one(gcase(),{rows:()=>({rows:[],truncated:true,stateRev:3})})).outcome).toEqual({result:'read_error',reason:'truncated'});
  const thrown=await one(gcase(),{rows:()=>{throw new Error('connection reset');}});
  expect(thrown.outcome).toEqual({result:'read_error',reason:'read_failed'});expect(thrown.detail.message).toBe('connection reset');
  expect((await one(gcase({source:{...gcase().source,document_id:undefined}}))).outcome).toEqual({result:'read_error',reason:'filing_not_found'});
 });
 it('privileged: resolveProvenance gets {artifacts: verify.artifacts}; a failed resolution is provenance_incomplete(reason)',async()=>{
  const reader=fakeReader({privileged:{}});
  const [r]=await evaluateOfficial([gcase()],reader,ctx({privileged:true,verify:{artifacts:true,sources:false}}));
  expect(r.outcome).toEqual({result:'pass'});
  expect(reader.calls.provenance.map(p=>p.artifacts)).toEqual([true]);
  expect(r.provenance).toMatchObject({ok:true,object_path:expect.stringMatching(/^edgar\//),source_verified:'skipped'});
  const bad=await one(gcase(),{privileged:{provenance:()=>({ok:false,missing:[],reason:'candidate_not_found'})}},{privileged:true,verify:{artifacts:true,sources:false}});
  expect(bad.outcome).toEqual({result:'provenance_incomplete',reason:'candidate_not_found'});
  const thrownProv=await one(gcase(),{privileged:{provenance:()=>{throw new Error('storage down');}}},{privileged:true,verify:{artifacts:true,sources:false}});
  expect(thrownProv.outcome).toEqual({result:'provenance_incomplete',reason:'provenance_lookup_failed'});
 });
 it('privileged metric inputs: each input chain lands in detail.inputs, not inside provenance',async()=>{
  const inputs=[{fact_id:'f-1',concept:'revenue',ok:true,reason:null,source_ref:ACCN,raw_hash:'a'.repeat(64),producer_code_version:'c'.repeat(40),object_path:`edgar/${ISSUER}/${'b'.repeat(64)}.json`,locator:'facts.us-gaap.Revenues.units.USD[0](accn=x,start=,end=y)'}];
  const r=await one(gcase(),{privileged:{provenance:()=>({ok:true,missing:[],producer_code_version:'c'.repeat(40),input_chains:inputs} as ProvenanceCheck)}},{privileged:true,verify:{artifacts:true,sources:false}});
  expect(r.outcome).toEqual({result:'pass'});expect(r.detail.inputs).toEqual(inputs);expect(r.provenance).not.toHaveProperty('input_chains');
 });
 it('verify.sources: sha256 of the fetched bytes must equal source.sha256 (fetched once per url); every failure is provenance_incomplete',async()=>{
  const bytes=new TextEncoder().encode('the 10-K bytes');
  const c=gcase({source:{...gcase().source,sha256:sha256Hex(bytes)}});
  let fetches=0;
  const fetchSource=async(url:string)=>{fetches++;expect(url).toBe(c.source.url);return bytes;};
  const rs=await evaluateOfficial([c,{...c,case_id:'again'}],fakeReader(),ctx({verify:VERIFY_SOURCES,fetchSource}));
  expect(rs.map(r=>r.outcome)).toEqual([{result:'pass'},{result:'pass'}]);
  expect(rs[0].provenance?.source_verified).toBe(true);expect(fetches).toBe(1);
  const wrong=await one(gcase({source:{...gcase().source,sha256:'0'.repeat(64)}}),{},{verify:VERIFY_SOURCES,fetchSource:async()=>bytes});
  expect(wrong.outcome).toEqual({result:'provenance_incomplete',reason:'source_sha256_mismatch'});expect(wrong.provenance?.source_verified).toBe(false);
  expect((await one(c,{},{verify:VERIFY_SOURCES})).outcome).toEqual({result:'provenance_incomplete',reason:'source_fetch_unavailable'});
  expect((await one(c,{},{verify:VERIFY_SOURCES,fetchSource:async()=>{throw new Error('503');}})).outcome).toEqual({result:'provenance_incomplete',reason:'source_fetch_failed'});
  expect((await one(gcase({source:{...gcase().source,sha256:undefined}}),{},{verify:VERIFY_SOURCES,fetchSource:async()=>bytes})).outcome).toEqual({result:'provenance_incomplete',reason:'source_sha256_missing'});
 });
 it('P1-8: an absence case is source-verified too — a bad source hash is provenance_incomplete, a good one expected_absent with source_verified',async()=>{
  const bytes=new TextEncoder().encode('the 10-K bytes');
  const bad=await one({...MISSING,source:{...MISSING.source,sha256:'0'.repeat(64)}},{rows:()=>[]},{verify:VERIFY_SOURCES,fetchSource:async()=>bytes});
  expect(bad.outcome).toEqual({result:'provenance_incomplete',reason:'source_sha256_mismatch'});expect(bad.provenance?.source_verified).toBe(false);
  const good=await one({...MISSING,source:{...MISSING.source,sha256:sha256Hex(bytes)}},{rows:()=>[]},{verify:VERIFY_SOURCES,fetchSource:async()=>bytes});
  expect(good.outcome).toEqual({result:'expected_absent'});expect(good.provenance?.source_verified).toBe(true);
  expect((await one(MISSING,{rows:()=>[]})).provenance).toBeNull();
 });
 it('metric rows (unprivileged): metric, formula_version, basis, input_unit, inputs[].fact_id, based_on_rev must be present',async()=>{
  const target:MetricTarget={type:'metric',metric:'gross_margin',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',basis:'us_standard',input_unit:'USD',formula_version:'facts-derive/1.0',unit:{kind:'ratio'}};
  const m=gcase({case_id:'metric',target,binding:'current',as_of:'2024-02-15',canonical:{value:'0.4'},printed:{text:'40%',unit_label:'percent',scale:'1'}});
  const metricRow=(over:Partial<NonNullable<ReadRow['metric']>>={}):ReadRow=>({value_text:'0.4',unit:'pure',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',consolidation:'consolidated',available_date:'2024-02-15',
   metric:{metric:'gross_margin',formula_version:'facts-derive/1.0',basis:'us_standard',input_unit:'USD',based_on_rev:3,inputs:[{fact_id:'f-1',concept:'revenue',filing_id:'g-1',available_date:'2024-02-15'}],...over}});
  expect((await one(m,{rows:()=>[metricRow()]})).outcome).toEqual({result:'pass'});
  const r=await one(m,{rows:()=>[metricRow({inputs:[]})]});
  expect(r.outcome).toEqual({result:'provenance_incomplete',reason:'fields_missing'});expect(r.provenance?.missing).toEqual(['inputs[].fact_id']);
 });
 it('cases are evaluated in input order and each report keeps case_id / required',async()=>{
  const rs=await evaluateOfficial([gcase({case_id:'b',required:false}),gcase({case_id:'a'})],fakeReader(),ctx());
  expect(rs.map(r=>[r.case_id,r.required])).toEqual([['b',false],['a',true]]);
 });
});
