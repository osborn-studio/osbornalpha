/** Offline provider contract validation. No network, database, rights grant or
 * conversion into an approved MarketSnapshot. Provider assertions stay unverified.
 */
import Ajv from 'ajv';
import {digest,parseStrict,sha256,fail} from '../ingest/pa-v1/json.js';
import calendar from '../../../../docs/handoffs/alpha-s4/calendar.json';

const text={type:'string',minLength:1,maxLength:500};
const id={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'};
const date={type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'};
const timestamp={type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$'};
const positive={type:'number',exclusiveMinimum:0,maximum:1e12};
const object=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const array=(items:unknown,maxItems=2000)=>({type:'array',items,maxItems});
export const marketHandoffSchema=object({
 schema_version:{const:'alpha-market-handoff/1.0'},synthetic:{type:'boolean'},
 provider:object({name:id,version:id}),
 security:object({ticker:{type:'string',pattern:'^[A-Z][A-Z0-9.]{0,15}$'},listing_mic:{type:'string',pattern:'^[A-Z0-9]{4}$'},currency:{const:'USD'},identity_ref:id}),
 calendar_version:{const:calendar.version},interval:{const:'1d'},adjustment:{const:'raw'},includes_cash_dividends:{const:false},
 observed_at:timestamp,range:object({from:date,to:date}),
 splits:object({basis_date:date,coverage:object({from:date,to:date,complete:{type:'boolean'},evidence_ref:id}),events:array(object({effective_date:date,new_shares:{type:'integer',minimum:1,maximum:1e9},old_shares:{type:'integer',minimum:1,maximum:1e9},evidence_ref:id}))}),
 bars:array(object({session_date:date,open:positive,high:positive,low:positive,close:positive,volume:{type:'number',minimum:0,maximum:Number.MAX_SAFE_INTEGER},split_factor:positive,available_at:timestamp,price_ref:id,split_ref:id,availability_ref:id})),
 unavailable_sessions:array(object({session_date:date,status:{enum:['suspended','no_valid_close']},available_at:timestamp,evidence_ref:id})),
 evidence:array(object({id,kind:{enum:['prices','splits','identity','availability','session_status']},source_url:text,received_at:timestamp,media_type:{enum:['application/json','text/plain','text/html','text/csv']},content:{type:'string',minLength:1,maxLength:1_000_000},sha256:{type:'string',pattern:'^[a-f0-9]{64}$'}}),100),
});
const validate=new Ajv({strict:true,allErrors:false}).compile<MarketHandoff>(marketHandoffSchema);
interface Evidence {id:string;kind:string;source_url:string;received_at:string;media_type:string;content:string;sha256:string}
export interface MarketHandoff {
 schema_version:'alpha-market-handoff/1.0';synthetic:boolean;provider:{name:string;version:string};
 security:{ticker:string;listing_mic:string;currency:'USD';identity_ref:string};calendar_version:string;interval:'1d';adjustment:'raw';includes_cash_dividends:false;
 observed_at:string;range:{from:string;to:string};
 splits:{basis_date:string;coverage:{from:string;to:string;complete:boolean;evidence_ref:string};events:{effective_date:string;new_shares:number;old_shares:number;evidence_ref:string}[]};
 bars:{session_date:string;open:number;high:number;low:number;close:number;volume:number;split_factor:number;available_at:string;price_ref:string;split_ref:string;availability_ref:string}[];
 unavailable_sessions:{session_date:string;status:'suspended'|'no_valid_close';available_at:string;evidence_ref:string}[];
 evidence:Evidence[];
}
function requireValue(ok:unknown,code='invalid_schema'):asserts ok{if(!ok)fail(code);}
function instant(s:string){const n=Date.parse(s);requireValue(Number.isFinite(n)&&new Date(n).toISOString()===s);return n;}
function day(s:string){requireValue(Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s);return s;}

export function validateMarketHandoff(raw:string|Buffer,now=new Date().toISOString()){
 const value=parseStrict(raw);requireValue(validate(value));const p=value;
 const observed=instant(p.observed_at);requireValue(observed<=instant(now),'future_input');
 requireValue(day(p.range.from)<=day(p.range.to));
 const sessions=calendar.sessions.filter(s=>s.date>=p.range.from&&s.date<=p.range.to);
 requireValue(p.range.from>=calendar.range[0]&&p.range.to<=calendar.range[1]&&sessions.length>0,'rule_unsupported');
 requireValue(sessions.every(s=>instant(s.close)<=observed),'future_input');
 requireValue(day(p.splits.basis_date)===p.range.to);
 requireValue(day(p.splits.coverage.from)<=p.range.from&&day(p.splits.coverage.to)>=p.range.to);
 const evidence=new Map<string,Evidence>();
 for(const e of p.evidence){
  requireValue(!evidence.has(e.id));requireValue(sha256(Buffer.from(e.content,'utf8'))===e.sha256,'hash_mismatch');
  requireValue(instant(e.received_at)<=observed,'future_input');
  let u:URL;try{u=new URL(e.source_url);}catch{fail('invalid_schema');throw Error('unreachable');}
  requireValue(!u.username&&!u.password&&!u.search&&!u.hash&&(u.protocol==='https:'||(p.synthetic&&u.protocol==='synthetic:')));
  evidence.set(e.id,e);
 }
 function reference(ref:string,kind:string,available?:string){
  const e=evidence.get(ref);requireValue(e&&e.kind===kind,'data_insufficient');
  // This v1 contract uses conservative local retrieval availability only.
  // Historical publication claims require a separate, versioned attestation.
  if(available)requireValue(instant(available)>=instant(e.received_at),'invalid_timeline');
  return e;
 }
 reference(p.security.identity_ref,'identity');let splitReceivedAt=instant(reference(p.splits.coverage.evidence_ref,'splits').received_at);
 const events=p.splits.events;let previous='';
 for(const event of events){
  requireValue(day(event.effective_date)>previous&&event.effective_date>=p.splits.coverage.from&&event.effective_date<=p.splits.coverage.to);previous=event.effective_date;
  requireValue(event.old_shares!==event.new_shares);
  const received=instant(reference(event.evidence_ref,'splits').received_at);
  if(event.effective_date<=p.splits.basis_date)splitReceivedAt=Math.max(splitReceivedAt,received);
 }
 const filled=new Set<string>();previous='';
 for(const b of p.bars){
  const session=sessions.find(s=>s.date===day(b.session_date));requireValue(session&&b.session_date>previous);previous=b.session_date;filled.add(b.session_date);
  requireValue(b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close)&&b.low<=b.high);
  requireValue(instant(b.available_at)>=instant(session.close)&&instant(b.available_at)<=observed,'invalid_timeline');
  requireValue(instant(reference(b.price_ref,'prices',b.available_at).received_at)>=instant(session.close),'invalid_timeline');reference(b.split_ref,'splits',b.available_at);reference(b.availability_ref,'availability',b.available_at);
  requireValue(instant(b.available_at)>=splitReceivedAt,'invalid_timeline');
  const factor=events.filter(e=>e.effective_date>b.session_date&&e.effective_date<=p.splits.basis_date).reduce((n,e)=>n*e.old_shares/e.new_shares,1);
  requireValue(Number.isFinite(factor)&&factor>0&&Math.abs(b.split_factor-factor)<=1e-12*Math.max(factor,b.split_factor),'split_factor_mismatch');
 }
 previous='';
 for(const missing of p.unavailable_sessions){
  const session=sessions.find(s=>s.date===day(missing.session_date));requireValue(session&&!filled.has(missing.session_date)&&missing.session_date>previous);previous=missing.session_date;filled.add(missing.session_date);
  requireValue(instant(missing.available_at)>=instant(session.close)&&instant(missing.available_at)<=observed,'invalid_timeline');requireValue(instant(reference(missing.evidence_ref,'session_status',missing.available_at).received_at)>=instant(session.close),'invalid_timeline');
 }
 const missingSessions=sessions.filter(s=>!filled.has(s.date)).map(s=>s.date);
 return {schema_version:'alpha-market-handoff-check/1.0',status:missingSessions.length||!p.splits.coverage.complete?'contract_incomplete':'contract_valid',
  bundle_sha256:digest(p),raw_sha256:sha256(raw),synthetic:p.synthetic,security:p.security,bar_count:p.bars.length,missing_sessions:missingSessions,
  // engine_compatible: the format converts through mapMarketHandoff (engine 0.3.0, market-policy/2.0); acceptance still needs an attested identity and a 2.0 observation.
  readiness:'provider_claims_unverified',engine_compatible:true,engine_policy_version:'market-policy/2.0',accepted_for_evaluation:false,
  blockers:['availability_timestamps_unverified','synthetic_flag_unverified','source_rights_unverified','issuer_identity_unverified','identity_attestation_required','price_adjustment_unverified','split_evidence_unverified',...(missingSessions.length?['missing_sessions']:[]),...(!p.splits.coverage.complete?['incomplete_split_coverage']:[])],
  availability_basis:'local_retrieval_only',observed_at:p.observed_at};
}
