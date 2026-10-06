import {fail} from '../ingest/pa-v1/json.js';
import {isUuid} from '../s4/ledger';
import {exactPlanObject as object} from './arm-plan-object';
import {verifyArmGenesis} from './arm-genesis';
import {allocatedJournalRefs,replayJournalIntegrity} from './arm-journal-integrity';
/** Inactive binding of already-loaded structural snapshots, NOT a database loader
 * or authority verifier. trustedScope must come from authenticated/mapped server
 * context, and row/head/full rows from immutable owner-locked storage. A client
 * supplying consistent snapshots proves nothing. No endpoint uses this helper.
 * Actor/typed origins/current source permissions/calendar/budget remain required. */
export function bindStoredArmJournalIntegrity(trustedScope:unknown,genesisRow:unknown,storedHead:unknown,rows:unknown){
 const scope=object(trustedScope,['owner_id','enrollment_id','candidate_id']);
 if(Object.values(scope).some(v=>!isUuid(v)))fail('invalid_schema');
 const row=object(genesisRow,['protocol','record_type','id','owner_id','enrollment_id','candidate_id','payload','payload_hash']);
 const head=object(storedHead,['protocol','owner_id','enrollment_id','candidate_id','genesis_ref','genesis_hash','created_at','event_count','last_sequence','last_event_hash']);
 if(row.protocol!=='alpha-arm-genesis-record/1.0'||row.record_type!=='ArmCohortGenesis'||!isUuid(row.id)||head.protocol!=='alpha-arm-bound-head/1.0'||!isUuid(head.genesis_ref))fail('invalid_schema');
 for(const key of ['owner_id','enrollment_id','candidate_id'])if(row[key]!==scope[key]||head[key]!==scope[key])fail('hash_mismatch');
 if(row.id!==head.genesis_ref||row.payload_hash!==head.genesis_hash)fail('hash_mismatch');
 const genesis=verifyArmGenesis(row.payload,head.genesis_hash);
 for(const key of ['owner_id','enrollment_id','candidate_id'] as const)if(genesis.payload[key]!==scope[key])fail('hash_mismatch');
 if(head.created_at!==genesis.payload.created_at)fail('hash_mismatch');
 const p=genesis.payload;
 const reservedIds=[row.id as string,p.enrollment_id,p.candidate_id,p.thesis_id,p.calendar_session_ref,p.authorization_ref,...Object.values(p.observation_ids),p.source_bundle.source_reference.feed_id,p.source_bundle.source_reference.source_id,...Object.values(p.source_bundle.purpose_map).filter(g=>g!==null).map(g=>g.grant_id)];
 const reserved=new Set(reservedIds);
 // The genesis storage wrapper is a separate record object, excluded from payload
 // preimage. It cannot alias one of the logical objects it identifies.
 if(reserved.size!==reservedIds.length)fail('hash_mismatch');
 const replay=replayJournalIntegrity(rows,{protocol:'alpha-arm-head/1.0',owner_id:scope.owner_id,enrollment_id:scope.enrollment_id,genesis_hash:genesis.genesis_hash,created_at:p.created_at,event_count:head.event_count,last_sequence:head.last_sequence,last_event_hash:head.last_event_hash});
 const principals=new Set([p.owner_id,p.creator_actor_ref]);
 if(reservedIds.some(id=>principals.has(id)))fail('hash_mismatch');
 const nonAuthorizationObjects=new Set(reservedIds.filter(id=>id!==p.authorization_ref));
 for(const e of replay.events){
  const newIds=[e.id,e.request_ref,...allocatedJournalRefs(e)];
  if(newIds.some(id=>reserved.has(id)||principals.has(id)))fail('hash_mismatch');
  for(const id of newIds)nonAuthorizationObjects.add(id);
 }
 // Namespace separation only; reuse of an authorization/actor reference still
 // requires immutable typed-origin resolution and per-command policy later.
 const authorizations=new Set([p.authorization_ref,...replay.events.map(e=>e.authorization_ref)]);
 const actors=new Set([...principals,...replay.events.map(e=>e.actor_ref)]);
 for(const id of authorizations)if(nonAuthorizationObjects.has(id)||actors.has(id))fail('hash_mismatch');
 for(const id of actors)if(nonAuthorizationObjects.has(id))fail('hash_mismatch');
 return Object.freeze({integrity_only:true as const,genesis:genesis.payload,genesis_hash:genesis.genesis_hash,replay});
}
