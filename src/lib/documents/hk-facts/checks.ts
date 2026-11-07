// src/lib/documents/hk-facts/checks.ts
// Deterministic checks of HK financial-fact candidates (spec §7.6, R5-8). runHkChecks is pure: the
// candidates of ONE extraction version plus a precomputed CheckContext (citation verification of
// every cited id, the issuer's current published facts, the English comparison candidates) in;
// every check of every candidate out, checks_passed = every blocking check passed. All arithmetic
// is exact (exact.ts on decimal strings, scaled BigInt; decimal.ts for the signed subtraction),
// never Number. Identities group the candidates of one statement column (statement, period_start,
// period_end) over money concepts; a failure blocks every candidate of that column, a missing
// input is recorded as passed with detail {skipped:true} ("缺任一不检"; passed=null is reserved
// for non-blocking checks). value_replays (blocking; codex plan round 1 P1-2) recomputes the
// canonical value from the cited value snippet — values.ts cellValue with the recorded scale, then
// applySign with the cited label — and requires it to equal payload.value exactly; the recorded
// unit and scale must be what the unit citation says (scale.ts detectAmountUnit / detectEpsUnit on
// the unit snippet) and sign_flip what the label evidence gives. hkCheckFindings turns failures into plan-1 quarantine items
// (hk_identity_* per column, hk_restated_comparative / hk_en_zh_mismatch per candidate) plus one
// info code per extraction; buildCheckContext performs the reads.
import type {BatchError} from '../../dq/batches';
import {classifyDuration,isDate} from '../../facts/classify';
import {conceptById} from '../../facts/concepts';
import {canonicalDecimal} from '../../facts/json-numbers';
import type {FactRow} from '../../facts/types';
import {allowedUnits} from '../../facts/units';
import {verify} from '../citations';
import {subDecimal} from '../decimal';
import {HK_EXTRACTOR_REF} from '../types';
import type {CandidateRow,CheckResult,CitationRow,DocumentRow,DocumentsDb,ExtractionRow,FactCitations,FinancialFactPayload} from '../types';
import {exactIdentity,sumDecimals} from './exact';
import type {HkFactsPort} from './facts-port';
import {detectAmountUnit,detectEpsUnit} from './scale';
import type {Scale} from './scale';
import {applySign,cellValue} from './values';

/** The 18 HK concepts of spec §7.5 第 4 条 (all ids of the landed spec-2 FACT_CONCEPTS). */
export const HK_CONCEPT_IDS:readonly string[]=['revenue','cost_of_revenue','gross_profit','operating_income','income_tax','net_income','net_income_parent','eps_basic','eps_diluted',
 'total_assets','total_liabilities','equity_parent','equity_total','cash','operating_cash_flow','investing_cash_flow','financing_cash_flow','net_change_in_cash'];
export const TOL_HALF_PERCENT={num:5n,den:1000n} as const;
export const TOL_CF={num:2n,den:100n} as const;
export const CHECK_ORDER=['citation_verified','unit_known','value_replays','period_known','consolidated','identity','comparative_consistent','en_cross_check'] as const;
export interface CitationCheck{integrity:'ok'|'corrupt';currentExtraction:boolean;snippet:string}
export interface CheckContext{verify:Map<string,CitationCheck|null>;priorFacts:FactRow[];enCandidates:CandidateRow[]}
export interface CheckRowResult{candidate_id:string;checks:CheckResult[];checks_passed:boolean}
export interface CheckFinding{reasonCode:'hk_identity_bs'|'hk_identity_gp'|'hk_identity_cf'|'hk_restated_comparative'|'hk_en_zh_mismatch';naturalKey:string;candidateIds:string[];payload:Record<string,unknown>}

const payloadOf=(c:CandidateRow)=>c.payload as FinancialFactPayload;
const citesOf=(c:CandidateRow)=>c.citations as FactCitations;
/** Every citation id a financial-fact candidate references (value, label, unit, period evidence), deduped. */
export function citationIdsOf(c:FactCitations):string[]{
 const period=Array.isArray(c.period)?c.period.map(p=>p.citation_id):[];
 return [...new Set([c.value,c.label,c.unit,c.unit_currency,...period].filter((x):x is string=>typeof x==='string'&&x.length>0))];
}
const digitsOf=(s:string)=>s.replace(/[\s,()\-–—]/g,'');
const abs=(d:string)=>d.startsWith('-')?d.slice(1):d;
const CONSOLIDATED=/綜合|综合|consolidated/i;
const PRIMARY_RULES=new Set(['title_duration','title_instant']);
const pass=(check:string,blocking:boolean,detail?:Record<string,unknown>):CheckResult=>detail===undefined?{check,blocking,passed:true}:{check,blocking,passed:true,detail};
const fail=(check:string,blocking:boolean,detail:Record<string,unknown>):CheckResult=>({check,blocking,passed:false,detail});
const unavailable=(check:string,detail:Record<string,unknown>):CheckResult=>({check,blocking:false,passed:null,detail});

