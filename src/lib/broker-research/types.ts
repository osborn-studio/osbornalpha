// src/lib/broker-research/types.ts
// Shared contract of the foreign broker research module (plan 2026-11-06 §共享契约; spec §4).
// Every task uses these names verbatim. BrokerResearchDb has three implementations:
// supabaseBrokerResearchDb (db.ts), memoryBrokerResearchDb (memory-db.ts, unit tests),
// pgBrokerResearchDb (pg-db.ts, integration tests).

export type LicenceKind='terminal_subscription'|'direct_from_broker'|'owner_authored'|'other';
export type IntentStatus='open'|'validating'|'validated'|'promoting'|'committed'|'expired'|'abandoned';
export type DocumentStatus='uploaded'|'parsing'|'parsed'|'parse_failed'|'withdrawn';
export type RunKind='parse'|'extract'|'summary'|'translate'|'verify';
export type RunStatus='running'|'succeeded'|'failed';
export type ReportScope='single_issuer'|'multi_issuer'|'sector'|'macro_strategy';
export type ReviewStatus='pending'|'in_review'|'approved'|'rejected';
export type ReportStatus='draft'|'published'|'withdrawn';
export type TargetBasis='candidate'|'effective';
export type FieldName='institution'|'analyst'|'published_date'|'price_as_of_date'|'ticker'|'rating'|'target_price'|'target_currency'|'target_horizon'|'price_at_report'|'price_currency'|'upside_stated'|'wacc'|'terminal_growth'|'terminal_value_share'|'valuation_method'|'sector'|'title';
export type FieldStatus='extracted'|'unverified'|'confirmed'|'corrected'|'rejected'|'absent';
export type ValueUnit='pct'|'ratio'|'months'|'price';
export type SnippetPurpose='rating'|'target'|'thesis'|'risk'|'method'|'other';
export type TextStatus='draft'|'approved'|'rejected';
export type Lang='zh'|'en';
export type NormalizedRating='buy'|'overweight'|'neutral'|'underweight'|'sell'|'not_rated';
export type AccessAction='upload'|'signed_url_issued'|'text_viewed'|'parse_run'|'extract_run'|'summary_run'|'unpublish'|'withdraw'|'purge'|'orphan_cleanup';
export type OutboxKind='claim.register'|'claim.revise'|'claim.retract'|'licence.changed'|'mapping.changed';
export type PurgeStep='pdf'|'artifacts'|'runs'|'fields_text'|'snippets_text'|'summaries'|'quarantine_payload';
export type FieldAction='confirm'|'correct'|'reject'|'absent';

/** Typed value components of an evidence row (spec §4.6, §5.3). */
export interface TypedValue{value_text:string;value_num:string|null;value_currency:string|null;value_unit:ValueUnit|null;value_date:string|null}
/** `corrected` payload: present key with null = explicit clear; missing key = inherit; value_text must be present and non-null. */
export type CorrectedValue={value_text:string}&Partial<Omit<TypedValue,'value_text'>>;

