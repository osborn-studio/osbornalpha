// Topic research contracts (spec §4, §5).
import type {EvidenceRef,EvidenceKind} from '@/lib/evidence/ref';
import type {Resolved,ResolveState} from '@/lib/evidence/resolve';
export type Bilingual={zh:string;en:string};
export const CATEGORIES=['macro','industry','company','cross_market','method'] as const;
export type Category=typeof CATEGORIES[number];
export const UNPUBLISH_REASONS=['error','licence','owner_request','privacy'] as const;
export type UnpublishReason=typeof UNPUBLISH_REASONS[number];
export const SLOT_REASONS=['industry_not_published','hk_not_served','foreign_research_not_wired','cn_values_withheld','source_pending'] as const;
export type SlotReason=typeof SLOT_REASONS[number];
export type SectionItem={ordinal:number}|{expected_slot:string};
export interface DraftSection{key:string;title:Bilingual;note:Bilingual|null;items:SectionItem[]}
/** as_of may be left out in a draft; assemble() fills it with the cutoff (spec §5.1). */
export type DraftRef=Omit<EvidenceRef,'as_of'>&{as_of?:string};
/** ordinal is assigned once (max+1) and never renumbered, so {{ev:n}} slots survive removals. */
export interface DraftEvidence{ordinal:number;ref:DraftRef;section_key:string}
export interface ExpectedSlot{key:string;kind:EvidenceKind;label:Bilingual;reason_code:SlotReason}
export type DraftEntry=
 |{key:string;entry_type:'owner_note';body:Bilingual}
 |{key:string;entry_type:'licensed_excerpt';licence_id:string;fragments:{text:string;attribution:string;date:string;url:string}[]};
export interface DraftBody{title:Bilingual;dek:Bilingual;sections:DraftSection[];evidence:DraftEvidence[];expected_slots:ExpectedSlot[];
 entries:DraftEntry[];blocks_provenance:Record<string,'owner'|'from_thesis'|'reviewed'>}
export type EvidenceCounts=Record<ResolveState,number>;
export interface SnapshotEvidence{ordinal:number;ref:EvidenceRef;ref_hash:string;resolved:Resolved;section_key:string}
export interface RenderedSummary{facts:{fact_id:string;text:string;refs:number[]}[];points:{text:string;fact_ids:string[];refs:number[]}[];
 counterpoints:{text:string;fact_ids:string[];refs:number[]}[];incomparable:{a:number;b:number}[];prompt_version:string;validator_version:string;model:string;provider:string}
export interface TopicSnapshot{topic:{slug:string;category:Category;title:Bilingual;dek:Bilingual};sections:DraftSection[];evidence:SnapshotEvidence[];
 expected_slots:ExpectedSlot[];entries:DraftEntry[];summary:RenderedSummary|null;counts:EvidenceCounts;
 freshness_at_publication:Record<string,'fresh'|'stale'|'unknown'>;contract_version:'evidence-ref/1';resolver_versions:Record<string,string>}
