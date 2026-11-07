// src/lib/documents/hk-facts/checks.test.ts
import {describe,expect,it} from 'vitest';
import {FACT_CONCEPTS} from '../../facts/concepts';
import type {FactRow} from '../../facts/types';
import {HK_EXTRACTOR_REF} from '../types';
import type {CandidateRow,CheckResult,FinancialFactPayload} from '../types';
import {HK_CONCEPT_IDS,hkCheckFindings,runHkChecks} from './checks';
import type {CheckContext,CitationCheck} from './checks';

const EX={extraction_id:'e0000000-0000-4000-8000-000000000001',document_id:'d0000000-0000-4000-8000-000000000001'};
type Base={statement:'IS'|'BS'|'CF';period_start:string|null;period_end:string;duration:'6M'|'12M'|'INSTANT'};
const IS25:Base={statement:'IS',period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M'};
const IS24:Base={statement:'IS',period_start:'2024-01-01',period_end:'2024-12-31',duration:'12M'};
const BS25:Base={statement:'BS',period_start:null,period_end:'2025-12-31',duration:'INSTANT'};
const CF25:Base={...IS25,statement:'CF'};
interface Over{concept:string;value:string;presented?:string;unit?:string;scale?:string|null;rule?:FinancialFactPayload['period_derivation']['rule'];title?:string;roles?:('statement_title'|'column_header')[];snippet?:string;dropUnit?:boolean;label?:string;unitSnippet?:string;signFlip?:boolean;unitCurrencySnippet?:string}
let seq=0;
/** Unit evidence consistent with (unit, scale): what scale.ts reads back as that unit and multiplier. */
const UNIT_TEXT:Record<string,string>={'CNY|1':'單位：元 幣種：人民幣','CNY|1000':'人民幣千元','CNY|1000000':'人民幣百萬元','HKD|1000':'千港元','CNY/share|0.01':'RMB cents','CNY/share|1':'人民幣元','HKD/share|0.01':'港仙'};
function cand(base:Base,o:Over,verify:Map<string,CitationCheck|null>):CandidateRow{
 const n=++seq;const id=(r:string)=>`cit-${n}-${r}`;
 const presented=o.presented??o.value;const unit=o.unit??'CNY';const scale=o.scale===undefined?'1':o.scale;
 verify.set(id('value'),{integrity:'ok',currentExtraction:true,snippet:o.snippet??presented});
 verify.set(id('label'),{integrity:'ok',currentExtraction:true,snippet:o.label??o.concept});
 verify.set(id('unit'),{integrity:'ok',currentExtraction:true,snippet:o.unitSnippet??UNIT_TEXT[`${unit}|${scale}`]??'人民幣千元'});
 verify.set(id('title'),{integrity:'ok',currentExtraction:true,snippet:o.title??'綜合損益表'});
 verify.set(id('header'),{integrity:'ok',currentExtraction:true,snippet:base.period_end.slice(0,4)});
 const payload={concept:o.concept,statement:base.statement,period_start:base.period_start,period_end:base.period_end,duration:base.duration,value:o.value,presented,unit,
  scale,sign_flip:o.signFlip??false,period_derivation:{rule:o.rule??(base.duration==='INSTANT'?'title_instant':'title_duration'),title_date:'2025-12-31',column_text:base.period_end.slice(0,4)},consolidation:'consolidated'} as unknown as FinancialFactPayload;
 if(o.unitCurrencySnippet!==undefined)verify.set(id('ucur'),{integrity:'ok',currentExtraction:true,snippet:o.unitCurrencySnippet});
 const citations={value:id('value'),label:id('label'),...(o.dropUnit?{}:{unit:id('unit')}),...(o.unitCurrencySnippet!==undefined?{unit_currency:id('ucur')}:{}),period:(o.roles??['statement_title','column_header']).map(r=>({role:r,citation_id:r==='statement_title'?id('title'):id('header')}))};
 return {candidate_id:`cand-${n}`,document_id:EX.document_id,extraction_id:EX.extraction_id,kind:'financial_fact',extractor_kind:'rule',extractor_ref:HK_EXTRACTOR_REF,
  natural_key:`${o.concept}:${base.period_start??''}:${base.period_end}:${base.duration}:${unit}`,citations,payload,fingerprint:'f'.repeat(64),checks:[],checks_passed:false,status:'candidate',
  decision_kind:null,decided_by:null,approval_id:null,decided_at:null,inherited_from:null,
  input_snapshot:{content_sha256:'a'.repeat(64),pages_json_sha256:'b'.repeat(64),page_nos:[1],extractor_version:'docs-extract/1.0',table_algo_version:'tables/1.0',code_version:'test'},batch_id:'batch',created_at:'2026-11-06T00:00:00.000Z'};
}
const ctx=(verify:Map<string,CitationCheck|null>,extra:Partial<CheckContext>={}):CheckContext=>({verify,priorFacts:[],enCandidates:[],...extra});
const check=(r:{checks:CheckResult[]},name:string)=>r.checks.find(c=>c.check===name)!;
const bs=(ta:string,tl:string,eq:string)=>{const v=new Map<string,CitationCheck|null>();const rows=[cand(BS25,{concept:'total_assets',value:ta,title:'綜合財務狀況表'},v),cand(BS25,{concept:'total_liabilities',value:tl,title:'綜合財務狀況表'},v),cand(BS25,{concept:'equity_total',value:eq,title:'綜合財務狀況表'},v)];return {rows,out:runHkChecks(rows,ctx(v))};};
const fact=(o:Partial<FactRow>):FactRow=>({fact_id:'f-1',issuer_id:'i',market:'HK' as unknown as FactRow['market'],filing_id:'g',run_id:'r',concept:'revenue',source_concept:'收益',statement:'IS',period_start:'2024-01-01',period_end:'2024-12-31',duration:'12M',value:'1000',value_text:'1000',unit:'CNY',consolidation:'consolidated',available_date:'2025-03-20',mapping_gen:1,mapping_version:'x',status:'ok',raw_hash:'h',created_at:'2025-03-20T00:00:00.000Z',is_current:true,...o});

describe('HK_CONCEPT_IDS',()=>{
 it('is the 18 spec §7.5 concepts, all in the landed spec-2 catalogue',()=>{
  expect(HK_CONCEPT_IDS).toHaveLength(18);
  for(const c of HK_CONCEPT_IDS)expect(FACT_CONCEPTS.some(d=>d.id===c),c).toBe(true);
 });
});

describe('runHkChecks',()=>{
 it('records all eight checks in order; a consistent column passes every blocking check',()=>{
  const {out}=bs('20000','8000','12000');
  expect(out.map(r=>r.checks.map(c=>c.check))).toEqual(Array(3).fill(['citation_verified','unit_known','value_replays','period_known','consolidated','identity_bs','comparative_consistent','en_cross_check']));
  expect(out.every(r=>r.checks_passed)).toBe(true);
  expect(check(out[0],'identity_bs')).toMatchObject({blocking:true,passed:true});
  expect(check(out[0],'comparative_consistent')).toMatchObject({blocking:false,passed:null,detail:{reason:'primary_column'}});
  expect(check(out[0],'en_cross_check')).toMatchObject({blocking:false,passed:null,detail:{reason:'unavailable'}});
 });
 it('identity_bs is exact at the 5/1000 boundary, also beyond double precision',()=>{
  expect(bs('1000','500','505').out.every(r=>r.checks_passed)).toBe(true);        // |1000−1005|·1000 = 5000 ≤ 1005·5
  const off=bs('1000','500','506').out;                                              // 6000 > 1006·5 = 5030
  expect(off.every(r=>!r.checks_passed)).toBe(true);
  expect(check(off[1],'identity_bs')).toMatchObject({blocking:true,passed:false});
  // (K+d)·1000 ≤ (201K+d)·5 ⇔ d ≤ 10^18 for K = 199·10^18: a double cannot tell 4·10^22 from 4·10^22 + 1
  expect(bs('39800000000000000000000','40000000000000000000000','0').out.every(r=>r.checks_passed)).toBe(true);
  expect(bs('39800000000000000000000','40000000000000000000001','0').out.every(r=>!r.checks_passed)).toBe(true);
 });
 it('identity_gp uses the absolute cost and blocks every IS candidate of that column only (per-share rows included)',()=>{
  const v=new Map<string,CitationCheck|null>();
  const rows=[cand(IS25,{concept:'revenue',value:'1000'},v),cand(IS25,{concept:'cost_of_revenue',value:'-600'},v),cand(IS25,{concept:'gross_profit',value:'450'},v),
   cand(IS25,{concept:'eps_basic',value:'0.07',unit:'CNY/share',scale:'1'},v),cand(IS24,{concept:'revenue',value:'900',rule:'title_year_substitution'},v)];
  const out=runHkChecks(rows,ctx(v));
  expect(out.slice(0,4).every(r=>!r.checks_passed&&check(r,'identity_gp').passed===false)).toBe(true);
  expect(check(out[4],'identity_gp')).toMatchObject({passed:true,detail:{skipped:true}});
  expect(out[4].checks_passed).toBe(true);
  const ok=new Map<string,CitationCheck|null>();
  expect(runHkChecks([cand(IS25,{concept:'revenue',value:'1000'},ok),cand(IS25,{concept:'cost_of_revenue',value:'600'},ok),cand(IS25,{concept:'gross_profit',value:'400'},ok)],ctx(ok)).every(r=>r.checks_passed)).toBe(true);
 });
 it('identity_cf has a 2/100 tolerance',()=>{
  const cf=(fin:string)=>{const v=new Map<string,CitationCheck|null>();const t='綜合現金流量表';
   return runHkChecks([cand(CF25,{concept:'net_change_in_cash',value:'100',title:t},v),cand(CF25,{concept:'operating_cash_flow',value:'150',title:t},v),cand(CF25,{concept:'investing_cash_flow',value:'-50',title:t},v),cand(CF25,{concept:'financing_cash_flow',value:fin,title:t},v)],ctx(v));};
  expect(cf('2').every(r=>r.checks_passed)).toBe(true);          // |100−102|·100 = 200 ≤ 102·2 = 204
  expect(cf('3').every(r=>!r.checks_passed)).toBe(true);         // 300 > 103·2 = 206
 });
 it('an identity with a missing input is recorded as skipped and does not block',()=>{
  const v=new Map<string,CitationCheck|null>();
  const [r]=runHkChecks([cand(BS25,{concept:'total_assets',value:'1',title:'綜合財務狀況表'},v)],ctx(v));
  expect(check(r,'identity_bs')).toEqual({check:'identity_bs',blocking:true,passed:true,detail:{skipped:true,missing:['total_liabilities','equity_total']}});
  expect(r.checks_passed).toBe(true);
 });
 it('citation_verified: corrupt, superseded, unreadable, missing role or a value snippet that is not the presented number all block',()=>{
  const v=new Map<string,CitationCheck|null>();
  const good=cand(IS25,{concept:'revenue',value:'-1234',presented:'(1,234)'},v);
  const corrupt=cand(IS25,{concept:'revenue',value:'1'},v);v.set((corrupt.citations as {label:string}).label,{integrity:'corrupt',currentExtraction:true,snippet:'x'});
  const old=cand(IS25,{concept:'revenue',value:'2'},v);v.set((old.citations as {unit:string}).unit,{integrity:'ok',currentExtraction:false,snippet:'x'});
  const gone=cand(IS25,{concept:'revenue',value:'3'},v);v.set((gone.citations as {value:string}).value,null);
  const noUnit=cand(IS25,{concept:'revenue',value:'4',dropUnit:true},v);
  const wrong=cand(IS25,{concept:'revenue',value:'1235',presented:'1,235',snippet:'1,234'},v);
  const out=runHkChecks([good,corrupt,old,gone,noUnit,wrong],ctx(v));
  expect(check(out[0],'citation_verified').passed).toBe(true);
  expect(out.slice(1).map(r=>(check(r,'citation_verified').detail as {reason:string}).reason)).toEqual(['not_verified','not_verified','not_verified','missing_role','value_snippet_mismatch']);
  expect(out.slice(1).every(r=>!r.checks_passed)).toBe(true);
 });
 it('unit_known needs unit and scale, and a unit allowed for the concept kind',()=>{
  const v=new Map<string,CitationCheck|null>();
  const out=runHkChecks([cand(IS25,{concept:'revenue',value:'1',scale:null},v),cand(IS25,{concept:'eps_basic',value:'0.1',unit:'CNY',scale:'1'},v),cand(IS25,{concept:'eps_diluted',value:'0.1',unit:'CNY/share',scale:'0.01'},v)],ctx(v));
  expect(out.map(r=>check(r,'unit_known').passed)).toEqual([false,false,true]);
 });
 it('value_replays (P1-2): the cited number × the recorded scale, signed by the label rule, must equal payload.value exactly',()=>{
  const v=new Map<string,CitationCheck|null>();
  const lone=cand(IS25,{concept:'revenue',value:'999',presented:'1',scale:'1000',snippet:'1'},v);              // 1 × 1000 ≠ 999: blocked
  const right=cand(IS25,{concept:'revenue',value:'1000',presented:'1',scale:'1000',snippet:'1'},v);
  const big=cand(IS25,{concept:'revenue',value:'12345678901234567890000',presented:'12,345,678,901,234,567,890',scale:'1000'},v);
  const off=cand(IS25,{concept:'revenue',value:'12345678901234567891000',presented:'12,345,678,901,234,567,890',scale:'1000'},v);   // 1 unit off beyond double precision
  const cost=cand(IS25,{concept:'cost_of_revenue',value:'600000',presented:'(600)',scale:'1000',signFlip:true},v);
  const costNoFlip=cand(IS25,{concept:'cost_of_revenue',value:'600000',presented:'(600)',scale:'1000',signFlip:false},v);
  const credit=cand(IS25,{concept:'income_tax',value:'-10185000',presented:'(10,185)',scale:'1000',label:'Income tax credit'},v);
  const creditFlipped=cand(IS25,{concept:'income_tax',value:'10185000',presented:'(10,185)',scale:'1000',label:'Income tax credit',signFlip:true},v);
  const out=runHkChecks([lone,right,big,off,cost,costNoFlip,credit,creditFlipped],ctx(v));
  expect(check(out[0],'value_replays')).toMatchObject({blocking:true,passed:false,detail:{reason:'value_mismatch',snippet:'1',scale:'1000',replayed:'1000',recorded:'999'}});
  expect(check(out[0],'citation_verified').passed).toBe(true);                                                 // digits of snippet and presented agree: only the replay catches it
  expect(out[0].checks_passed).toBe(false);
  expect(out.map(r=>check(r,'value_replays').passed)).toEqual([false,true,true,false,true,false,true,false]);
  expect((check(out[5],'value_replays').detail as {reason:string}).reason).toBe('sign_flip_mismatch');
  expect((check(out[7],'value_replays').detail as {reason:string}).reason).toBe('sign_flip_mismatch');
 });
 it('value_replays (P1-2): the recorded scale and unit must be what the unit citation says',()=>{
  const v=new Map<string,CitationCheck|null>();
  const out=runHkChecks([
   cand(IS25,{concept:'revenue',value:'1000',presented:'1',scale:'1000'},v),                                      // 人民幣千元 → CNY × 1000
   cand(IS25,{concept:'revenue',value:'1000000',presented:'1',scale:'1000000',unitSnippet:'人民幣千元'},v),      // scale 1000000 recorded, evidence says 1000
   cand(IS25,{concept:'revenue',value:'1000',presented:'1',scale:'1000',unit:'HKD',unitSnippet:'人民幣千元'},v), // currency differs
   cand(IS25,{concept:'revenue',value:'1',presented:'1',scale:'1',unitSnippet:'港元 港元'},v),                   // no multiplier in the evidence
   cand(IS25,{concept:'eps_basic',value:'0.0155',presented:'1.55',unit:'CNY/share',scale:'0.01'},v),             // RMB cents
   cand(IS25,{concept:'eps_basic',value:'1.55',presented:'1.55',unit:'CNY/share',scale:'1',unitSnippet:'RMB cents'},v),
   cand(IS25,{concept:'revenue',value:'1000',presented:'1',scale:'7'},v),
  ],ctx(v));
  expect(out.map(r=>check(r,'value_replays').passed)).toEqual([true,false,false,false,true,false,false]);
  expect(out.slice(1).filter((_,i)=>i!==3).map(r=>(check(r,'value_replays').detail as {reason:string}).reason)).toEqual(['scale_mismatch','scale_mismatch','unit_evidence','scale_mismatch','scale_invalid']);
 });
 it('value_replays (R2-P1-1): a per-share token without a currency takes it from the cited table unit, never from the payload',()=>{
  const v=new Map<string,CitationCheck|null>();
  const eps=(unit:string,o:Partial<Over>={})=>cand(IS25,{concept:'eps_basic',value:'0.0155',presented:'1.55',unit,scale:'0.01',unitSnippet:'仙',unitCurrencySnippet:'人民幣千元',...o},v);
  const out=runHkChecks([eps('CNY/share'),eps('USD/share'),eps('CNY/share',{unitCurrencySnippet:undefined}),eps('HKD/share',{unitSnippet:'cents',unitCurrencySnippet:'千港元'})],ctx(v));
  expect(out.map(r=>check(r,'value_replays').passed)).toEqual([true,false,false,true]);
  expect(check(out[1],'value_replays').detail).toMatchObject({reason:'scale_mismatch',recorded:{unit:'USD/share'},evidence:{unit:'CNY/share'}});   // a CNY table changed to USD: blocked
  expect(check(out[2],'value_replays').detail).toMatchObject({reason:'unit_evidence',evidence:'eps_currency_uncited'});
  expect(out[1].checks_passed).toBe(false);
 });
 it('value_replays (R3-P1-1): unit_currency evidence is accepted only where the token needs it — contradictory extra evidence on an amount or an explicit-currency EPS blocks',()=>{
  const v=new Map<string,CitationCheck|null>();
  const out=runHkChecks([
   cand(IS25,{concept:'revenue',value:'1000',presented:'1',scale:'1000',unitCurrencySnippet:'美元千元'},v),                                   // CNY amount + a USD "currency" citation
   cand(IS25,{concept:'eps_basic',value:'0.0155',presented:'1.55',unit:'CNY/share',scale:'0.01',unitSnippet:'RMB cents',unitCurrencySnippet:'人民幣千元'},v),
   cand(IS25,{concept:'eps_basic',value:'0.0155',presented:'1.55',unit:'CNY/share',scale:'0.01',unitSnippet:'RMB cents'},v),
  ],ctx(v));
  expect(out.map(r=>check(r,'value_replays').passed)).toEqual([false,false,true]);
  for(const r of out.slice(0,2))expect(check(r,'value_replays').detail).toMatchObject({reason:'unit_evidence',evidence:'unit_currency_unexpected'});
 });
 it('period_known: duration band, instant without start, both evidence roles',()=>{
  const v=new Map<string,CitationCheck|null>();
  const out=runHkChecks([
   cand(IS25,{concept:'revenue',value:'1'},v),
   cand({...IS25,period_start:'2025-07-01'},{concept:'revenue',value:'1'},v),                      // 183 days declared 12M
   cand({...BS25,period_start:'2025-01-01'},{concept:'cash',value:'1',title:'綜合財務狀況表'},v),
   cand(IS25,{concept:'gross_profit',value:'1',roles:['statement_title']},v),
  ],ctx(v));
  expect(out.map(r=>check(r,'period_known').passed)).toEqual([true,false,false,false]);
  expect((check(out[1],'period_known').detail as {reason:string}).reason).toBe('duration_band');
 });
 it('consolidated needs 綜合/Consolidated in the statement title evidence',()=>{
  const v=new Map<string,CitationCheck|null>();
  const out=runHkChecks([cand(IS25,{concept:'revenue',value:'1',title:'損益表'},v),cand(IS25,{concept:'net_income',value:'1',title:'Consolidated Statement of Profit or Loss'},v)],ctx(v));
  expect(out.map(r=>check(r,'consolidated').passed)).toEqual([false,true]);
 });
 it('comparative_consistent compares a comparative column with the current published fact (non-blocking)',()=>{
  const v=new Map<string,CitationCheck|null>();
  const same=cand(IS24,{concept:'revenue',value:'1004',rule:'title_year_substitution'},v);
  const restated=cand(IS24,{concept:'net_income',value:'2000',rule:'title_year_substitution'},v);
  const none=cand(IS24,{concept:'income_tax',value:'5',rule:'title_year_substitution'},v);
  const prior=[fact({fact_id:'f-rev',value:'1000'}),fact({fact_id:'f-ni',concept:'net_income',value:'1000'})];
  const rows=[same,restated,none];const out=runHkChecks(rows,ctx(v,{priorFacts:prior}));
  expect(check(out[0],'comparative_consistent')).toMatchObject({blocking:false,passed:true});
  expect(check(out[1],'comparative_consistent')).toMatchObject({blocking:false,passed:false,detail:{fact_id:'f-ni',prior:'1000',current:'2000'}});
  expect(check(out[2],'comparative_consistent')).toMatchObject({passed:null,detail:{reason:'unavailable'}});
  expect(out.every(r=>r.checks_passed)).toBe(true);
  const {findings,info}=hkCheckFindings(EX,rows,out);
  expect(findings).toEqual([expect.objectContaining({reasonCode:'hk_restated_comparative',candidateIds:[restated.candidate_id],naturalKey:`${EX.document_id}:${EX.extraction_id}:${restated.natural_key}`})]);
  expect(info).toEqual([{code:'restated_comparative',key:EX.extraction_id,message:JSON.stringify({count:1})}]);
 });
 it('en_cross_check compares with the English comparison candidate of the same natural key (non-blocking)',()=>{
  const v=new Map<string,CitationCheck|null>();
  const a=cand(IS25,{concept:'revenue',value:'1000'},v);const b=cand(IS25,{concept:'net_income',value:'50'},v);const c=cand(IS25,{concept:'income_tax',value:'5'},v);
  const ev=new Map<string,CitationCheck|null>();
  const en=[cand(IS25,{concept:'revenue',value:'1000.0'},ev),cand(IS25,{concept:'net_income',value:'51'},ev)];
  const out=runHkChecks([a,b,c],ctx(v,{enCandidates:en}));
  expect(out.map(r=>check(r,'en_cross_check').passed)).toEqual([true,false,null]);
  expect(out.every(r=>r.checks_passed)).toBe(true);
  const {findings,info}=hkCheckFindings(EX,[a,b,c],out);
  expect(findings.map(f=>[f.reasonCode,f.candidateIds])).toEqual([['hk_en_zh_mismatch',[b.candidate_id]]]);
  expect(info).toEqual([{code:'en_zh_mismatch',key:EX.extraction_id,message:JSON.stringify({count:1})}]);
 });
 it('hkCheckFindings parks one hk_identity_* item per failed statement column with every member candidate',()=>{
  const {rows,out}=bs('1000','500','600');
  const {findings,info}=hkCheckFindings(EX,rows,out);
  expect(info).toEqual([]);
  expect(findings).toHaveLength(1);
  expect(findings[0]).toMatchObject({reasonCode:'hk_identity_bs',naturalKey:`${EX.document_id}:${EX.extraction_id}:identity_bs::2025-12-31`,candidateIds:rows.map(r=>r.candidate_id)});
  expect(findings[0].payload).toMatchObject({check:'identity_bs',statement:'BS',period_end:'2025-12-31'});
 });
});