function citationVerified(c:CandidateRow,ctx:CheckContext):CheckResult{
 const cs=citesOf(c);const p=payloadOf(c);
 const roles=(['value','label','unit'] as const).filter(r=>typeof cs[r]!=='string'||cs[r].length===0);
 if(roles.length>0||!Array.isArray(cs.period)||cs.period.length===0)return fail('citation_verified',true,{reason:'missing_role',roles:roles.length>0?roles:['period']});
 const bad=citationIdsOf(cs).filter(id=>{const v=ctx.verify.get(id);return !v||v.integrity!=='ok'||!v.currentExtraction;});
 if(bad.length>0)return fail('citation_verified',true,{reason:'not_verified',citation_ids:bad});
 const snippet=ctx.verify.get(cs.value)!.snippet;
 if(digitsOf(snippet)!==digitsOf(p.presented))return fail('citation_verified',true,{reason:'value_snippet_mismatch',snippet,presented:p.presented});
 return pass('citation_verified',true);
}
function unitKnown(p:FinancialFactPayload):CheckResult{
 if(!p.unit||!p.scale)return fail('unit_known',true,{reason:'missing',unit:p.unit??null,scale:p.scale??null});
 const def=conceptById(p.concept);
 if(!def)return fail('unit_known',true,{reason:'unknown_concept',concept:p.concept});
 if(!allowedUnits(def.unitKind).includes(p.unit))return fail('unit_known',true,{reason:'unit_not_allowed',unit:p.unit,unit_kind:def.unitKind});
 return pass('unit_known',true);
}
const SCALES:ReadonlySet<string>=new Set(['1','0.01','1000','1000000']);
const canonOrNull=(v:unknown):string|null=>{if(typeof v!=='string')return null;try{return canonicalDecimal(v);}catch{return null;}};
const amountOf=(text:string)=>detectAmountUnit([{page_no:0,line:{index:0,y:0,x0:0,x1:0,text,char_start:0,char_end:Array.from(text).length,items:[]}}]);
/** What the cited unit evidence says — never the payload itself (R2-P1-1): the amount unit range (currency + multiplier, R2-P2-1), or the per-share token; a token without a currency (仙 / cents) takes the currency of the cited table amount unit (unit_currency), and without that citation it is unknown. */
function unitEvidence(unit:unknown,text:string,currencyText:string|null):{ok:true;unit:string;scale:Scale}|{ok:false;reason:string}{
 if(typeof unit!=='string')return {ok:false,reason:'no_unit'};
 if(/\/share$/.test(unit)){
  const own=detectEpsUnit([{page_no:0,text,char_start:0}],null);
  if(own.ok)return currencyText===null?{ok:true,unit:own.unit,scale:own.scale}:{ok:false,reason:'unit_currency_unexpected'};   // R3-P1-1: an explicit-currency token takes no extra evidence
  if(own.reason!=='eps_currency')return {ok:false,reason:own.reason};
  if(currencyText===null)return {ok:false,reason:'eps_currency_uncited'};
  const table=amountOf(currencyText);
  if(!table.ok)return {ok:false,reason:`eps_currency:${table.reason}`};
  const r=detectEpsUnit([{page_no:0,text,char_start:0}],table.currency);
  return r.ok?{ok:true,unit:r.unit,scale:r.scale}:{ok:false,reason:r.reason};
 }
 if(currencyText!==null)return {ok:false,reason:'unit_currency_unexpected'};   // R3-P1-1: an amount carries its own currency
 const r=amountOf(text);
 return r.ok?{ok:true,unit:r.currency,scale:r.scale}:{ok:false,reason:r.reason};
}
/** Replays the cited number through the recorded transformation (P1-2): exact decimal strings only. */
function valueReplays(c:CandidateRow,p:FinancialFactPayload,ctx:CheckContext):CheckResult{
 const cs=citesOf(c);
 const snip=(id:unknown)=>typeof id==='string'?ctx.verify.get(id)?.snippet??null:null;
 const value=snip(cs.value),label=snip(cs.label),unitText=snip(cs.unit),currencyText=cs.unit_currency===undefined?null:snip(cs.unit_currency);
 if(value===null||label===null||unitText===null||(cs.unit_currency!==undefined&&currencyText===null))return fail('value_replays',true,{reason:'evidence_unavailable'});
 if(typeof p.scale!=='string'||!SCALES.has(p.scale))return fail('value_replays',true,{reason:'scale_invalid',scale:p.scale??null});
 const ev=unitEvidence(p.unit,unitText,currencyText);
 if(!ev.ok)return fail('value_replays',true,{reason:'unit_evidence',evidence:ev.reason,unit_snippet:unitText});
 if(ev.unit!==p.unit||ev.scale!==p.scale)return fail('value_replays',true,{reason:'scale_mismatch',recorded:{unit:p.unit,scale:p.scale},evidence:{unit:ev.unit,scale:ev.scale},unit_snippet:unitText});
 const cell=cellValue(value,p.scale as Scale);
 if(cell.kind!=='value')return fail('value_replays',true,{reason:'value_unparsed',snippet:value});
 const signed=applySign(p.concept,cell.value,label);
 if(signed.sign_flip!==p.sign_flip)return fail('value_replays',true,{reason:'sign_flip_mismatch',recorded:p.sign_flip??null,evidence:signed.sign_flip,label_snippet:label});
 const recorded=canonOrNull(p.value);
 if(recorded===null||canonicalDecimal(signed.value)!==recorded)return fail('value_replays',true,{reason:'value_mismatch',snippet:value,scale:p.scale,replayed:signed.value,recorded:p.value??null});
 return pass('value_replays',true);
}
function periodKnown(c:CandidateRow,p:FinancialFactPayload):CheckResult{
 const roles=new Set((Array.isArray(citesOf(c).period)?citesOf(c).period:[]).map(x=>x.role));
 if(!roles.has('statement_title')||!roles.has('column_header'))return fail('period_known',true,{reason:'period_evidence',roles:[...roles].sort()});
 if(!isDate(p.period_end))return fail('period_known',true,{reason:'period_end',period_end:p.period_end??null});
 if(p.duration==='INSTANT')return p.period_start===null?pass('period_known',true):fail('period_known',true,{reason:'instant_with_start',period_start:p.period_start});
 if(p.duration!=='6M'&&p.duration!=='12M')return fail('period_known',true,{reason:'duration',duration:p.duration});
 if(p.period_start===null||!isDate(p.period_start))return fail('period_known',true,{reason:'period_start',period_start:p.period_start??null});
 const computed=classifyDuration(p.period_start,p.period_end);
 if(computed!==p.duration)return fail('period_known',true,{reason:'duration_band',computed,declared:p.duration});
 return pass('period_known',true);
}
function consolidated(c:CandidateRow,p:FinancialFactPayload,ctx:CheckContext):CheckResult{
 const titles=(Array.isArray(citesOf(c).period)?citesOf(c).period:[]).filter(x=>x.role==='statement_title').map(x=>ctx.verify.get(x.citation_id)?.snippet??'');
 if(p.consolidation==='consolidated'&&titles.some(t=>CONSOLIDATED.test(t)))return pass('consolidated',true);
 return fail('consolidated',true,{consolidation:p.consolidation??null,titles});
}

