import {randomUUID} from 'node:crypto';
import {digest,bytesDigest,parseStrict,validateMarketSnapshot,type MarketSnapshot,type MarketSnapshotV2,type EvaluationInput} from 'dsh-trade-strategy-evaluator/engine';
import {mapAlphaKline,mapMarketHandoff,type IdentityAttestation} from 'dsh-trade-strategy-evaluator/adapters';
import type {PoolClient} from 'pg';
import calendar from '../../../../docs/handoffs/alpha-s4/calendar.json';
import policyV2 from '../../../../docs/handoffs/alpha-s6/market-policy-v2.json';
import attestationFile from '../../../../docs/handoffs/alpha-s6/identity-attestations.json';
import {fail} from '../ingest/pa-v1/json.js';
import {OBSERVATION_CONTRACT_V2} from '../market-policy';
import {transaction,serverTime,type S4Actor} from '../s4/db';
import {addRecord} from '../s4/records';
import {enabled,observationFor} from './store';
import {registeredObservationTransaction} from './registered';

type Mapping=Parameters<typeof mapAlphaKline>[0];
type SecurityV2=MarketSnapshotV2['security'];
type AnySnapshot=MarketSnapshot|MarketSnapshotV2;
const frozenCalendar=calendar as EvaluationInput['calendar'];
const isV2=(o:{schema_version:string})=>o.schema_version===OBSERVATION_CONTRACT_V2;
/** Benchmark identity under market-policy/2.0: SPY listed on NYSE Arca, never a company entity. */
export const benchmarkIdentity=(synthetic:boolean):SecurityV2=>({ticker:policyV2.benchmark.ticker,listing_mic:policyV2.benchmark.listing_mic,currency:'USD',company_entity_id:null,synthetic});
export const IDENTITY_ATTESTATIONS:IdentityAttestation[]=attestationFile.entries as IdentityAttestation[];

function requireCurrentPolicy(security:{synthetic:boolean}){
 // The kline DTO path has no trusted split/availability evidence resolver for real data.
 // Real instruments only enter through attested market-handoff bundles (freezeMarketHandoff).
 if(!security.synthetic)fail('rule_unsupported');
}
function requireRawProvider(raw:string){
 const dto=parseStrict(raw) as {source?:string;meta?:{source?:string}};
 // The current gateway adapter can manufacture OHLC from closes without tagging
 // that derivation. Keep its real-data path closed until its evidence contract exists.
 if(dto?.source==='datagateway'||dto?.meta?.source==='datagateway')fail('source_unavailable');
}
/** Persist an already validated snapshot for an observation (idempotent by snapshot id). */
async function persistSnapshot(db:PoolClient,actor:S4Actor,observationId:string,candidateRef:string,snapshot:AnySnapshot,raw:string,evidence:Record<string,unknown>){
 const old=(await db.query('select observation_id,snapshot_hash,evidence_hash from research_s6_markets where user_id=$1 and id=$2',[actor.userId,snapshot.id])).rows[0];
 const hash=digest(snapshot);
 if(old){if(old.observation_id!==observationId||old.snapshot_hash!==hash||old.evidence_hash!==digest(evidence))fail('idempotency_conflict');return {id:snapshot.id,sha256:hash,duplicate:true};}
 await db.query('insert into research_s6_markets(user_id,id,observation_id,snapshot,snapshot_hash,raw_response,evidence,evidence_hash) values($1,$2,$3,$4,$5,$6,$7,$8)',[actor.userId,snapshot.id,observationId,snapshot,hash,raw,evidence,digest(evidence)]);
 await addRecord(db,actor,candidateRef,'ControlEvent',{type:'market.freeze',observation_ref:observationId,snapshot_ref:snapshot.id,snapshot_sha256:hash,raw_sha256:bytesDigest(raw),evidence_sha256:digest(evidence)});
 return {id:snapshot.id,sha256:hash,duplicate:false};
}
/** Server/operator-only evidence. Never accepted from an evaluator/browser HTTP body.
 * Kline DTO path: synthetic material only. For a 2.0 observation the mapped 1.0 snapshot is
 * re-labelled with the observation's listing identity (target XNYS, benchmark SPY/ARCX). */