export interface LicenceRow{
 licence_id:string;version:number;source_label:string;licence_kind:LicenceKind;holder:string;terms_summary:string;evidence_path:string|null;
 allows_llm_processing:boolean;allows_public_metadata:boolean;allows_public_snippets:boolean;allows_public_summary:boolean;allows_public_target_price:boolean;
 snippet_max_chars:number;valid_from:string;valid_to:string|null;
 confirmed_by:string|null;confirmed_at:string|null;confirmed_version:number|null;created_at:string;updated_at:string;
}
export type LicenceInput=Pick<LicenceRow,'source_label'|'licence_kind'|'holder'|'terms_summary'|'evidence_path'|'allows_llm_processing'|'allows_public_metadata'|'allows_public_snippets'|'allows_public_summary'|'allows_public_target_price'|'snippet_max_chars'|'valid_from'|'valid_to'>;
export interface SettingsRow{public_enabled:boolean;approved_gold_corpus_hash:string|null;approved_gold_corpus_by:string|null;approved_gold_corpus_at:string|null;updated_by:string|null;updated_at:string}
export interface IntentRow{
 intent_id:string;sha256:string;byte_size:number;licence_id:string;original_filename:string;created_by:string;created_at:string;expires_at:string;
 status:IntentStatus;staging_path:string;document_id:string|null;error_code:string|null;checkpoint_at:string|null;
}
export interface DocumentRow{
 document_id:string;sha256:string;storage_path:string;byte_size:number;page_count:number|null;licence_id:string;
 uploaded_by:string;uploaded_at:string;original_filename:string;current_parse_run_id:string|null;status:DocumentStatus;
 lease_token:string|null;lease_until:string|null;promotion_pending:boolean;last_verified_at:string|null;verify_status:'ok'|'failed'|'error'|null;
 withdrawn_at:string|null;withdrawn_reason:string|null;purged_at:string|null;purge_requested_at:string|null;purge_requested_by:string|null;
}
export interface RunRow{
 run_id:string;document_id:string;kind:RunKind;parse_run_id:string|null;extractor_version:string|null;artifact_path:string|null;artifact_hash:string|null;
 model_id:string|null;registry_hash:string|null;prompt_version:string|null;schema_version:string|null;code_version:string;behavior_digest:string|null;
 licence_version:number;request_path:string|null;response_path:string|null;batch_id:string|null;status:RunStatus;started_at:string;finished_at:string|null;
 detail:Record<string,unknown>;
}
export interface ReportRow{
 report_id:string;document_id:string;revision:number;scope:ReportScope|null;institution_id:string|null;
 title_original:string|null;title_lang:string|null;title_zh:string|null;title_en:string|null;title_run_id:string|null;title_public:string|null;title_public_by:string|null;
 published_date:string|null;price_as_of_date:string|null;report_type:string|null;sector_as_stated:string|null;primary_target_key:string|null;
 effective_hash:string|null;materialized_hash:string|null;rules_input_hash:string|null;summary_input_digest:string|null;
 title_restricted:boolean;evidence_ok:boolean;disclosure_ok:boolean;review_status:ReviewStatus;status:ReportStatus;
 current_publication_id:string|null;supersedes_report_id:string|null;code_version:string;created_at:string;updated_at:string;
}
/** target_key = parseBrokerTicker key (HK without the leading zero: '9988.HK'); security_ticker = universe ticker ('09988.HK'); join universe/issuer tables only on security_ticker/issuer_id.
 * upside_pct is a FRACTION (0.25 = 25 %): upside/1 = round(target_price / price_at_report − 1, 6), 6-decimal text; UI multiplies by 100. */
