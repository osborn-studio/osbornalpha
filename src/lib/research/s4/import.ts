import { randomUUID } from 'node:crypto';
import { prepareCandidate } from '../ingest/candidate';
import { canonicalize, digest, fail, parseStrict, sha256 } from '../ingest/pa-v1/json.js';
import { bindingFor, assertWritableChain, serverTime, transaction, type S4Actor } from './db';
import { addRecord } from './records';

export async function importCandidate(actor:S4Actor,raw:string) {
  // Digest only selects a server-provisioned binding; it never grants access.
  const envelope = parseStrict(raw);
  const manifest = parseStrict(envelope?.files?.['manifest.json'] || 'null');
  if (!manifest || typeof manifest.payload_digest !== 'string') fail('invalid_schema');
  return transaction(actor,async db => {
    await assertWritableChain(db,actor);
    const binding = await bindingFor(db,actor,manifest.payload_digest);
    const prepared = prepareCandidate(raw,actor.userId,binding);
    const existing = (await db.query('select id from public.research_s4_candidates where user_id=$1 and payload_hash=$2',[actor.userId,prepared.payloadHash])).rows[0];
    if (existing) return { id:existing.id as string,duplicate:true };
    const receivedAt = await serverTime(db);
    if ([prepared.sourceVersion.first_observed_at,prepared.sourceVersion.ingested_at,prepared.candidate.selected_at,prepared.manifest.created_at].some(t=>Date.parse(t)>Date.parse(receivedAt))) fail('future_input');
    const sourceHash = sha256(prepared.rawText);
    let source = (await db.query('select public.research_s4_source_id($1,$2) as id',[actor.userId,sourceHash])).rows[0];
    if (!source?.id) {
      source = { id:randomUUID() };
      await db.query(`insert into public.research_source_documents(id,user_id,source_type,title,raw_text,content_hash,trust_level,ingested_at,metadata)
        values($1,$2,'MANUAL',$3,$4,$5,'LOW',$6,'{"s4_controlled_copy":true}')`,[source.id,actor.userId,'PA candidate snapshot',prepared.rawText,sourceHash,receivedAt]);
    }
    const ref = prepared.sourceRef;
    const identity = digest([ref.owner_system,ref.owner_scope,ref.source_id,ref.version_id]);
    let version = (await db.query('select id,source_key,source_version from public.research_source_versions where user_id=$1 and version_identity=$2',[actor.userId,identity])).rows[0];
    if (version && (version.source_key !== prepared.sourceKey || digest(version.source_version)!==digest(prepared.sourceVersion))) fail('source_version_conflict');
    if (!version) {
      version = { id:randomUUID(),source_key:prepared.sourceKey };
      await db.query(`insert into public.research_source_versions(user_id,id,source_document_id,version_identity,source_key,source_ref,source_version,received_at)
        values($1,$2,$3,$4,$5,$6,$7,$8)`,[actor.userId,version.id,source.id,identity,prepared.sourceKey,canonicalize(ref),canonicalize(prepared.sourceVersion),receivedAt]);
    }
    const occurrence = { ...prepared.occurrence,received_at:receivedAt };
    await db.query(`insert into public.research_source_occurrences(user_id,id,source_version_id,pack_id,data) values($1,$2,$3,$4,$5)
      on conflict(user_id,source_version_id,pack_id) do nothing`,[actor.userId,randomUUID(),version.id,prepared.manifest.pack_id,canonicalize(occurrence)]);
    const id = randomUUID();
    const { rawText: _raw, ...imported } = prepared;
    void _raw;
    await db.query(`insert into public.research_s4_candidates(user_id,id,source_version_id,external_candidate_id,payload_hash,imported,created_at)
      values($1,$2,$3,$4,$5,$6,$7)`,[actor.userId,id,version.id,prepared.candidateId,prepared.payloadHash,canonicalize({...imported,receivedAt,occurrence}),receivedAt]);
    await addRecord(db,actor,id,'InputSnapshot',{ purpose:'candidate_import',source_refs:[ref],source_version_id:version.id,
      source_document_id:source.id,payload_hash:prepared.payloadHash,received_at:receivedAt,input_cutoff_at:receivedAt,
      wiki_reference:prepared.wiki,rights_policy_ref:prepared.rights.policy_id,claim_refs:[],history_completeness:'unknown' });
    return { id,duplicate:false };
  });
}
