// Report rules R1–R10 (spec §7.1) and quarantine items (spec §7.2). Pure: callers supply
// materialized targets, evidence, rating scales, parse pages, and optional peer/text inputs.
// The caller writes the receipt using reports.rules_input_hash as read from the DB. Decimal
// comparisons use BigInt scaling; R1 spans and raw model content remain private.
import type {FieldRow,RatingScaleRow,ReportRow,RuleResult,TargetRow,TypedValue} from './types';
import {effectiveValue} from './effective';
import {dec,decAbs,decCmp,decDiv,decMul,decString,decSub} from './decimal';
import {sliceText,type PageText} from './extract/locate';
import {RULES_VERSION} from './versions';

export const RULES_PARAMS=Object.freeze({upsideTolerance:'0.005',versionWindowDays:7,versionJaccard:{num:4,den:5}});
/** dq reason codes that block publication (spec §4.4 blocker 10); must equal the SQL set. */
export const BLOCKING_REASONS=['upside_mismatch','currency_mismatch','date_order','nonpositive_price','unknown_rating_label','ambiguous_rating_label','ticker_issuer_conflict','unresolved_ticker'] as const;
export const RULE_IDS=Object.freeze({R1:'span_verbatim',R2:'upside_identity',R3:'currency_market',R4:'date_order',R5:'rating_scale_unique',R6:'positive_prices',R7:'possible_version',R8:'text_checks',R9:'ticker_resolution',R10:'horizon_present_with_target'});
export const QUARANTINE_DATASET='broker_research';
export const QUARANTINE_TABLE='broker_research_reports';

export interface QuarantineItem{naturalKey:string;rule:string;reasonCode:string;targetKey:string|null;payload:Record<string,unknown>}
export interface VersionPeer{report_id:string;institution_id:string|null;published_date:string|null;title_original:string|null;security_tickers:string[]}
export interface TextCheckRecord{kind:'snippet'|'summary';id:string;status:'draft'|'approved'|'rejected';checks:{name:string;passed:boolean}[]}
export interface RulesInput{
 report:Pick<ReportRow,'report_id'|'institution_id'|'published_date'|'title_original'|'supersedes_report_id'>;
 documentSha256:string;uploadedAt:string;fields:FieldRow[];targets:TargetRow[];ratingScales:RatingScaleRow[];
 artifacts:ReadonlyMap<string,PageText>;peers?:VersionPeer[];texts?:TextCheckRecord[];
}
export interface RulesOutput{version:string;results:RuleResult[];quarantines:QuarantineItem[];unverifiedFieldIds:string[];infoCodes:string[]}

const BLOCKING:Readonly<Record<string,boolean>>={span_verbatim:true,upside_identity:true,currency_market:true,date_order:true,rating_scale_unique:true,positive_prices:true,possible_version:false,text_checks:false,ticker_resolution:true,horizon_present_with_target:false};
const EFFECTIVE=new Set(['confirmed','corrected','absent']);
const CANDIDATE=new Set(['extracted','unverified']);
/** Market currency of a universe ticker (spec §7.1 R3). */
export function marketCurrency(securityTicker:string):'CNY'|'HKD'|'USD'{
 return /\.(SH|SZ|BJ)$/.test(securityTicker)?'CNY':/\.HK$/.test(securityTicker)?'HKD':'USD';
}
/** Rating comparison key = SQL lower(btrim(label)); labels are ASCII. */
export const ratingKey=(s:string)=>s.replace(/^ +| +$/g,'').toLowerCase();
const utcDate=(iso:string)=>{const ms=Date.parse(iso);if(Number.isNaN(ms))throw new Error('invalid_uploaded_at');return new Date(ms).toISOString().slice(0,10);};
const dayDiff=(a:string,b:string)=>Math.abs(Date.parse(`${a}T00:00:00Z`)-Date.parse(`${b}T00:00:00Z`))/86400000;
/** Each Han character is a token; other letter/digit runs are tokens. */
export function titleTokens(s:string):Set<string>{
 return new Set([...s.normalize('NFKC').toLowerCase().matchAll(/\p{Script=Han}|(?:(?!\p{Script=Han})[\p{L}\p{N}])+/gu)].map(m=>m[0]));
}
/** Jaccard(a,b) ≥ num/den without floating point. */
export function jaccardAtLeast(a:Set<string>,b:Set<string>,num:number,den:number):boolean{
 const inter=[...a].filter(x=>b.has(x)).length,union=new Set([...a,...b]).size;
 return union>0&&inter*den>=num*union;
}

