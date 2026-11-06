// src/lib/evals/replay/fixture.ts
// Replay fixture files fixtures/replay/<module>.<mode>.json (spec §5.3.1, §5.3.2). A case is a DRAFT
// (recorded = expected = null; frozen drafts carry an unsealed setup) until scripts/evals/record-replay.ts
// records it; evaluation only accepts recorded cases. Every recorded case is self-checking:
// expected.projection_hash must equal projectionHash(expected.projection). A request is either a facts
// request (concepts non-empty, no metrics) or a metrics request (metrics non-empty, concepts []).
// Structural problems throw EvalError('gold_invalid'). serializeReplayFile is the only writer format
// (JSON, one-space indent, trailing newline) so re-recording produces minimal diffs.
import {isConceptId} from '../../facts/concepts';
import {metricNames} from '../../facts/derive';
import {projectionHash} from '../canonical-json';
import {EvalError} from '../errors';
import type {Projection,ReplayRequest} from '../types';

export type ReplayMode='frozen'|'live';
/** A sealed frozen setup (replay/setup.ts::FrozenSetup); only these two fields are read here. */
export interface SealedSetup{setup_sha256:string;today:string;[k:string]:unknown}
export interface ReplayExpected{projection_hash:string;projection:Projection}
export interface Supersession{ledger_id:string;before_hash:string;after_hash:string;at:string}
interface RecordedBase{case_id:string;request:ReplayRequest;expected:ReplayExpected;supersessions?:Supersession[]}
export interface FrozenReplayCase extends RecordedBase{setup:SealedSetup;recorded:{code_version:string;at:string}}
export interface LiveReplayCase extends RecordedBase{recorded:{code_version:string;at:string;state_rev:number}}
export type ReplayCase=FrozenReplayCase|LiveReplayCase;
export interface DraftReplayCase{case_id:string;request:ReplayRequest;setup?:Record<string,unknown>;recorded:null;expected:null}
export interface ReplayFile{schema_version:1;module:'facts';mode:ReplayMode;cases:(ReplayCase|DraftReplayCase)[]}

export const isDraft=(c:ReplayCase|DraftReplayCase):c is DraftReplayCase=>c.expected===null;
const HEX64=/^[0-9a-f]{64}$/,HEX40=/^[0-9a-f]{40}$/,DAY=/^\d{4}-\d{2}-\d{2}$/,CASE_ID=/^[a-z0-9][a-z0-9._:\/-]{0,199}$/;
const DURATIONS=new Set(['3M','6M','9M','12M','INSTANT']);
const isObj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const isDay=(v:unknown):v is string=>typeof v==='string'&&DAY.test(v)&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v;
const isTs=(v:unknown):v is string=>typeof v==='string'&&!Number.isNaN(Date.parse(v));
const uniqueStrings=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(x=>typeof x==='string')&&new Set(v).size===v.length;

function parseRequest(v:unknown,fail:(f:string)=>never):ReplayRequest{
 if(!isObj(v))return fail('request');
 const iss=v.issuer;
 if(!isObj(iss)||(iss.market!=='US'&&iss.market!=='CN'))return fail('request.issuer.market');
 if(iss.cik!==undefined&&!(typeof iss.cik==='string'&&/^\d{1,10}$/.test(iss.cik)))return fail('request.issuer.cik');
 if(iss.ticker!==undefined&&!(typeof iss.ticker==='string'&&iss.ticker.length>0))return fail('request.issuer.ticker');
 if(iss.cik===undefined&&iss.ticker===undefined)return fail('request.issuer');
 if(!uniqueStrings(v.concepts)||!v.concepts.every(isConceptId))return fail('request.concepts');
 if(!isDay(v.asOf))return fail('request.asOf');
 if(v.durations!==undefined&&!(uniqueStrings(v.durations)&&v.durations.every(d=>DURATIONS.has(d))))return fail('request.durations');
 const names=new Set(metricNames(iss.market));
 if(v.metrics!==undefined&&!(uniqueStrings(v.metrics)&&v.metrics.every(m=>names.has(m))))return fail('request.metrics');
 const metrics=(v.metrics as string[]|undefined)??[];
 if(metrics.length>0?v.concepts.length>0:v.concepts.length===0)return fail('request.concepts_xor_metrics');
 return {issuer:{market:iss.market,...(iss.cik!==undefined?{cik:iss.cik as string}:{}),...(iss.ticker!==undefined?{ticker:iss.ticker as string}:{})},concepts:v.concepts,asOf:v.asOf,
  ...(v.durations!==undefined?{durations:v.durations as string[]}:{}),...(v.metrics!==undefined?{metrics}:{})};
}
function parseExpected(v:unknown,fail:(f:string)=>never):ReplayExpected{
 if(!isObj(v)||typeof v.projection_hash!=='string'||!HEX64.test(v.projection_hash))return fail('expected.projection_hash');
 const p=v.projection;
 if(!isObj(p)||(p.module!=='facts'&&p.module!=='metrics')||!Array.isArray(p.rows)||!p.rows.every(isObj))return fail('expected.projection');
 const projection=p as unknown as Projection;
 if(projectionHash(projection)!==v.projection_hash)return fail('expected.projection_hash_mismatch');
 return {projection_hash:v.projection_hash,projection};
}

