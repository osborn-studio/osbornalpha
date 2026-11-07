// src/lib/judgments/contract.ts
// Pure validators of the judgment contract (spec §3.1–§3.4, §3.6, §6.1). Every function throws
// JudgmentError with a spec §13 code and does no I/O; existence of a subject is
// JudgmentsDb.subjectExists. Claims are checked per kind and must not carry unknown members (the
// claim is stored and compared for idempotency_conflict, so stray keys are refused, not dropped).
// judgmentIdOf addresses exactly the eight §6.1 fields; isRetrospective is the TS twin of the three
// rules register_judgment evaluates in SQL against registered_at (plan 契约补充).
import {uuidV8} from './uuid-v8';
import {digest} from './canonical';
import {JudgmentError} from './errors';
import {PUBLIC_SUBJECT_TYPES} from './types';
import type {Abstained,Claim,Horizon,Kind,ProducerKind,ProducerRef,Subject,SubjectType} from './types';

export const INDUSTRY_SCHEMES=['sw2021','sw2014','gics','csrc','custom'] as const;
const SUBJECT_TYPES:readonly string[]=['issuer','industry','macro_region','macro_series','security','document'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX64=/^[0-9a-f]{64}$/;
const HORIZON:Readonly<Record<Horizon['unit'],[number,number]>>={trading_sessions:[1,2520],calendar_days:[1,3660],calendar_months:[0,120],fiscal_quarters:[1,40]};

type Code='invalid_claim'|'invalid_condition'|'invalid_parameter';
const fail=(code:Code|'subject_missing',msg:string):never=>{throw new JudgmentError(code,msg);};
const isObj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=256):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const fin=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
function obj(v:unknown,keys:readonly string[],code:Code,what:string):Record<string,unknown>{
 if(!isObj(v))return fail(code,`${what}: not an object`);
 const extra=Object.keys(v).find(k=>!keys.includes(k));
 if(extra!==undefined)fail(code,`${what}: unknown member ${extra}`);
 return v;
}
function need(ok:boolean,code:Code,msg:string):void{if(!ok)fail(code,msg);}

function industryOk(k:string):boolean{
 const p=k.split(':');
 return p.length===3&&(INDUSTRY_SCHEMES as readonly string[]).includes(p[0])&&p[1].length>=1&&p[1].length<=32&&p[2].length>=1&&p[2].length<=32&&!/\s/.test(k);
}
function securityOk(k:string):boolean{
 const i=k.indexOf(':');
 return i>0&&['A','HK','US'].includes(k.slice(0,i))&&/^[A-Za-z0-9.-]{1,32}$/.test(k.slice(i+1));
}
export function validateSubject(subject:unknown,opts:{publicOnly?:boolean}={}):Subject{
 if(!isObj(subject)||typeof subject.type!=='string'||!SUBJECT_TYPES.includes(subject.type))return fail('subject_missing','invalid_subject_type');
 const type=subject.type as SubjectType;const key=subject.key;
 if((opts.publicOnly??true)&&!(PUBLIC_SUBJECT_TYPES as readonly string[]).includes(type))throw new JudgmentError('subject_type_not_public',type);
 if(typeof key!=='string'||key.length<1||key.length>128||key.trim()!==key)return fail('subject_missing',`invalid_subject_key:${type}`);
 const ok=type==='issuer'?UUID.test(key)
  :type==='industry'?industryOk(key)
  :type==='macro_region'?key==='US'||key==='CN'
  :type==='macro_series'?/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(key)
  :type==='security'?securityOk(key)
  :/^\S{1,128}$/.test(key);
 if(!ok)fail('subject_missing',`invalid_subject_key:${type}`);
 return {type,key};
}