type Picked={kind:'value';value:TypedValue;row:FieldRow}|{kind:'absent';row:FieldRow}|{kind:'none'};
/** Effective value wins; otherwise use the single unconflicted candidate. */
function pickValue(fields:FieldRow[],targetKey:string|null,field:string):Picked{
 const same=fields.filter(f=>f.target_key===targetKey&&f.field===field).sort((x,y)=>x.occurrence-y.occurrence);
 const eff=same.filter(f=>EFFECTIVE.has(f.status));
 if(eff.length)return eff[0].status==='absent'?{kind:'absent',row:eff[0]}:{kind:'value',value:effectiveValue(eff[0]),row:eff[0]};
 const cand=same.filter(f=>CANDIDATE.has(f.status));
 return cand.length===1&&cand[0].conflict_group===null?{kind:'value',value:cand[0],row:cand[0]}:{kind:'none'};
}

export function evaluateRules(input:RulesInput):RulesOutput{
 const results:RuleResult[]=[];const quarantines:QuarantineItem[]=[];const unverified:string[]=[];const info=new Set<string>();
 const fields=input.fields.filter(f=>f.superseded_by_run_id===null&&f.status!=='rejected');
 const targets=[...input.targets].sort((x,y)=>x.target_key<y.target_key?-1:x.target_key>y.target_key?1:0);
 const {report}=input;
 const push=(rule:string,target_key:string|null,passed:boolean,reason_code:string|null,detail:Record<string,unknown>,quarantine?:Record<string,unknown>)=>{
  results.push({rule,passed,blocking:BLOCKING[rule],target_key,reason_code:passed?null:reason_code,detail});
  if(!passed&&quarantine&&reason_code)quarantines.push({naturalKey:`${input.documentSha256}:${rule}:${target_key??'-'}`,rule,reasonCode:reason_code,targetKey:target_key,payload:quarantine});
 };
 const skip=(rule:string,target_key:string|null,why:string)=>push(rule,target_key,true,null,{skipped:why});

 // R1: every current evidence row with a span must reproduce its source text verbatim.
 for(const f of [...fields].sort((x,y)=>x.field_id<y.field_id?-1:1)){
  if(f.status==='absent')continue;
  const d={field_id:f.field_id,field:f.field,page:f.page};
  if(f.page===null||f.char_start===null||f.char_end===null||f.value_source_text===null||f.parse_run_id===null){
   push('span_verbatim',f.target_key,false,'span_missing',d);
   if(f.status!=='unverified')unverified.push(f.field_id);
   continue;
  }
  const art=input.artifacts.get(f.parse_run_id);
  const slice=art?sliceText(art,f.page,f.char_start,f.char_end):null;
  const ok=slice!==null&&slice===f.value_source_text;
  push('span_verbatim',f.target_key,ok,art?'span_mismatch':'artifact_unavailable',d);
  if(!ok&&f.status!=='unverified')unverified.push(f.field_id);
 }

 const uploaded=utcDate(input.uploadedAt);
 // R4 report level: published date must not be after upload's UTC date.
 if(report.published_date===null)skip('date_order',null,'published_date_missing');
 else{const ok=report.published_date<=uploaded;push('date_order',null,ok,'date_order',{published_date:report.published_date,uploaded_date:uploaded},{published_date:report.published_date,uploaded_date:uploaded});}

 for(const t of targets){
  const tk=t.target_key;
  // R2: |stated·p − (t − p)| ≤ tolerance·p, all in exact scaled decimal arithmetic.
  const up=pickValue(fields,tk,'upside_stated');
  if(up.kind!=='value'||up.value.value_num===null)skip('upside_identity',tk,'upside_stated_missing');
  else if(t.target_price===null||t.price_at_report===null)skip('upside_identity',tk,'price_missing');
  else if(t.target_currency===null||t.target_currency!==t.price_currency)skip('upside_identity',tk,'currency_differs');
  else if(decCmp(dec(t.price_at_report),dec('0'))<=0)skip('upside_identity',tk,'nonpositive_price');
  else{
   const s=dec(up.value.value_num),tp=dec(t.target_price),p=dec(t.price_at_report);
   const ok=decCmp(decAbs(decSub(decMul(s,p),decSub(tp,p))),decMul(dec(RULES_PARAMS.upsideTolerance),p))<=0;
   const computed=decString(decSub(decDiv(tp,p,8),dec('1')));
   push('upside_identity',tk,ok,'upside_mismatch',{upside_stated:up.value.value_num,computed,tolerance:RULES_PARAMS.upsideTolerance},
    {target_key:tk,upside_stated:up.value.value_num,target_price:t.target_price,price_at_report:t.price_at_report,page:up.row.page});
  }
  // R3: quoted currencies agree with the market of the resolved security.
  if(t.security_ticker===null)skip('currency_market',tk,'security_ticker_missing');
  else{
   const allowed=marketCurrency(t.security_ticker);
   const bad=[['target_currency',t.target_currency],['price_currency',t.price_currency]].filter(([,c])=>c!==null&&c!==allowed).map(([k,c])=>({[k as string]:c}));
   push('currency_market',tk,bad.length===0,'currency_mismatch',{security_ticker:t.security_ticker,allowed,offending:bad},{target_key:tk,security_ticker:t.security_ticker,target_currency:t.target_currency,price_currency:t.price_currency});
  }
  // R4 target level: the reference price date must not follow publication.
  if(t.price_as_of_date===null||report.published_date===null)skip('date_order',tk,'date_missing');
  else{const ok=t.price_as_of_date<=report.published_date;push('date_order',tk,ok,'date_order',{price_as_of_date:t.price_as_of_date,published_date:report.published_date},{target_key:tk,price_as_of_date:t.price_as_of_date,published_date:report.published_date});}
  // R5: one rating label mapping is valid at the published date.
  if(t.rating_raw===null)skip('rating_scale_unique',tk,'rating_missing');
  else if(report.institution_id===null||report.published_date===null)skip('rating_scale_unique',tk,'institution_or_date_missing');
  else{
   const pd=report.published_date,key=ratingKey(t.rating_raw);
   const rows=input.ratingScales.filter(s=>s.institution_id===report.institution_id&&ratingKey(s.raw_label)===key&&s.valid_from<=pd&&(s.valid_to===null||pd<s.valid_to));
   push('rating_scale_unique',tk,rows.length===1,rows.length===0?'unknown_rating_label':'ambiguous_rating_label',{rating_raw:t.rating_raw,matches:rows.map(r=>r.scale_id)},{target_key:tk,rating_raw:t.rating_raw,published_date:pd});
  }
  // R6: provided prices must be strictly positive.
  const nonpos=[['target_price',t.target_price],['price_at_report',t.price_at_report]].filter(([,v])=>v!==null&&decCmp(dec(v as string),dec('0'))<=0);
  if(t.target_price===null&&t.price_at_report===null)skip('positive_prices',tk,'prices_missing');
  else push('positive_prices',tk,nonpos.length===0,'nonpositive_price',{offending:nonpos.map(([k])=>k)},{target_key:tk,target_price:t.target_price,price_at_report:t.price_at_report});
  // R9: a materialized target must resolve to an issuer.
  const outcome=(t.resolution as {outcome?:unknown}).outcome;
  const reason=outcome==='conflict'?'ticker_issuer_conflict':'unresolved_ticker';
  push('ticker_resolution',tk,t.issuer_id!==null,reason,{issuer_id:t.issuer_id,outcome:outcome??null},{target_key:tk,ticker_as_stated:t.ticker_as_stated,candidates:(t.resolution as {candidates?:unknown}).candidates??[]});
  // R10: horizon absence is informational when a target price is supplied.
  if(t.target_price===null)skip('horizon_present_with_target',tk,'no_target_price');
  else{
   const ok=t.target_horizon_months!==null||pickValue(fields,tk,'target_horizon').kind==='absent';
   push('horizon_present_with_target',tk,ok,'horizon_missing',{});
   if(!ok)info.add('rule_warning_summary');
  }
 }

 // R7: possible nearby version is a review hint, never a publication blocker.
 if(input.peers===undefined)skip('possible_version',null,'peers_not_supplied');
 else if(report.institution_id===null||report.published_date===null||report.title_original===null)skip('possible_version',null,'report_incomplete');
 else{
  const mine=new Set(targets.map(t=>t.security_ticker).filter((v):v is string=>v!==null));
  const tokens=titleTokens(report.title_original);
  const {num,den}=RULES_PARAMS.versionJaccard;
  const hits=input.peers.filter(p=>p.report_id!==report.report_id&&p.report_id!==report.supersedes_report_id&&p.institution_id===report.institution_id
   &&p.published_date!==null&&p.title_original!==null&&p.security_tickers.some(s=>mine.has(s))
   &&dayDiff(p.published_date,report.published_date!)<=RULES_PARAMS.versionWindowDays&&jaccardAtLeast(tokens,titleTokens(p.title_original),num,den)).map(p=>p.report_id).sort();
  push('possible_version',null,hits.length===0,'possible_version',{peers:hits},{peers:hits,published_date:report.published_date});
 }
 // R8: report stored text checks; approval enforcement belongs to text services and triggers.
 for(const t of input.texts??[]){
  const failed=t.checks.find(c=>!c.passed);
  push('text_checks',null,!failed,failed?.name??null,{kind:t.kind,id:t.id,status:t.status});
 }
 return {version:RULES_VERSION,results,quarantines,unverifiedFieldIds:[...new Set(unverified)],infoCodes:[...info]};
}