const IDENTITY_OF={BS:'identity_bs',IS:'identity_gp',CF:'identity_cf'} as const;
const INPUTS={BS:['total_assets','total_liabilities','equity_total'],IS:['gross_profit','revenue','cost_of_revenue'],CF:['net_change_in_cash','operating_cash_flow','investing_cash_flow','financing_cash_flow']} as const;
const columnKey=(p:FinancialFactPayload)=>`${p.statement}|${p.period_start??''}|${p.period_end}`;
/** One identity CheckResult per candidate, computed per statement column. */
function identityChecks(cands:CandidateRow[]):Map<string,CheckResult>{
 const cols=new Map<string,CandidateRow[]>();
 for(const c of cands){const k=columnKey(payloadOf(c));const g=cols.get(k);if(g)g.push(c);else cols.set(k,[c]);}
 const out=new Map<string,CheckResult>();
 for(const group of cols.values()){
  const statement=payloadOf(group[0]).statement;const name=IDENTITY_OF[statement];const inputs=INPUTS[statement];
  const money=new Map<string,FinancialFactPayload>();
  for(const c of group){const p=payloadOf(c);if(conceptById(p.concept)?.unitKind==='money'&&!money.has(p.concept))money.set(p.concept,p);}
  const missing=inputs.filter(k=>!money.has(k));
  let result:CheckResult;
  if(missing.length>0)result=pass(name,true,{skipped:true,missing:[...missing]});
  else{
   const ps=inputs.map(k=>money.get(k)!);
   if(new Set(ps.map(p=>p.unit)).size>1)result=fail(name,true,{reason:'unit_mismatch',units:ps.map(p=>p.unit)});
   else{
    const [head,...rest]=ps.map(p=>p.value);
    const right=statement==='IS'?subDecimal(rest[0],abs(rest[1])):sumDecimals(rest);
    const tol=statement==='CF'?TOL_CF:TOL_HALF_PERCENT;
    const r=exactIdentity(head,right,{num:tol.num,den:tol.den});
    const detail={left:head,right,diff:r.diff,tolerance:`${tol.num}/${tol.den}`,concepts:[...inputs]};
    result=r.passed?pass(name,true,detail):fail(name,true,detail);
   }
  }
  for(const c of group)out.set(c.candidate_id,result);
 }
 return out;
}
function comparative(p:FinancialFactPayload,ctx:CheckContext):CheckResult{
 if(PRIMARY_RULES.has(p.period_derivation?.rule))return unavailable('comparative_consistent',{reason:'primary_column'});
 const f=ctx.priorFacts.find(r=>r.status==='ok'&&r.is_current!==false&&r.concept===p.concept&&(r.period_start??null)===(p.period_start??null)&&r.period_end===p.period_end&&r.unit===p.unit);
 if(!f)return unavailable('comparative_consistent',{reason:'unavailable'});
 const r=exactIdentity(p.value,f.value,{num:TOL_HALF_PERCENT.num,den:TOL_HALF_PERCENT.den});
 const detail={fact_id:f.fact_id,prior:f.value,current:p.value,diff:r.diff};
 return r.passed?pass('comparative_consistent',false,detail):fail('comparative_consistent',false,detail);
}
function enCross(c:CandidateRow,p:FinancialFactPayload,ctx:CheckContext):CheckResult{
 if(ctx.enCandidates.length===0)return unavailable('en_cross_check',{reason:'unavailable'});
 const e=ctx.enCandidates.find(x=>x.kind==='financial_fact'&&x.natural_key===c.natural_key);
 if(!e)return unavailable('en_cross_check',{reason:'no_counterpart'});
 const en=(e.payload as FinancialFactPayload).value;
 const same=canonicalDecimal(en)===canonicalDecimal(p.value);
 const detail={en_candidate_id:e.candidate_id,zh:p.value,en};
 return same?pass('en_cross_check',false,detail):fail('en_cross_check',false,detail);
}

