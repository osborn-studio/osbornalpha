// Topic plan T6.8: client-safe publication workflow and display order.
import type {TopicAuditRow,TopicEvidenceDriftRow} from '@/lib/topics/database-types';
import type {DisclosureCheck,EvidenceCounts} from '@/lib/topics/types';
import type {loadVersionRows,previewDraft} from '@/lib/topics/publish';
export type VersionRow=Awaited<ReturnType<typeof loadVersionRows>>[number];
export type Preview=Awaited<ReturnType<typeof previewDraft>>;
export type Receipt={passed:boolean;draft_hash:string;checks:DisclosureCheck[]};
export const COUNT_ORDER=['ok','withheld','missing','not_served','retracted','unsupported'] as const;
export function publishModel(i:{receipt:Receipt|null;draftHash:string;versions:{version_no:number;status:string}[];preview:{counts:EvidenceCounts;evidence:number;expected_slots:number}|null;retired:boolean}){
 const totals={block:0,warn:0,pass:0};
 for(const check of i.receipt?.checks??[])totals[check.result]++;
 const reason=i.retired?'retired':!i.receipt?'no_receipt':i.receipt.draft_hash!==i.draftHash?'stale_receipt':!i.receipt.passed||totals.block?'blocked':'ok';
 const nextVersion=i.versions.reduce((max,row)=>Math.max(max,row.version_no),0)+1;
 const preview=i.preview,dialog=preview?{evidence:preview.evidence,slots:preview.expected_slots,summary:false as const,
  distribution:COUNT_ORDER.filter(state=>preview.counts[state]>0).map(state=>({state,n:preview.counts[state]}))}:null;
 return {canPublish:reason==='ok',reason,remaining:totals.block,totals,nextVersion,dialog} as const;
}
export const retireEnabled=(input:string,slug:string):boolean=>input===slug;
export const versionStatusKey=(status:VersionRow['status']):string=>`versionStatus.${status}`;

export function driftDetail(row:TopicEvidenceDriftRow){
 const identity=row.current_identity;
 return {ordinal:row.ordinal,drift:row.drift,checked_at:row.checked_at,
  period:row.drift==='revised'||row.drift==='newer_period'?identity?.period??null:null,
  value:row.drift==='revised'?identity?.value_text??null:null,unit:row.drift==='revised'?identity?.unit??null:null};
}

export function lastVerification(audit:readonly TopicAuditRow[],versionNo:number){
 const last=audit.findLast(e=>e.action==='replay_verify'&&e.detail.version_no===versionNo);
 return last&&Array.isArray(last.detail.mismatched)?{time:last.created_at,mismatches:last.detail.mismatched.length}:null;
}