function bilingual(v:unknown,what:string):void{
 const b=obj(v,['zh','en'],'invalid_claim',what);
 need(text(b.zh,500)&&text(b.en,500),'invalid_claim',`${what}: zh and en required`);
}
export function validateClaim(kind:Kind,claim:unknown):Claim{
 if(kind==='probability'){
  const c=obj(claim,['p','event'],'invalid_claim','probability');
  need(fin(c.p)&&c.p>=0&&c.p<=1,'invalid_claim','probability: p must be in [0,1]');
  bilingual(c.event,'probability.event');
 }else if(kind==='categorical'){
  const c=obj(claim,['selected','classes','distribution','scores_are_not_probabilities','margin_pp','catalog_version'],'invalid_claim','categorical');
  const classes=c.classes;
  need(Array.isArray(classes)&&classes.length>0&&classes.every(x=>text(x,64))&&new Set(classes).size===classes.length,'invalid_claim','categorical: classes must be unique non-empty strings');
  need(typeof c.selected==='string'&&(classes as string[]).includes(c.selected),'invalid_claim','categorical: selected not in classes');
  need(typeof c.scores_are_not_probabilities==='boolean','invalid_claim','categorical: scores_are_not_probabilities required');
  if(c.distribution!==undefined){
   need(isObj(c.distribution)&&Object.entries(c.distribution).every(([k,x])=>(classes as string[]).includes(k)&&fin(x)&&x>=0),'invalid_claim','categorical: distribution keys must be classes with values >= 0');
  }
  if(c.margin_pp!==undefined)need(fin(c.margin_pp)&&c.margin_pp>=0,'invalid_claim','categorical: margin_pp must be >= 0');
  if(c.catalog_version!==undefined)need(text(c.catalog_version,64),'invalid_claim','categorical: catalog_version');
 }else if(kind==='score'){
  const c=obj(claim,['value','scale','dims','coverage','realized_metric'],'invalid_claim','score');
  const s=obj(c.scale,['min','max'],'invalid_claim','score.scale');
  need(fin(s.min)&&fin(s.max)&&s.min<s.max,'invalid_claim','score: scale min < max');
  need(fin(c.value)&&c.value>=(s.min as number)&&c.value<=(s.max as number),'invalid_claim','score: value outside scale');
  need(Array.isArray(c.dims),'invalid_claim','score: dims must be an array');
  const ids=new Set<string>();
  for(const d0 of c.dims as unknown[]){
   const d=obj(d0,['id','value','weight','coverage'],'invalid_claim','score.dims[]');
   need(text(d.id,64)&&!ids.has(d.id),'invalid_claim','score: dim ids must be unique');ids.add(d.id as string);
   need(fin(d.weight)&&d.weight>=0,'invalid_claim','score: dim weight >= 0');
   need(typeof d.coverage==='boolean','invalid_claim','score: dim coverage boolean');
   need(d.coverage?fin(d.value):d.value===null,'invalid_claim','score: a covered dim has a value, a missing dim has null');
  }
  need(fin(c.coverage)&&c.coverage>=0&&c.coverage<=1,'invalid_claim','score: coverage in [0,1]');
  need(text(c.realized_metric,64),'invalid_claim','score: realized_metric required');
 }else if(kind==='interval'){
  const c=obj(claim,['metric','low','high','unit','nominal_coverage','scenarios','scenario_event_hash'],'invalid_claim','interval');
  need(text(c.metric,64)&&text(c.unit,16),'invalid_claim','interval: metric and unit required');
  need(fin(c.low)&&fin(c.high)&&c.low<=c.high,'invalid_claim','interval: low <= high');
  need(fin(c.nominal_coverage)&&c.nominal_coverage>0&&c.nominal_coverage<1,'invalid_claim','interval: nominal_coverage in (0,1)');
  if(c.scenarios!==undefined){
   need(Array.isArray(c.scenarios)&&c.scenarios.length>0,'invalid_claim','interval: scenarios non-empty');
   let sum=0;
   for(const x0 of c.scenarios as unknown[]){
    const x=obj(x0,['label','p','value'],'invalid_claim','interval.scenarios[]');
    need(text(x.label,64)&&fin(x.p)&&x.p>=0&&x.p<=1&&fin(x.value),'invalid_claim','interval: scenario label, p in [0,1], value');
    sum+=x.p as number;
   }
   need(Math.abs(sum-1)<=1e-9,'invalid_claim','interval: scenario probabilities must sum to 1');
  }
  if(c.scenario_event_hash!==undefined)need(typeof c.scenario_event_hash==='string'&&HEX64.test(c.scenario_event_hash),'invalid_claim','interval: scenario_event_hash');
 }else fail('invalid_claim',`unknown kind ${String(kind)}`);
 return claim as Claim;
}