export function runHkChecks(candidates:CandidateRow[],ctx:CheckContext):CheckRowResult[]{
 const facts=candidates.filter(c=>c.kind==='financial_fact');
 const identity=identityChecks(facts);
 return facts.map(c=>{
  const p=payloadOf(c);
  const checks=[citationVerified(c,ctx),unitKnown(p),valueReplays(c,p,ctx),periodKnown(c,p),consolidated(c,p,ctx),identity.get(c.candidate_id)!,comparative(p,ctx),enCross(c,p,ctx)];
  return {candidate_id:c.candidate_id,checks,checks_passed:checks.every(x=>!x.blocking||x.passed===true)};
 });
}

export function hkCheckFindings(ex:{extraction_id:string;document_id:string},candidates:CandidateRow[],results:CheckRowResult[]):{findings:CheckFinding[];info:BatchError[]}{
 const byId=new Map(candidates.map(c=>[c.candidate_id,c]));
 const identity=new Map<string,CheckFinding>();const single:CheckFinding[]=[];let restated=0,mismatch=0;
 for(const r of results){
  const c=byId.get(r.candidate_id);if(!c)continue;const p=payloadOf(c);
  for(const ch of r.checks){
   if(ch.passed!==false)continue;
   if(ch.check==='identity_bs'||ch.check==='identity_gp'||ch.check==='identity_cf'){
    const naturalKey=`${ex.document_id}:${ex.extraction_id}:${ch.check}:${p.period_start??''}:${p.period_end}`;
    const f=identity.get(naturalKey)??{reasonCode:`hk_${ch.check}` as CheckFinding['reasonCode'],naturalKey,candidateIds:[],
     payload:{check:ch.check,document_id:ex.document_id,extraction_id:ex.extraction_id,statement:p.statement,period_start:p.period_start,period_end:p.period_end,detail:ch.detail??{}}};
    f.candidateIds.push(c.candidate_id);identity.set(naturalKey,f);
   }else if(ch.check==='comparative_consistent'){
    restated++;
    single.push({reasonCode:'hk_restated_comparative',naturalKey:`${ex.document_id}:${ex.extraction_id}:${c.natural_key}`,candidateIds:[c.candidate_id],payload:{check:ch.check,document_id:ex.document_id,extraction_id:ex.extraction_id,natural_key:c.natural_key,detail:ch.detail??{}}});
   }else if(ch.check==='en_cross_check'){
    mismatch++;
    single.push({reasonCode:'hk_en_zh_mismatch',naturalKey:`${ex.document_id}:${ex.extraction_id}:${c.natural_key}`,candidateIds:[c.candidate_id],payload:{check:ch.check,document_id:ex.document_id,extraction_id:ex.extraction_id,natural_key:c.natural_key,detail:ch.detail??{}}});
   }
  }
 }
 const findings=[...identity.values(),...single].sort((a,b)=>a.naturalKey<b.naturalKey?-1:a.naturalKey>b.naturalKey?1:a.reasonCode<b.reasonCode?-1:1);
 const info:BatchError[]=[];
 if(restated>0)info.push({code:'restated_comparative',key:ex.extraction_id,message:JSON.stringify({count:restated})});
 if(mismatch>0)info.push({code:'en_zh_mismatch',key:ex.extraction_id,message:JSON.stringify({count:mismatch})});
 return {findings,info};
}