export function parseReplayFile(raw:unknown,opts:{allowDrafts:boolean;file?:string}):ReplayFile{
 const file=opts.file??'replay fixture';
 const top=(f:string):never=>{throw new EvalError('gold_invalid',`${file}: ${f}`,{file,field:f});};
 if(!isObj(raw)||raw.schema_version!==1)return top('schema_version');
 if(raw.module!=='facts')return top('module');
 if(raw.mode!=='frozen'&&raw.mode!=='live')return top('mode');
 if(!Array.isArray(raw.cases))return top('cases');
 const mode:ReplayMode=raw.mode;const seen=new Set<string>();
 const cases=raw.cases.map((c,i):ReplayCase|DraftReplayCase=>{
  const id=isObj(c)&&typeof c.case_id==='string'?c.case_id:`#${i}`;
  const fail=(f:string):never=>{throw new EvalError('gold_invalid',`${file}: case ${id}: ${f}`,{file,case_id:id,field:f});};
  if(!isObj(c)||typeof c.case_id!=='string'||!CASE_ID.test(c.case_id))return fail('case_id');
  if(seen.has(c.case_id))return fail('case_id_duplicate');seen.add(c.case_id);
  const request=parseRequest(c.request,fail);
  if(c.recorded===null&&c.expected===null){
   if(!opts.allowDrafts)return fail('not_recorded');
   if(mode==='frozen'&&!isObj(c.setup))return fail('setup');
   return {case_id:c.case_id,request,...(mode==='frozen'?{setup:c.setup as Record<string,unknown>}:{}),recorded:null,expected:null};
  }
  const rec=c.recorded;
  if(!isObj(rec)||typeof rec.code_version!=='string'||!HEX40.test(rec.code_version))return fail('recorded.code_version');
  if(!isTs(rec.at))return fail('recorded.at');
  const expected=parseExpected(c.expected,fail);
  const supersessions=c.supersessions===undefined?undefined:Array.isArray(c.supersessions)&&c.supersessions.every(s=>isObj(s)&&typeof s.ledger_id==='string'&&typeof s.before_hash==='string'&&HEX64.test(s.before_hash)&&typeof s.after_hash==='string'&&HEX64.test(s.after_hash)&&isTs(s.at))?c.supersessions as Supersession[]:fail('supersessions');
  const extra=supersessions===undefined?{}:{supersessions};
  if(mode==='live'){
   if(!(typeof rec.state_rev==='number'&&Number.isSafeInteger(rec.state_rev)&&rec.state_rev>=0))return fail('recorded.state_rev');
   return {case_id:c.case_id,request,recorded:{code_version:rec.code_version,at:rec.at,state_rev:rec.state_rev},expected,...extra};
  }
  const s=c.setup;
  if(!isObj(s)||typeof s.setup_sha256!=='string'||!HEX64.test(s.setup_sha256)||!isDay(s.today))return fail('setup.sealed');
  return {case_id:c.case_id,request,setup:s as SealedSetup,recorded:{code_version:rec.code_version,at:rec.at},expected,...extra};
 });
 return {schema_version:1,module:'facts',mode,cases};
}

/** The recorded cases of a file; any draft left → gold_invalid (evaluation never runs a draft). */
export function recordedCases(f:ReplayFile):ReplayCase[]{
 const draft=f.cases.find(isDraft);
 if(draft)throw new EvalError('gold_invalid',`replay case ${draft.case_id} is not recorded`,{case_id:draft.case_id});
 return f.cases as ReplayCase[];
}
export const serializeReplayFile=(f:ReplayFile):string=>`${JSON.stringify(f,null,1)}\n`;