export function validateHorizon(h:unknown):Horizon{
 const o=obj(h,['unit','n'],'invalid_condition','horizon');
 const range=typeof o.unit==='string'?HORIZON[o.unit as Horizon['unit']]:undefined;
 need(range!==undefined,'invalid_condition','horizon: unknown unit');
 need(Number.isSafeInteger(o.n)&&(o.n as number)>=range![0]&&(o.n as number)<=range![1],'invalid_condition','horizon: n out of range');
 return {unit:o.unit as Horizon['unit'],n:o.n as number};
}

export const isAbstained=(x:unknown):x is Abstained=>isObj(x)&&x.abstained===true;

export type JudgmentIdFields={subject_type:SubjectType;subject_key:string;judgment_type:string;methodology_id:string;methodology_version:string;as_of:string;inputs_hash:string;producer_nonce:string};
export function judgmentIdOf(f:JudgmentIdFields):string{
 if(typeof f.inputs_hash!=='string'||!HEX64.test(f.inputs_hash))fail('invalid_parameter','inputs_hash');
 return uuidV8(digest({subject_type:f.subject_type,subject_key:f.subject_key,judgment_type:f.judgment_type,methodology_id:f.methodology_id,methodology_version:f.methodology_version,as_of:f.as_of,inputs_hash:f.inputs_hash,producer_nonce:f.producer_nonce}));
}

export function producerNonceOf(kind:ProducerKind,ref:ProducerRef):string{
 const r=ref as Record<string,unknown>;
 if(kind==='rule'){need(isObj(r)&&Object.keys(r).length===0,'invalid_parameter','producer_ref: rule takes {}');return '';}
 if(kind==='model'){
  const o=obj(r,['model','prompt_sha256','run_id'],'invalid_parameter','producer_ref');
  need(text(o.model)&&typeof o.prompt_sha256==='string'&&HEX64.test(o.prompt_sha256)&&text(o.run_id),'invalid_parameter','producer_ref: model');
  return o.run_id as string;
 }
 if(kind==='human'){
  const o=obj(r,['analyst_id','source_record'],'invalid_parameter','producer_ref');
  const s=obj(o.source_record,['table','id'],'invalid_parameter','producer_ref.source_record');
  need(text(o.analyst_id)&&text(s.table,64)&&text(s.id),'invalid_parameter','producer_ref: human');
  return `${o.analyst_id}:${s.table}:${s.id}`;
 }
 if(kind==='third_party'){
  const o=obj(r,['institution','document_id','version_hash'],'invalid_parameter','producer_ref');
  need(text(o.institution)&&text(o.document_id)&&text(o.version_hash),'invalid_parameter','producer_ref: third_party');
  return `${o.document_id}:${o.version_hash}`;
 }
 return fail('invalid_parameter',`producer_kind ${String(kind)}`);
}

export function isRetrospective(x:{as_of:string;registered_at:string;settle_after:string|null;label_available_at:string|null}):boolean{
 const at=Date.parse(x.registered_at);
 return x.as_of<new Date(at).toISOString().slice(0,10)
  ||(x.settle_after!==null&&Date.parse(x.settle_after)<=at)
  ||(x.label_available_at!==null&&Date.parse(x.label_available_at)<=at);
}