export interface TargetRow{
 report_id:string;target_key:string;basis:TargetBasis;ticker_as_stated:string;security_ticker:string|null;issuer_id:string|null;
 resolution:Record<string,unknown>;rating_raw:string|null;rating_normalized:NormalizedRating|null;scale_id:string|null;
 target_price:string|null;target_currency:string|null;target_horizon_months:number|null;
 price_at_report:string|null;price_currency:string|null;price_as_of_date:string|null;upside_pct:string|null;upside_formula_version:string|null;input_hash:string;
}
export interface FieldRow extends TypedValue{
 field_id:string;report_id:string;parse_run_id:string|null;run_id:string|null;superseded_by_run_id:string|null;target_key:string|null;
 field:FieldName;occurrence:number;page:number|null;char_start:number|null;char_end:number|null;value_source_text:string|null;
 extractor:string;extractor_confidence:number|null;status:FieldStatus;corrected:CorrectedValue|null;conflict_group:string|null;
 detail:Record<string,unknown>;reviewed_by:string|null;reviewed_at:string|null;created_at:string;
}
/** Candidate rows written by broker_extract_commit (field_id/report_id/timestamps assigned by the DB). */
export type CandidateFieldInput=Pick<FieldRow,'target_key'|'field'|'occurrence'|'value_text'|'value_num'|'value_currency'|'value_unit'|'value_date'|'page'|'char_start'|'char_end'|'value_source_text'|'extractor'|'extractor_confidence'|'conflict_group'|'detail'>&{status:'extracted'|'unverified';resolution?:Record<string,unknown>};
/** Human-added evidence row (broker_field_add). */
export type HumanFieldInput=Pick<FieldRow,'target_key'|'field'|'occurrence'|'page'|'char_start'|'char_end'|'value_source_text'>&TypedValue&{parse_run_id:string;status:'confirmed'|'absent'};
/** draft_reason: why an approved text fell back to draft (licence_version|analyst_disclosure|disclosure_inputs|summary_stale; spec §4.1/§4.9 detail.reason). */
export type DraftReason='licence_version'|'analyst_disclosure'|'disclosure_inputs'|'summary_stale';
export interface SnippetRow{snippet_id:string;report_id:string;target_key:string|null;purpose:SnippetPurpose;parse_run_id:string;page:number;char_start:number;char_end:number;text:string|null;field_id:string|null;status:TextStatus;disclosure_check:DisclosureCheck|null;draft_reason:DraftReason|null;approved_by:string|null;approved_at:string|null;created_by:string;created_at:string}
export interface SummaryRow{summary_id:string;report_id:string;lang:Lang;kind:'independent_summary';run_id:string;input_hash:string;summary_md:string;max_verbatim_overlap:number;numeric_grounding:GroundingResult;disclosure_check:DisclosureCheck;status:TextStatus;draft_reason:DraftReason|null;approved_by:string|null;approved_at:string|null;generated_at:string}
export interface PublicationRow{publication_id:string;report_id:string;revision:number;snapshot:Record<string,unknown>;snapshot_hash:string;licence_version:number;rules_receipt_id:string;eval_receipt_id:string|null;published_at:string;published_by:string;unpublished_at:string|null;unpublish_reason:string|null}
export interface RuleReceiptRow{receipt_id:string;report_id:string;rules_version:string;input_hash:string;results:RuleResult[];code_version:string;created_at:string}
export interface InstitutionRow{institution_id:string;name_en:string;name_zh:string|null;aliases:string[];kind:string|null;rating_disclosure_url:string|null;created_at:string}
export interface RatingScaleRow{scale_id:string;institution_id:string;raw_label:string;normalized:NormalizedRating;source_url:string;valid_from:string;valid_to:string|null;created_by:string;created_at:string;closed_by:string|null;closed_at:string|null}
export interface AnalystRow{analyst_id:string;institution_id:string;display_name:string;name_variants:string[];public_display:boolean;created_at:string}
export interface ReportAnalystRow{report_id:string;analyst_id:string;role:string|null;field_id:string}
export interface AccessLogInput{document_id:string|null;user_id:string;action:AccessAction;detail:Record<string,unknown>}
export interface EvalFieldStats{tp:number;fp:number;fn:number;precision:number|null;recall:number|null}
export interface EvalReceiptRow{
 receipt_id:string;corpus_kind:'gold'|'synthetic';corpus_hash:string;behavior_digest:string;extractor_version:string;model_id:string;registry_hash:string;
 prompt_version:string;schema_version:string;code_version:string;n_docs:number;per_field:Record<string,EvalFieldStats>;absence:{tp:number;fp:number;fn:number};
 precision_min:number|null;recall_min:number|null;passed:boolean;ran_at:string;ran_by:string;
}
export interface OutboxEvent{event_id:string;kind:OutboxKind;payload:Record<string,unknown>;status:'pending'|'delivered'|'failed';attempts:number;last_error:string|null;created_at:string;delivered_at:string|null}
/** Durable bucket-write inventory (broker_storage_writes; P-R5-01..03). path = object path, or a prefix ending in '/' for port-written objects. */
export type StorageWriter='parse'|'extract'|'summary'|'translate'|'eval'|'f3';
export interface StorageWriteRow{write_id:string;document_id:string;path:string;writer:StorageWriter;status:'pending'|'done'|'reconciled'|'abandoned';started_at:string;finished_at:string|null;reconciled_at:string|null;next_attempt_at:string;attempts:number;deleted_at:string|null}
export interface PurgeStepRow{document_id:string;step:PurgeStep;status:'pending'|'done'|'failed';attempts:number;last_error:string|null;at:string}