export interface CheckDeps{db:DocumentsDb;port:Pick<HkFactsPort,'readFacts'>}
async function pagesOf<T>(read:(cursor:string|null)=>Promise<{rows:T[];nextCursor:string|null}>):Promise<T[]>{
 const out:T[]=[];let cursor:string|null=null;
 do{const p=await read(cursor);out.push(...p.rows);cursor=p.nextCursor;}while(cursor!==null);
 return out;
}
/** Same issuer, same doc_class and period_end, language 'en', current extraction: its HK rule candidates (spec §7.6 en_cross_check). */
async function englishCandidates(db:DocumentsDb,doc:DocumentRow,today:string):Promise<CandidateRow[]>{
 if(doc.issuer_id===null||doc.period_end===null)return [];
 const issuer=doc.issuer_id;
 const docs=await pagesOf(cursor=>db.readDocuments(issuer,{asOf:today,source:'hkexnews',docClass:doc.doc_class,cursor,limit:1000}));
 const out:CandidateRow[]=[];
 for(const d of docs){
  if(d.language!=='en'||d.period_end!==doc.period_end||d.current_extraction_id===null)continue;
  const exId=d.current_extraction_id;
  out.push(...(await pagesOf(cursor=>db.candidatesOf({extractionId:exId},{cursor,limit:1000}))).filter(c=>c.kind==='financial_fact'&&c.extractor_ref===HK_EXTRACTOR_REF));
 }
 return out;
}
/** Reads everything runHkChecks needs for these candidates of one extraction version. */
export async function buildCheckContext(deps:CheckDeps,doc:DocumentRow,ex:ExtractionRow,candidates:CandidateRow[],today:string):Promise<CheckContext>{
 const ids=[...new Set(candidates.filter(c=>c.kind==='financial_fact').flatMap(c=>citationIdsOf(citesOf(c))))];
 const rows=new Map<string,CitationRow>();
 for(let i=0;i<ids.length;i+=100)for(const r of await deps.db.citationsByIds(ids.slice(i,i+100)))rows.set(r.citation_id,r);
 const checks=new Map<string,CitationCheck|null>();
 for(const id of ids){
  const row=rows.get(id);const v=row?await verify(deps.db,id):null;
  checks.set(id,row&&v?{integrity:v.integrity,currentExtraction:v.currentExtraction,snippet:row.snippet}:null);
 }
 let priorFacts:FactRow[]=[];let enCandidates:CandidateRow[]=[];
 if(ex.candidates_role==='primary'&&doc.issuer_id!==null){
  const read=await deps.port.readFacts(doc.issuer_id,{concepts:[...HK_CONCEPT_IDS],asOf:today,history:false});
  priorFacts=read.truncated?[]:read.rows;
  enCandidates=await englishCandidates(deps.db,doc,today);
 }
 return {verify:checks,priorFacts,enCandidates};
}
