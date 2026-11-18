// Topic plan T6.2 / spec §4.4: canonical snapshots from the public projection only.
import {canonicalJson,sha256Hex} from '@/lib/evidence/hash';
import {CONTRACT_VERSION,refHash,type EvidenceRef} from '@/lib/evidence/ref';
import {RESOLVE_STATES,type Resolved} from '@/lib/evidence/resolve';
import type {AssembleInput} from './assemble';
import type {DraftEvidence,EvidenceCounts,EvidenceRowInput,TopicSnapshot} from './types';
export const COUNT_ORDER=['ok','withheld','missing','not_served','retracted','unsupported'] as const;
export function countsOf(resolved:readonly Resolved[]):EvidenceCounts{
 const counts=Object.fromEntries(RESOLVE_STATES.map(state=>[state,0])) as EvidenceCounts;
 for(const r of resolved)counts[r.state]++;return counts;
}
export function buildSnapshot(i:AssembleInput,ordered:readonly (DraftEvidence&{ref:EvidenceRef})[],publicResolved:readonly Resolved[],resolverVersions:Record<string,string>):
 {snapshot:TopicSnapshot;snapshotText:string;snapshotHash:string;evidence:EvidenceRowInput[]}{
 const freshness:TopicSnapshot['freshness_at_publication']={},rank={fresh:0,unknown:1,stale:2};
 const resolved=publicResolved.map(r=>{const {admin_only:unused,...rest}=r;void unused;return rest;});
 for(const r of resolved)if(r.freshness){
  const {dataset,status}=r.freshness,previous=freshness[dataset];
  if(previous===undefined||rank[status]>rank[previous])freshness[dataset]=status;
 }
 const snapshot:TopicSnapshot={topic:{...i.topic,title:i.draft.title,dek:i.draft.dek},sections:i.draft.sections,
  evidence:ordered.map((e,n)=>({...e,ref_hash:refHash(e.ref),resolved:resolved[n]})),
  expected_slots:i.draft.expected_slots,entries:i.draft.entries,summary:i.summary,counts:countsOf(resolved),
  freshness_at_publication:freshness,contract_version:CONTRACT_VERSION,resolver_versions:resolverVersions};
 const snapshotText=canonicalJson(snapshot);
 const evidence=snapshot.evidence.map(e=>({ordinal:e.ordinal,kind:e.ref.kind,ref:e.ref,ref_hash:e.ref_hash,as_of:e.ref.as_of,
  state:e.resolved.state,digest:e.resolved.state==='ok'?e.resolved.digest:null,section_key:e.section_key}));
 return {snapshot,snapshotText,snapshotHash:sha256Hex(snapshotText),evidence};
}
