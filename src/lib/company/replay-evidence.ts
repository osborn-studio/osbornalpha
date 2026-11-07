// Offline replay of a saved company facts-series response against downloaded EDGAR bytes.
// Verifies source/value consistency with the CURRENT landed mapping, not metadata authenticity,
// historical parser versions, the completeness of the disclosure history, or human gold truth.
import {createHash} from 'node:crypto';
import {MAPPING_VERSION} from '@/lib/facts/concepts';
import {decimalEquals} from '@/lib/facts/json-numbers';
import {decodeCompanyFacts,parseCompanyFacts} from '@/lib/facts/providers/edgar-companyfacts';
import {snapshotOf} from '@/lib/facts/providers/shared';
import {evidenceEligible} from './evidence-gate';
import {EVIDENCE_SINCE_YEAR,edgarPointer,resolvePointer} from './evidence-index';
import type {EvidenceDto,FilingSummary} from './types';

export type ReplayRejection='malformed_response'|'source_not_supported'|'read_truncated'|'fact_unavailable'|'mapping_version_unsupported'|'evidence_incomplete'|'snapshot_hash_mismatch'|'candidate_mismatch'|'pointer_mismatch';
export type SourceReplayResult={status:'source_replay_verified';factId:string;value:string;snapshotSha256:string;mappingVersion:string}|{status:'rejected';reason:ReplayRejection};
const reject=(reason:ReplayRejection):SourceReplayResult=>({status:'rejected',reason});
const obj=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const str=(x:unknown):x is string=>typeof x==='string'&&x.length>0;

/** `body` is the unmodified JSON from GET /api/companies/:ticker/facts, including its evidence dictionary. */
export function replayCompanyEvidence(body:unknown,factId:string,bytes:Uint8Array):SourceReplayResult{
 try{
  if(!obj(body)||!str(body.market)||!Array.isArray(body.series)||!Array.isArray(body.otherUnitSeries)||!obj(body.filings)||!obj(body.evidence)||body.history!==true||typeof body.truncated!=='boolean'||!['concept','periodStart','periodEnd','unit','asOf'].every(k=>str(body[k])))return reject('malformed_response');
  if(body.market!=='US')return reject('source_not_supported');
  if(body.truncated)return reject('read_truncated');
  const primary=body.series.filter(x=>obj(x)&&x.factId===factId);
  const entries=[...body.series,...body.otherUnitSeries].filter(x=>obj(x)&&x.factId===factId);
  if(entries.length!==1)return reject('fact_unavailable');
  const entry=entries[0] as Record<string,unknown>;
  if(entry.kind==='withheld')return reject('fact_unavailable');
  if(entry.kind!=='fact'||!['filingId','sourceConcept','value','rawHash','runId','mappingVersion','unit'].every(k=>str(entry[k])))return reject('malformed_response');
  if(primary.length===1&&entry.unit!==body.unit)return reject('candidate_mismatch');
  if(entry.mappingVersion!==MAPPING_VERSION)return reject('mapping_version_unsupported');
  const evidence=body.evidence[factId] as EvidenceDto|undefined;
  const filing=body.filings[entry.filingId as string] as FilingSummary|undefined;
  if(!evidence||!filing||evidence.mappingVersion!==entry.mappingVersion||!evidenceEligible(evidence,{fact_id:factId,filing_id:entry.filingId as string,raw_hash:entry.rawHash as string,run_id:entry.runId as string,unit:entry.unit as string},filing,'US',{admin:false}).ok)return reject('evidence_incomplete');
  const sha=createHash('sha256').update(bytes).digest('hex');
  if(sha!==evidence.snapshot.sha256)return reject('snapshot_hash_mismatch');
  const parsed=parseCompanyFacts(snapshotOf(bytes,{source:'edgar'}),{sinceYear:EVIDENCE_SINCE_YEAR});
  const candidates=[...parsed.candidates,...parsed.ambiguous.flatMap(x=>x.candidates),...parsed.oddDuration];
  const matches=candidates.filter(c=>c.rawHash===entry.rawHash&&c.concept===body.concept&&c.sourceConcept===entry.sourceConcept&&c.filingRef===filing.sourceRef&&
   (c.periodStart??c.periodEnd)===body.periodStart&&c.periodEnd===body.periodEnd&&c.unit===entry.unit&&decimalEquals(c.value,entry.value as string));
  if(matches.length!==1)return reject('candidate_mismatch');
  const candidate=matches[0] as typeof matches[number]&{locator?:string};
  const pointer=candidate.locator?edgarPointer(candidate.locator):null;
  if(!pointer||candidate.locator!==evidence.locator.hashLocator||pointer!==evidence.locator.jsonPointer)return reject('pointer_mismatch');
  const value=resolvePointer(decodeCompanyFacts(bytes),pointer);
  if(!obj(value)||!str(value.val)||!decimalEquals(value.val,entry.value as string))return reject('pointer_mismatch');
  return {status:'source_replay_verified',factId,value:candidate.value,snapshotSha256:sha,mappingVersion:MAPPING_VERSION};
 }catch{return reject('malformed_response');}
}
