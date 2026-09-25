/** Fresh random-byte test packs; never mutate or promote the frozen producer golden. */
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {buildSourcePack} from '../../src/lib/research/ingest/pa-v1/pack.js';
import {buildCandidatePack} from '../../src/lib/research/ingest/pa-v1/candidate-pack.js';
import {digest,sha256} from '../../src/lib/research/ingest/pa-v1/json.js';
export function testPack(userId:string,options:{raw?:string;sourceId?:string;versionId?:string;scope?:any;config?:any;version?:any;companyName?:string}={}) {
  const sourceId=options.sourceId||randomUUID(),versionId=options.versionId||randomUUID(),raw=options.raw||randomUUID();
  const scope=options.scope||{user_id:randomUUID(),workspace_id:null};
  const now=new Date(Date.now()-1000).toISOString(),until=new Date(Date.now()+86400000).toISOString();
  const config=options.config||{
    rights:{policy_id:randomUUID(),version:'1.0',owner_scope:scope,classification:'public',external_processing:'deny',allowed_processors:[],redistribution:'allowed',basis_ref:'fixture:generated-s4-integration',approved_by:scope.user_id,approved_at:now,valid_until:until},
    grant:{grant_id:randomUUID(),scope,input_selector:{source_ids:[sourceId],domains:[]},purpose:'alpha_research_import',recipient_system:'alpha-local',valid_until:until,basis_ref:'fixture:generated-s4-integration',confirmed_by:scope.user_id,confirmed_at:now},
  };
  const version=options.version||{source_id:sourceId,version_id:versionId,supersedes_version_id:null,raw_sha256:sha256(raw),normalized_text_sha256:sha256(raw),normalization_version:'pa-text/1.0',extraction_status:'available',snapshot_ref:'snapshots/raw.txt',media_type:'text/plain; charset=utf-8',canonical_uri:'https://example.test/'+sourceId,published_at:null,event_time:null,public_available_at:null,public_time_basis:null,first_observed_at:now,ingested_at:now,rights_policy_ref:config.rights.policy_id,raw_basis:'captured_text_utf8',time_unknown_reason:'Synthetic test; no publication receipt.'};
  const ref={owner_system:'pa',owner_scope:scope,source_id:sourceId,version_id:versionId,raw_sha256:sha256(raw)};
  const record={source_ref:ref,source_version:version,rights:config.rights,grant:config.grant,archived_at:null,withdrawn_at:null,history_completeness:'unknown'};
  const sourcePack=buildSourcePack({record,rawText:raw,producerCommit:'0'.repeat(40),trustedConfig:config,scope,purpose:'alpha_research_import',recipient:'alpha-local'});
  const pack=buildCandidatePack({sourcePack,reason:'Generated SQL test only',userId:scope.user_id,companyName:options.companyName||null,confirmExport:true,producerCommit:'0'.repeat(40),trustedConfig:config,scope});
  return {pack,raw,sourceId,versionId,scope,config,version,binding:{localUserId:userId,upstreamScope:scope,trustedConfig:config,synthetic:true,revoked:false,approvedPayloadHash:pack.manifest.payload_digest,approvedManifestHash:digest(pack.manifest)}};
}
