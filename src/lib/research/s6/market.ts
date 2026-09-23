import {randomUUID} from 'node:crypto';
import {digest,bytesDigest,parseStrict,validateMarketSnapshot,type MarketSnapshot,type EvaluationInput} from 'dsh-trade-strategy-evaluator/engine';
import {mapAlphaKline} from 'dsh-trade-strategy-evaluator/adapters';
import calendar from '../../../../docs/handoffs/alpha-s4/calendar.json';
import {fail} from '../ingest/pa-v1/json.js';
import {transaction,serverTime,type S4Actor} from '../s4/db';
import {addRecord} from '../s4/records';
import {enabled,observationFor} from './store';

type Mapping=Parameters<typeof mapAlphaKline>[0];
function requireRawProvider(raw:string){
 const dto=parseStrict(raw) as {source?:string;meta?:{source?:string}};
 // The current gateway adapter can manufacture OHLC from closes without tagging
 // that derivation. Keep its real-data path closed until its evidence contract exists.
 if(dto?.source==='datagateway'||dto?.meta?.source==='datagateway')fail('source_unavailable');
}
/** Server/operator-only evidence. Never accepted from an evaluator/browser HTTP body. */
export async function freezeMarket(actor:S4Actor,observationId:string,mapping:Omit<Mapping,'calendar'>,evidenceKind:'synthetic'|'authorized-provider'){
 enabled();
 if(evidenceKind==='authorized-provider')requireRawProvider(mapping.raw);
 const mapped=mapAlphaKline({...mapping,calendar:calendar as EvaluationInput['calendar']});
 if(!mapped.ok)fail(mapped.error.code);
 if(!mapped.ok)throw Error('unreachable');
 return transaction(actor,async db=>{
  const o=(await observationFor(db,actor,observationId)).payload;
  if(evidenceKind==='synthetic'?!o.synthetic:o.synthetic||process.env.ALPHA_S6_REAL_MARKET!=='1')fail('policy_blocked');
  if(mapping.security.synthetic!==o.synthetic||![o.securities[0].ticker,'SPY'].includes(mapping.security.ticker))fail('scope_denied');
  if(mapping.security.ticker===o.securities[0].ticker&&digest(mapping.security)!==digest(o.securities[0]))fail('scope_denied');
  validateMarketSnapshot(mapped.snapshot,calendar as EvaluationInput['calendar'],await serverTime(db));
  const old=(await db.query('select observation_id,snapshot_hash,evidence_hash from research_s6_markets where user_id=$1 and id=$2',[actor.userId,mapped.snapshot.id])).rows[0];
  const evidence={kind:evidenceKind,proof:mapping.evidence},hash=digest(mapped.snapshot);
  if(old){if(old.observation_id!==observationId||old.snapshot_hash!==hash||old.evidence_hash!==digest(evidence))fail('idempotency_conflict');return {id:mapped.snapshot.id,sha256:hash,duplicate:true};}
  await db.query('insert into research_s6_markets(user_id,id,observation_id,snapshot,snapshot_hash,raw_response,evidence,evidence_hash) values($1,$2,$3,$4,$5,$6,$7,$8)',[actor.userId,mapped.snapshot.id,observationId,mapped.snapshot,hash,mapping.raw,evidence,digest(evidence)]);
  await addRecord(db,actor,o.candidate_ref,'ControlEvent',{type:'market.freeze',observation_ref:observationId,snapshot_ref:mapped.snapshot.id,snapshot_sha256:hash,raw_sha256:bytesDigest(mapping.raw),evidence_sha256:digest(evidence)});
  return {id:mapped.snapshot.id,sha256:hash,duplicate:false};
 });
}
/** Fetch actual Alpha HTTP bytes; a trusted evidence resolver must supply split/session proofs.
 * No evidence => no snapshot. HTTP is opt-in, bounded, exact-origin and never follows redirects. */
export async function captureAlphaKline(options:{origin:string;security:MarketSnapshot['security'];request:MarketSnapshot['request'];providerVersion:string;
 evidenceFor:(raw:string)=>Promise<unknown>;signal?:AbortSignal}){
 const base=new URL(options.origin);
 if(base.username||base.password||base.search||base.hash||base.pathname!=='/'||!(base.protocol==='https:'||(base.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname))))fail('invalid_schema');
 const url=new URL('/api/kline/'+encodeURIComponent(options.security.ticker),base);url.searchParams.set('range','all');url.searchParams.set('adjust','none');
 const deadline=AbortSignal.timeout(15000),signal=options.signal?AbortSignal.any([deadline,options.signal]):deadline;
 const response=await fetch(url,{redirect:'error',signal,headers:{accept:'application/json'}});
 if(!response.ok||!response.headers.get('content-type')?.includes('application/json')||!response.body){await response.body?.cancel();fail('source_unavailable');}
 const chunks:Uint8Array[]=[];let size=0;
 const reader=response.body!.getReader();
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000)fail('input_limit');chunks.push(value);}}
 finally{await reader.cancel();reader.releaseLock();}
 const raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Buffer.concat(chunks));
 if(!options.security.synthetic)requireRawProvider(raw);
 const evidence=await options.evidenceFor(raw);if(!evidence)fail('source_unavailable');
 return {raw,security:options.security,request:options.request,id:randomUUID(),providerVersion:options.providerVersion,evidence,as_of:new Date().toISOString()};
}