export interface MaterializeReceipt{effectiveHash:string;materializedHash:string;targets:number;basis:'candidate'|'effective'|'mixed'}
export interface RuleResult{rule:string;passed:boolean;blocking:boolean;target_key:string|null;reason_code:string|null;detail:Record<string,unknown>}
/** db_digest = broker_report_disclosure_digest at approval (stamped by the approval triggers; a supplied value must be current). */
export interface DisclosureCheck{version:string;inputs_hash:string;passed:boolean;db_digest?:string;hits:{kind:'restricted_value:target'|'restricted_name';token:string;target_key?:string;analyst_id?:string}[]}
export interface GroundingAssertion{sentence_idx:number;target_key:string;field:FieldName;value:string;unit:ValueUnit;field_id:string}
export interface GroundingResult{version:string;passed:boolean;assertions:GroundingAssertion[];failures:{sentence_idx:number;reason:string}[]}

/** Error raised by BrokerResearchDb implementations; `code` is the SQL `raise exception` message prefix (e.g. 'publish_blocked', 'published_immutable', 'lease_lost'). */
export class BrokerResearchDbError extends Error{
 constructor(readonly code:string,message?:string,readonly detail?:string){super(message??code);this.name='BrokerResearchDbError';}
}

export interface ReviewQueueOptions{status?:ReviewStatus;limit?:number}
/** issuerId / rating / securityTicker / currency are correlated on ONE target (target_facets); currency = target_currency only with a public target_price, else price_currency only with price_at_report, else null. */
export interface PublicReportFilter{institutionId?:string;issuerId?:string;rating?:NormalizedRating;securityTicker?:string;currency?:string|null;scope?:ReportScope;from?:string;to?:string;hasSummary?:boolean;limit:number;cursor?:{publishedDate:string;reportId:string}}
/** Steps of purgeReportText (the PDF / artifacts / runs steps are storage work, spec §6.5). */
export type PurgeTextStep=Extract<PurgeStep,'fields_text'|'snippets_text'|'summaries'|'quarantine_payload'>;
export type TitleSurface='title_original'|'title_public'|'title_zh'|'title_en';
export interface DisclosureRecheckInput{expected_digest:string;titles:Partial<Record<TitleSurface,DisclosureCheck>>;snippets:Record<string,DisclosureCheck>;summaries:Record<string,DisclosureCheck>}
export type QuarantineResolution='resolved_accept'|'resolved_reject';
/** Open dq_quarantine rows of the report's document, as shown on the review page (payload = values and pages only). */
export interface ReviewQuarantineItem{id:string;reason_code:string;natural_key:string;payload:Record<string,unknown>;created_at:string}
/** Body of ★ GET /api/admin/broker-research/reports/[reportId] (C6 builds it; D5 renders it). */
export interface ReviewPayload{
 report:ReportRow;document:DocumentRow;licence:LicenceRow;fields:FieldRow[];targets:TargetRow[];snippets:SnippetRow[];summaries:SummaryRow[];runs:RunRow[];
 blockers:string[];quarantine:ReviewQuarantineItem[];institutions:InstitutionRow[];analysts:AnalystRow[];reportAnalysts:ReportAnalystRow[];
}