type FreezeMapping=Omit<Mapping,'calendar'|'security'>&{security:MarketSnapshot['security']|SecurityV2};
export function freezeMarket(actor:S4Actor,observationId:string,mapping:FreezeMapping,evidenceKind:'synthetic'|'authorized-provider'){
 return freezeMarketWithPolicy(actor,observationId,mapping,evidenceKind,false);
}
/** Registered operator/internal adapter. No HTTP route or real-market capability is enabled. */
export function freezeRegisteredMarket(actor:S4Actor,observationId:string,mapping:FreezeMapping,evidenceKind:'synthetic'){
 if(evidenceKind!=='synthetic')fail('rule_unsupported');
 return freezeMarketWithPolicy(actor,observationId,mapping,evidenceKind,true);
}
async function freezeMarketWithPolicy(actor:S4Actor,observationId:string,mapping:FreezeMapping,evidenceKind:'synthetic'|'authorized-provider',registered:boolean){
 enabled();
 requireCurrentPolicy(mapping.security);
 if(evidenceKind==='authorized-provider')requireRawProvider(mapping.raw);
 const work=async(db:PoolClient)=>{
  const o=(await observationFor(db,actor,observationId)).payload as {schema_version:string;synthetic:boolean;securities:Array<Record<string,unknown>>;candidate_ref:string};
  if(evidenceKind==='synthetic'?!o.synthetic:o.synthetic||process.env.ALPHA_S6_REAL_MARKET!=='1')fail('policy_blocked');
  const ticker=mapping.security.ticker,target=o.securities[0];
  if(mapping.security.synthetic!==o.synthetic||![target.ticker,policyV2.benchmark.ticker].includes(ticker))fail('scope_denied');
  const now=await serverTime(db);
  let snapshot:AnySnapshot;
  if(isV2(o)){
   const identity=ticker===target.ticker?target as unknown as SecurityV2:benchmarkIdentity(o.synthetic);
   if(digest(mapping.security)!==digest(identity))fail('scope_denied');
   // The frozen 1.0 mapper validates against the XNYS session venue; identity is restored from the 2.0 observation.
   const shim:MarketSnapshot['security']={ticker:identity.ticker,exchange:'XNYS',currency:'USD',company_entity_id:identity.company_entity_id,synthetic:identity.synthetic};
   const mapped=mapAlphaKline({...mapping,security:shim,calendar:frozenCalendar});
   if(!mapped.ok)fail(mapped.error.code);
   if(!mapped.ok)throw Error('unreachable');
   snapshot={...mapped.snapshot,schema_version:'market-snapshot/2.0',security:identity,warnings:[...mapped.snapshot.warnings,'identity_from_observation_contract_2']};
   validateMarketSnapshot(snapshot,frozenCalendar,now,policyV2);
  }else{
   if(ticker===target.ticker&&digest(mapping.security)!==digest(target))fail('scope_denied');
   const mapped=mapAlphaKline({...mapping,security:mapping.security as MarketSnapshot['security'],calendar:frozenCalendar});
   if(!mapped.ok)fail(mapped.error.code);
   if(!mapped.ok)throw Error('unreachable');
   snapshot=mapped.snapshot;
   validateMarketSnapshot(snapshot,frozenCalendar,now);
  }
  return persistSnapshot(db,actor,observationId,o.candidate_ref,snapshot,mapping.raw,{kind:evidenceKind,proof:mapping.evidence});
 };
 return registered?registeredObservationTransaction(actor,observationId,work):transaction(actor,work);
}
/**
 * E3b: freeze one leg (target or SPY) of an `alpha-market-handoff/1.0` bundle for a 2.0 observation.
 * Identity must be covered by the committed attestation list for the exact identity document in the
 * bundle; a real observation additionally requires ALPHA_S6_REAL_MARKET=1 and a non-synthetic bundle.
 * The bundle is operator/server supplied, never an evaluator/browser HTTP body.
 */
export function freezeMarketHandoff(actor:S4Actor,observationId:string,input:{raw:string;id?:string}){
 return freezeHandoffWithPolicy(actor,observationId,input,false);
}
/** Registered operator adapter, deliberately synthetic-only until real-data admission is reviewed. */
export function freezeRegisteredMarketHandoff(actor:S4Actor,observationId:string,input:{raw:string;id?:string}){
 return freezeHandoffWithPolicy(actor,observationId,input,true);
}
async function freezeHandoffWithPolicy(actor:S4Actor,observationId:string,input:{raw:string;id?:string},registered:boolean){
 enabled();
 const bundle=parseStrict(input.raw) as {synthetic?:boolean;security?:{ticker?:string}};
 if(registered&&bundle?.synthetic!==true)fail('rule_unsupported');
 const id=input.id??randomUUID();
 const work=async(db:PoolClient)=>{
  const o=(await observationFor(db,actor,observationId)).payload as {schema_version:string;synthetic:boolean;securities:Array<Record<string,unknown>>;candidate_ref:string};
  if(!isV2(o))fail('rule_unsupported');
  if(typeof bundle?.synthetic!=='boolean'||bundle.synthetic!==o.synthetic)fail('scope_denied');
  if(!o.synthetic&&process.env.ALPHA_S6_REAL_MARKET!=='1')fail('policy_blocked');
  const target=o.securities[0] as unknown as SecurityV2,ticker=bundle.security?.ticker;
  if(ticker!==target.ticker&&ticker!==policyV2.benchmark.ticker)fail('scope_denied');
  const security=ticker===target.ticker?target:benchmarkIdentity(o.synthetic);
  const attestations=IDENTITY_ATTESTATIONS.filter(a=>a.synthetic===o.synthetic);
  const mapped=mapMarketHandoff({raw:input.raw,calendar:frozenCalendar,attestations,policy:policyV2,id,as_of:await serverTime(db),security});
  if(!mapped.ok)fail(mapped.error.code);
  if(!mapped.ok)throw Error('unreachable');
  const attestation=attestations.find(a=>a.ticker===security.ticker&&a.listing_mic===security.listing_mic)??null;
  const evidence={kind:o.synthetic?'synthetic':'attested-handoff',proof:{format:'alpha-market-handoff/1.0',bundle_sha256:bytesDigest(input.raw),adapter_version:mapped.snapshot.adapter_version,attestation}};
  return persistSnapshot(db,actor,observationId,o.candidate_ref,mapped.snapshot,input.raw,evidence);
 };
 return registered?registeredObservationTransaction(actor,observationId,work):transaction(actor,work);
}
/** Fetch actual Alpha HTTP bytes; a trusted evidence resolver must supply split/session proofs.
 * No evidence => no snapshot. HTTP is opt-in, bounded, exact-origin and never follows redirects. */
export async function captureAlphaKline(options:{origin:string;security:MarketSnapshot['security'];request:MarketSnapshot['request'];providerVersion:string;
 evidenceFor:(raw:string)=>Promise<unknown>;signal?:AbortSignal}){
 requireCurrentPolicy(options.security);
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