export const DRIFTS=['unchanged','revised','newer_period','retracted','now_withheld','unverifiable'] as const;
export type Drift=typeof DRIFTS[number];
export interface DriftRow{version_id:string;ordinal:number;drift:Drift;current_identity:{value_text:string|null;unit:string|null;period:string|null;available_at:string|null}|null}
export interface EvidenceRowInput{ordinal:number;kind:EvidenceKind;ref:EvidenceRef;ref_hash:string;as_of:string;state:ResolveState;digest:string|null;section_key:string}
export interface DisclosureCheck{id:number;key:string;result:'pass'|'warn'|'block';codes:string[];detail:Record<string,unknown>}
import type {PublicDriftRow,PublicTopicRow,PublicVersionRow,TopicAuditRow,TopicDisclosureReceiptRow,TopicDraftRow,TopicEvidenceDriftRow,TopicPromotionRow,TopicRow,TopicSettingsRow,TopicSummaryRow,TopicSummaryRunRow,TopicVersionEvidenceRow,TopicVersionRow} from './database-types';
export class TopicsDbError extends Error{constructor(readonly code:string){super(code);this.name='TopicsDbError';}}
export interface SummarySubject{topicId:string;draftHash:string;locale:'zh'|'en';manifest:Record<string,unknown>;promptVersion:string;validatorVersion:string}
export type SummaryResult=TopicSummaryRunRow&{summary:TopicSummaryRow|null};
export type SummaryClaim=SummaryResult&{replayed:boolean};
export interface TopicsDb{
 // service role (admin routes, crons)
 createTopic(i:{slug:string;category:Category;body:DraftBody;actor:string}):Promise<{topic_id:string;revision:number;draft_hash:string}>;
 topicById(topicId:string):Promise<TopicRow|null>;
 adminTopics():Promise<(TopicRow&{title:Bilingual;draft_revision:number;current_version_no:number|null;revised_count:number;promoted:boolean})[]>;
 draftOf(topicId:string):Promise<TopicDraftRow|null>;
 saveDraft(i:{topicId:string;expectedRevision:number;body:DraftBody;actor:string}):Promise<{revision:number;draft_hash:string}>;
 promotionOf(topicId:string):Promise<TopicPromotionRow|null>;
 recordPromotion(i:{topicId:string;sourceId:string;sourceContentHash:string;copied:TopicPromotionRow['copied'];stripped:TopicPromotionRow['stripped'];actor:string}):Promise<string>;
 recordDisclosure(i:{topicId:string;draftHash:string;checks:DisclosureCheck[];passed:boolean;codeVersion:string;actor:string}):Promise<string>;
 latestSummaryRun(topicId:string,locale:'zh'|'en'):Promise<Pick<TopicSummaryRunRow,'run_id'|'draft_hash'|'state'|'validation'>|null>;
 summaryById(topicId:string,summaryId:string):Promise<TopicSummaryRow|null>;
 summaryRunByRequest(actor:string,requestId:string):Promise<Pick<TopicSummaryRunRow,'payload_hash'>|null>;
 claimSummary(i:SummarySubject&{actor:string;requestId:string;payloadHash:string}):Promise<SummaryClaim>;
 recordSummaryCompletion(i:{runId:string;rawOutput:unknown;finalizePayload:Record<string,unknown>}):Promise<void>;
 finishSummary(i:{runId:string;state:'accepted'|'rejected'|'failed';provider:string;model:string;rawOutput:unknown;validation:unknown;rendered:RenderedSummary|null;finalizePayload:Record<string,unknown>}):Promise<SummaryResult>;
 markSummaryFinalized(runId:string):Promise<void>;
 expireSummaries(actor:string):Promise<number>;
 approveSummary(i:{summaryId:string;decision:'approve'|'discard';actor:string}):Promise<void>;
 summariesOf(topicId:string,draftHash:string):Promise<TopicSummaryRow[]>;
 approvedSummary(topicId:string,draftHash:string,locale:'zh'|'en'):Promise<TopicSummaryRow|null>;
 receiptById(receiptId:string):Promise<TopicDisclosureReceiptRow|null>;
 latestReceipt(topicId:string,draftHash:string):Promise<TopicDisclosureReceiptRow|null>;
 publish(i:{topicId:string;expectedDraftHash:string;snapshotText:string;evidence:EvidenceRowInput[];summaryId:string|null;receiptId:string;cutoff:string;actor:string}):Promise<{version_id:string;version_no:number}>;
 unpublish(i:{topicId:string;reason:UnpublishReason;note:string|null;actor:string}):Promise<{current_version_no:number|null}>;
 retire(i:{topicId:string;reason:UnpublishReason;note:string|null;actor:string}):Promise<void>;
 settings():Promise<TopicSettingsRow>;
 setPublicEnabled(i:{publicEnabled:boolean;summaryPublicEnabled:boolean;summaryProviderNote:string|null;licenceConfirmations:Record<string,{terms_url:string;confirmed_on:string}>;actor:string}):Promise<TopicSettingsRow>;
 versionById(versionId:string):Promise<TopicVersionRow|null>;
 versionsOfTopic(topicId:string):Promise<TopicVersionRow[]>;
 liveVersionRefs():Promise<Pick<TopicVersionRow,'topic_id'|'version_id'|'version_no'>[]>;
 liveEvidence(after:{version_id:string;ordinal:number}|null,limit:number):Promise<TopicVersionEvidenceRow[]>;
 upsertDrift(rows:DriftRow[],checkedAt:string,complete:boolean,cursor:{version_id:string;ordinal:number}|null):Promise<number>;
 recordEvent(i:{topicId:string;actor:string;action:'preview'|'replay_verify';detail:Record<string,unknown>}):Promise<void>;
 driftOf(versionId:string):Promise<TopicEvidenceDriftRow[]>;
 auditOf(topicId:string):Promise<TopicAuditRow[]>;
 // session client (public views)
 publicOpen():Promise<boolean>;                    // true only when topic_settings.public_enabled
 publicTopics():Promise<PublicTopicRow[]>;
 publicTopicBySlug(slug:string):Promise<PublicTopicRow|null>;
 publicVersions(topicId:string):Promise<PublicVersionRow[]>;
 publicDrift(versionId:string):Promise<PublicDriftRow[]>;
}