export interface BrokerResearchDb{
 // settings & licences
 getSettings():Promise<SettingsRow>;
 setPublicEnabled(flag:boolean,by:string):Promise<void>;
 setApprovedGoldCorpus(hash:string|null,by:string):Promise<void>;                                   // approved_gold_corpus_hash/by/at (owner action, spec §4.1)
 listLicences():Promise<LicenceRow[]>;
 getLicence(licenceId:string):Promise<LicenceRow|null>;
 insertLicence(input:LicenceInput):Promise<LicenceRow>;
 updateLicence(licenceId:string,patch:Partial<LicenceInput>):Promise<LicenceRow>;      // trigger bumps version on material change
 confirmLicence(licenceId:string,by:string,version:number):Promise<'confirmed'|'version_mismatch'>;
 // intents & documents
 insertIntent(row:Omit<IntentRow,'created_at'|'checkpoint_at'|'error_code'>):Promise<void>;
 getIntent(intentId:string):Promise<IntentRow|null>;
 transitionIntent(intentId:string,from:IntentStatus,to:IntentStatus,patch?:Partial<Pick<IntentRow,'document_id'|'error_code'>>):Promise<boolean>;   // CAS; sets checkpoint_at
 findDocumentBySha(sha256:string):Promise<DocumentRow|null>;
 getDocument(documentId:string):Promise<DocumentRow|null>;
 insertDocument(row:Pick<DocumentRow,'document_id'|'sha256'|'storage_path'|'byte_size'|'licence_id'|'uploaded_by'|'original_filename'>):Promise<'inserted'|'duplicate'>;  // status='uploaded', promotion_pending=true
 withdrawWithIntent(documentId:string,reason:string,purge:boolean,by:string):Promise<void>; // atomic withdrawal + optional durable intent, before lease/steps
 updateDocument(documentId:string,patch:Partial<Pick<DocumentRow,'promotion_pending'|'status'|'withdrawn_at'|'withdrawn_reason'|'purged_at'|'purge_requested_at'|'purge_requested_by'|'page_count'|'last_verified_at'|'verify_status'>>):Promise<void>;
 claimLease(documentId:string,token:string,ttlSeconds:number):Promise<boolean>;                         // CAS
 renewLease(documentId:string,token:string,ttlSeconds:number):Promise<'ok'|'lease_lost'|'document_withdrawn'>;   // rpc broker_document_renew_lease: fenced re-check + TTL refresh before a long holder's bucket write (P-R3-04)
 fencedUpdateDocument(documentId:string,token:string,patch:Partial<Pick<DocumentRow,'status'|'current_parse_run_id'|'page_count'>>&{releaseLease?:boolean}):Promise<'ok'|'lease_lost'>;
 // runs
 insertRun(row:Omit<RunRow,'started_at'|'finished_at'|'status'|'detail'>&{detail?:Record<string,unknown>}):Promise<void>;
 finishRun(runId:string,token:string,patch:Pick<RunRow,'status'>&Partial<Pick<RunRow,'extractor_version'|'artifact_path'|'artifact_hash'|'request_path'|'response_path'|'detail'>>):Promise<'ok'|'lease_lost'>;   // rpc broker_run_finish; extractor_version only while null (parse runs learn it from F3)
 getRun(runId:string):Promise<RunRow|null>;
 listRuns(documentId:string):Promise<RunRow[]>;
 // reports & evidence
 ensureReport(documentId:string,codeVersion:string):Promise<ReportRow>;
 getReport(reportId:string):Promise<ReportRow|null>;
 reportByDocument(documentId:string):Promise<ReportRow|null>;
 listReports(opts:{institutionId:string}):Promise<ReportRow[]>;                                    // every status; R7 peers
 updateReportDraft(reportId:string,patch:Partial<Pick<ReportRow,'scope'|'institution_id'|'report_type'|'primary_target_key'|'supersedes_report_id'|'title_public'|'title_public_by'|'title_zh'|'title_en'|'title_run_id'|'review_status'|'disclosure_ok'|'evidence_ok'>>):Promise<void>;
 setReportFlags(reportId:string,flags:{evidence_ok?:boolean;disclosure_ok?:boolean}):Promise<void>;   // draft or published (reports_guard k_live); verify cron, restore
 extractCommit(documentId:string,leaseToken:string,runId:string,rows:CandidateFieldInput[]):Promise<MaterializeReceipt>;   // rpc broker_extract_commit
 fieldReview(fieldId:string,action:FieldAction,payload:Record<string,unknown>,by:string):Promise<MaterializeReceipt>;    // rpc broker_field_review; payload snake_case: confirm {page?,char_start?,char_end?,value_source_text?,detail?} · correct {value_text,value_num?,value_currency?,value_unit?,value_date?,page?,char_start?,char_end?,value_source_text?,detail?} · reject {detail?} · absent {page?,detail?}; payload.detail (object) is merged into the row's detail (e.g. {framed:true})
 insertHumanField(reportId:string,row:HumanFieldInput,by:string):Promise<{fieldId:string;receipt:MaterializeReceipt}>;  // rpc broker_field_add
 upsertTargetOverride(row:{report_id:string;target_key:string;security_ticker:string;issuer_id:string|null;set_by:string;note:string|null}):Promise<MaterializeReceipt>;  // rpc broker_target_override
 materialize(reportId:string):Promise<MaterializeReceipt>;                                                                // rpc broker_report_materialize
 listFields(reportId:string,opts?:{includeSuperseded?:boolean}):Promise<FieldRow[]>;
 listTargets(reportId:string):Promise<TargetRow[]>;
 bindAnalyst(row:ReportAnalystRow):Promise<void>;
 listReportAnalysts(reportId:string):Promise<ReportAnalystRow[]>;
 insertRuleReceipt(row:Omit<RuleReceiptRow,'receipt_id'|'created_at'>):Promise<string>;
 // snippets & summaries
 insertSnippet(row:Omit<SnippetRow,'snippet_id'|'created_at'|'approved_by'|'approved_at'|'status'|'draft_reason'>&{status?:'draft'}):Promise<string>;
 setSnippetStatus(snippetId:string,patch:{status:TextStatus;disclosure_check?:DisclosureCheck;approved_by?:string|null}):Promise<void>;
 getSnippet(snippetId:string):Promise<SnippetRow|null>;
 listSnippets(reportId:string):Promise<SnippetRow[]>;
 /** rpc broker_summary_commit: lease fence + insert (status draft|rejected) + finish the run succeeded, one transaction; lost lease → BrokerResearchDbError('lease_lost'), nothing written (P-R1-09). */
 summaryCommit(documentId:string,token:string,runId:string,row:Omit<SummaryRow,'summary_id'|'approved_by'|'approved_at'|'generated_at'|'draft_reason'|'run_id'|'kind'>):Promise<string>;
 /** rpc broker_title_commit: lease fence + title_zh/title_en/title_run_id on the draft report + finish the run, one transaction. */
 titleCommit(documentId:string,token:string,runId:string,titles:{title_zh:string|null;title_en:string|null}):Promise<'ok'>;
 /** rpc broker_extract_set_scope: under the lease, scope := the merged scope if the draft has none, then materialize (P-R2-04). */
 extractSetScope(documentId:string,token:string,runId:string,scope:ReportScope):Promise<MaterializeReceipt>;
 /** rpc broker_extract_finalize: under the lease, finish the extract run succeeded (detail merged) and release the lease, one transaction. */
 extractFinalize(documentId:string,token:string,runId:string,detail:Record<string,unknown>):Promise<'ok'>;
 insertSummary(row:Omit<SummaryRow,'summary_id'|'approved_by'|'approved_at'|'generated_at'|'draft_reason'>):Promise<string>;
 setSummaryStatus(summaryId:string,patch:{status:TextStatus;disclosure_check?:DisclosureCheck;approved_by?:string|null}):Promise<void>;
 getSummary(summaryId:string):Promise<SummaryRow|null>;
 listSummaries(reportId:string):Promise<SummaryRow[]>;
 // publish
 publishBlockers(reportId:string):Promise<string[]>;
 disclosureDigest(reportId:string):Promise<string>;
 /** rpc broker_report_disclosure_recheck (spec §4.11 重跑规则; P-R1-08): verifies expected_digest is current, applies the title policy, checks APPROVED snippets/summaries only, restores disclosure_ok=true; failures change nothing. */
 disclosureRecheck(reportId:string,by:string,checks:DisclosureRecheckInput):Promise<{restored:boolean;failures:string[]}>;                                               // rpc broker_report_disclosure_digest (P-R1-04)
 publish(reportId:string,by:string):Promise<{publicationId:string}>;
 unpublish(reportId:string,by:string,reason:string):Promise<void>;
 getPublication(publicationId:string):Promise<PublicationRow|null>;
 // entities
 upsertInstitution(row:Omit<InstitutionRow,'institution_id'|'created_at'>&{institution_id?:string}):Promise<string>;
 listInstitutions():Promise<InstitutionRow[]>;
 insertRatingScale(row:Omit<RatingScaleRow,'scale_id'|'created_at'|'closed_by'|'closed_at'|'valid_to'>):Promise<string>;
 closeRatingScale(scaleId:string,validTo:string,by:string):Promise<void>;
 listRatingScales(institutionId:string):Promise<RatingScaleRow[]>;
 upsertAnalyst(row:Omit<AnalystRow,'analyst_id'|'created_at'>&{analyst_id?:string}):Promise<string>;
 listAnalysts(institutionId:string):Promise<AnalystRow[]>;
 // logs, receipts, outbox, purge
 reviewQueue(opts:ReviewQueueOptions):Promise<ReportRow[]>;
 logAccess(row:AccessLogInput):Promise<void>;
 listAccessLog(opts:{documentId?:string;limit:number}):Promise<(AccessLogInput&{id:string;created_at:string})[]>;
 insertEvalReceipt(row:Omit<EvalReceiptRow,'receipt_id'|'ran_at'>):Promise<string>;
 latestEvalReceipt(behaviorDigest:string):Promise<EvalReceiptRow|null>;
 takePendingOutbox(limit:number):Promise<OutboxEvent[]>;
 markOutbox(eventId:string,outcome:{delivered:true}|{delivered:false;error:string}):Promise<void>;   // attempts+1; ≥10 failures → 'failed'
 upsertPurgeStep(documentId:string,step:PurgeStep,outcome:{ok:true}|{ok:false;error:string}):Promise<void>;
 purgeSteps(documentId:string):Promise<PurgeStepRow[]>;
 purgeReportText(reportId:string,step:PurgeTextStep):Promise<number>;   // report must be withdrawn (else report_not_withdrawn); fields_text: value_source_text=null+status rejected · snippets_text: text=null+status rejected · summaries: status rejected (O11: text kept) · quarantine_payload: payload={} on the document's broker_research items; returns rows changed
 // quarantine hook (rpc broker_quarantine_resolve; spec §7.3)
 quarantineResolve(id:string,status:QuarantineResolution,by:string,payload:Record<string,unknown>):Promise<'resolved'|'not_found'|'already_resolved'>;
 // verify cron (spec §8.3): documents of published reports, last_verified_at asc, never-verified first
 verifyCandidates(limit:number):Promise<DocumentRow[]>;
 // bucket-write inventory (P-R5-01..03): registered BEFORE bytes are sent; started_at = server now()
 registerWrite(row:{document_id:string;path:string;writer:StorageWriter}):Promise<string>;               // write_id
 abandonWrite(writeId:string):Promise<void>; // pending → abandoned only with worker proof no bytes dispatched; finished_at stays null
 finishWrite(writeId:string):Promise<void>;                                                              // pending → done (finished_at = now); other states untouched
 writesFor(documentId:string):Promise<StorageWriteRow[]>;                                                 // every row of the document (purge deletes every path)
 pendingWritesFor(documentId:string):Promise<StorageWriteRow[]>;                                          // status pending, started_at asc
 /** Purge intent only, status <> reconciled, next_attempt_at <= now; ordered next_attempt_at, write_id. No age cutoff. */
 unreconciledWrites(limit:number):Promise<StorageWriteRow[]>;
 retryWrite(writeId:string,nextAttemptAt:string,attempts:number):Promise<void>;
 markReconciled(writeId:string,deletedAt:string):Promise<void>;                                                           // only done with finished_at <= deletion-completion timestamp; pending remains eligible
 // public (anon client, views only)
 publicReports(filter:PublicReportFilter):Promise<PublicReportBundle[]>;
 spreadReports(filter:{issuerId:string;securityTicker:string;currency:string|null;from:string}):Promise<PublicReportBundle[]>;
 publicReport(reportId:string):Promise<PublicReportDetail|null>;
 publicInstitutions():Promise<Record<string,unknown>[]>;                                          // + report_count, last_published_date, last_available_at
 publicAnalysts(opts:{institutionId:string;limit:number}):Promise<Record<string,unknown>[]>;        // distinct public analysts of the institution: {analyst_id,display_name,institution_id,report_count}
 ratingHistory(opts:{securityTicker:string;institutionId?:string;currency?:string;limit:number}):Promise<Record<string,unknown>[]>;
}
/** Rows read from the public views (column names as in spec §4.11). */
export interface PublicReportBundle{report:Record<string,unknown>;targets:Record<string,unknown>[];hasSummary:{zh:boolean;en:boolean};snippetCount:number;institution:Record<string,unknown>|null}
export interface PublicReportDetail extends PublicReportBundle{citations:Record<string,unknown>[];snippets:Record<string,unknown>[];summaries:Record<string,unknown>[];analysts:Record<string,unknown>[]}

// BrokerDeps / CoreDeps (the injected service dependencies) live in ./deps.ts (C1 creates CoreDeps; C4 adds the
// ports and BrokerDeps), so this file imports nothing and typechecks on its own at A4.
