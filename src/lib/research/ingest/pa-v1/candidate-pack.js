import Ajv from 'ajv';
import { randomUUID } from 'node:crypto';
import schema from './candidate-pack.schema.json' with {type:'json'};
import {canonicalize,parseStrict,digest,sha256,fail} from './json.js';
import {safePath,verifySourcePack,MAX_PACK_BYTES,MAX_FILE_BYTES,MAX_FILES} from './pack.js';
const ajv=new Ajv({strict:true});ajv.addFormat('utc-rfc3339',s=>Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,19)===s.slice(0,19));ajv.addSchema(schema);
const manifestCheck=ajv.compile({$ref:schema.$id+'#/$defs/CandidateManifest'}),candidateCheck=ajv.compile({$ref:schema.$id+'#/$defs/ResearchCandidate'});
export const CANDIDATE_CONTRACT_DIGEST=digest(schema);
export function verifyCandidatePack(files,options) {
  if(Object.keys(files).length>MAX_FILES) fail('input_limit');
  let total=0;for(const [p,b] of Object.entries(files)){safePath(p);total+=Buffer.byteLength(b);if(Buffer.byteLength(b)>MAX_FILE_BYTES||total>MAX_PACK_BYTES)fail('input_limit');}
  const manifest=parseStrict(files['manifest.json']||'null');
  if(!manifestCheck(manifest)||manifest.contract_digest!==CANDIDATE_CONTRACT_DIGEST)fail('invalid_schema');
  if(!['baseline','fixture'].includes(manifest.extensions?.['pa.evaluation_mode']))fail('invalid_schema');
  if(manifest.extensions['pa.evaluation_mode']==='fixture' && options.allowFixture!==true)fail('fixture_not_operational');
  if(digest(manifest.payload_manifest)!==manifest.payload_digest)fail('hash_mismatch');
  const listed=new Set();
  for(const e of manifest.payload_manifest){safePath(e.relative_path);const b=files[e.relative_path];if(e.relative_path==='manifest.json'||listed.has(e.relative_path)||!b||Buffer.byteLength(b)!==e.size_bytes||sha256(b)!==e.sha256)fail('hash_mismatch');listed.add(e.relative_path);}
  if(listed.size+1!==Object.keys(files).length||!listed.has('candidate.json'))fail('invalid_schema');
  const candidate=parseStrict(files['candidate.json']);if(!candidateCheck(candidate))fail('invalid_schema');
  const sourceFiles=Object.fromEntries(Object.entries(files).filter(([p])=>p.startsWith('source/')).map(([p,b])=>[p.slice(7),b]));
  const wiki=files['wiki-reference.json']?parseStrict(files['wiki-reference.json']):null;
  if(listed.size!==Object.keys(sourceFiles).length+1+(wiki?1:0))fail('invalid_schema');
  const source=verifySourcePack(sourceFiles,{...options,purpose:'alpha_research_import',recipient:'alpha-local'});
  const ref=parseStrict(sourceFiles['source.json']).source_ref;
  if(wiki && (Object.keys(wiki).sort().join(',')!=='result_payload_digest,revision_id,source_ref' || !/^[0-9a-f]{64}$/.test(wiki.result_payload_digest) || canonicalize(wiki.source_ref)!==canonicalize(ref)))fail('invalid_schema');
  if(canonicalize(manifest.owner_scope)!==canonicalize(options.scope)||candidate.selected_by!==options.scope.user_id||canonicalize(candidate.source_refs)!==canonicalize([ref])||canonicalize(candidate.wiki_revision_refs)!==canonicalize(wiki?[wiki.revision_id]:[])||candidate.claim_refs.length||candidate.thesis_ref!==null||candidate.industry_change_note!==null||canonicalize(candidate.rights_policy_refs)!==canonicalize([options.trustedConfig.rights.policy_id])||canonicalize(candidate.origin_pack_refs)!==canonicalize([parseStrict(sourceFiles['manifest.json']).pack_id])||manifest.export_policy_ref!==options.trustedConfig.grant.grant_id)fail('invalid_schema');
  return {manifest,candidate,source,status:'accepted'};
}
export function buildCandidatePack({sourcePack,reason,userId,companyName,confirmExport,producerCommit,trustedConfig,scope,wikiReference=null,evaluationMode='baseline'}) {
  if(confirmExport!==true||typeof reason!=='string'||!reason.trim()||reason.length>2048)fail('explicit_export_confirmation_required');
  if(companyName!=null&&(typeof companyName!=='string'||companyName.length>200))fail('invalid_schema');
  const record=parseStrict(sourcePack.files['source.json']),now=new Date().toISOString();
  // S4 resolves entities. No company is automatically chosen and no private note is copied.
  const candidate={candidate_id:randomUUID(),selected_by:userId,selected_at:now,reason,source_refs:[record.source_ref],wiki_revision_refs:wikiReference?[wikiReference.revision_id]:[],claim_refs:[],entity_candidates:companyName?.trim()?[{name:companyName.trim(),entity_type:'company',verified:false}]:[],thesis_ref:null,industry_change_note:null,rights_policy_refs:[record.rights.policy_id],origin_pack_refs:[sourcePack.manifest.pack_id]};
  const files=Object.fromEntries(Object.entries(sourcePack.files).map(([p,b])=>['source/'+p,b]));files['candidate.json']=canonicalize(candidate);if(wikiReference)files['wiki-reference.json']=canonicalize(wikiReference);
  const entries=Object.keys(files).sort().map(p=>({relative_path:p,media_type:p.endsWith('.json')?'application/json':'text/plain; charset=utf-8',size_bytes:Buffer.byteLength(files[p]),sha256:sha256(files[p])}));
  const manifest={...sourcePack.manifest,schema_name:'research-candidate-pack',pack_id:randomUUID(),created_at:now,producer_commit:producerCommit,contract_digest:CANDIDATE_CONTRACT_DIGEST,payload_manifest:entries,payload_digest:digest(entries),extensions:{...sourcePack.manifest.extensions,'pa.evaluation_mode':evaluationMode}};
  files['manifest.json']=canonicalize(manifest);verifyCandidatePack(files,{trustedConfig,scope,allowFixture:evaluationMode==='fixture'});return {manifest,files};
}
