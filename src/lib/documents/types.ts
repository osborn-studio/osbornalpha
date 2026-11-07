// src/lib/documents/types.ts
// Shared contract of the document pipeline (plan F3 §共享契约, spec §4). Every task uses these
// names verbatim. DocumentsDb has three implementations: supabaseDocumentsDb (db.ts, rpc + read-only
// from()), memoryDocumentsDb (memory-documents-db.ts, unit tests), pgDocumentsDb (pg-documents-db.ts,
// integration tests). Row types mirror the SQL columns (snake_case); timestamps are ISO strings,
// dates 'YYYY-MM-DD'.
export const EXTRACTOR_VERSION='docs-extract/1.0';
export const TABLE_ALGO_VERSION='tables/1.0';
export const CLASSIFIER_GEN=1;
export const HK_LABEL_GEN=1;
export const HK_RULES_VERSION='hk-facts/1.0';
export const HK_EXTRACTOR_REF=`hk-facts/${HK_LABEL_GEN}/${HK_RULES_VERSION}`;   // 'hk-facts/1/hk-facts/1.0'
export const HK_PUB_GEN=1;
export const MAX_DOC_BYTES=52428800;
export const DOCS_BUCKET='disclosure-docs';
export const PAGE_LIMIT_MAX=1000;

export type DocSource='edgar'|'cninfo'|'hkexnews'|'upload';
export type ListedSource=Exclude<DocSource,'upload'>;
export type DocMarket='US'|'CN'|'HK'|'other';
export type DocClass='annual_report'|'interim_report'|'quarterly_report'|'results_announcement'|'current_report'|'registration'|'proxy'|'ownership'|'other';
export type DocStatus='stored'|'extracted'|'no_text_layer'|'extract_failed';
export type Permission='public'|'licensed'|'private';
export type DocMime='application/pdf'|'text/html'|'application/xhtml+xml'|'application/xml'|'text/xml'|'application/json';
export type FiscalPeriod='FY'|'H1'|'Q1'|'Q3';
export type CandidatesRole='none'|'primary'|'comparison';
export type CandidatesStatus='n/a'|'pending'|'done'|'failed'|'exhausted';
export type CandidateKind='financial_fact'|'table_cell'|'field';
export type ExtractorKind='rule'|'llm';
export type CandidateStatus='candidate'|'confirmed'|'rejected'|'promoted';
export type DecisionKind='human'|'auto';
export type PublicationState='staged'|'published'|'abandoned';
export type CitationCreator='extractor'|'human'|'llm'|'module';
export type CitationRole='value'|'label'|'period'|'unit'|'unit_currency';   // unit_currency: the table currency a 仙 / cents EPS inherits (R3-P1-1)
export type AssetRole='filing_index'|'xbrl_instance'|'exhibit';

export interface Page<T>{rows:T[];nextCursor:string|null}
export interface PageOpts{cursor?:string|null;limit:number}

export interface Acquisition{fetched_at?:string;http_status?:number;content_type?:string|null;content_length?:number|null;etag?:string|null;last_modified?:string|null;user_agent?:string;uploaded_at?:string;filename?:string}
export interface DocumentRow{
 document_id:string;issuer_id:string|null;source:DocSource;market:DocMarket;source_ref:string;source_version:number;
 supersedes_document_id:string|null;observed_replacement:boolean;form_type:string|null;doc_class:DocClass;classifier_gen:number;
 title:string;language:'zh'|'en'|null;source_url:string|null;content_sha256:string;bytes:number;mime:DocMime;storage_path:string;
 acquisition:Acquisition;published_at:string;published_at_precision:'instant'|'date';available_at:string;available_date:string;
 fiscal_year:number|null;fiscal_period:FiscalPeriod|null;period_end:string|null;filing_source_ref:string|null;
 permission:Permission;owner_user_id:string|null;license_ref:string|null;status:DocStatus;current_extraction_id:string|null;
 extract_lease_until:string|null;extract_lease_batch_id:string|null;extract_attempts:number;batch_id:string;code_version:string;created_at:string;
}
/** insert_document_version p_doc / insert_upload_document p_doc: the writer-side fields (document_id, version, supersedes, observed_replacement, status, created_at come from the function). */
export type DocumentInsert=Omit<DocumentRow,'document_id'|'source_version'|'supersedes_document_id'|'observed_replacement'|'status'|'current_extraction_id'|'extract_lease_until'|'extract_lease_batch_id'|'extract_attempts'|'created_at'>;
export interface AssetRow{asset_id:string;document_id:string;role:AssetRole;filename:string;source_url:string;content_sha256:string;bytes:number;mime:string;storage_path:string;acquisition:Acquisition;created_at:string}
export type AssetInsert=Omit<AssetRow,'asset_id'|'document_id'|'created_at'>;
export interface InsertVersionResult{outcome:'inserted'|'versioned'|'duplicate';document_id:string}

export interface ExtractionRow{
 extraction_id:string;document_id:string;extractor_version:string;table_algo_version:string;code_version:string;has_text_layer:boolean;page_count:number;
 pages_json_path:string;pages_json_sha256:string;candidates_role:CandidatesRole;candidates_status:CandidatesStatus;candidates_attempts:number;
 candidates_lease_until:string|null;candidates_lease_batch_id:string|null;batch_id:string;created_at:string;
}
/** finish_document_extract p_extraction (role/status are decided inside the function, spec §7.3). */
export interface ExtractionInsert{extractor_version:string;table_algo_version:string;code_version:string;has_text_layer:boolean;page_count:number;pages_json_path:string;pages_json_sha256:string}
export interface PageRow{extraction_id:string;page_no:number;text:string;text_hash:string;char_count:number;width:number|null;height:number|null;line_count:number;has_tables:boolean}
export type PageInsert=Omit<PageRow,'extraction_id'>;

export interface CitationRow{
 citation_id:string;document_id:string;extraction_id:string;page_no:number;char_start:number;char_end:number;
 bbox:{x0:number;y0:number;x1:number;y1:number}|null;snippet:string;text_hash:string;visibility:'internal'|'public';
 created_by:CitationCreator;created_ref:string;created_at:string;
}
export type CitationInsert=Omit<CitationRow,'citation_id'|'visibility'|'created_at'>;

export interface PeriodEvidence{role:'statement_title'|'column_header';citation_id:string}
/** unit_currency: the table's amount-unit citation, present exactly when the per-share token names no currency (仙 / cents, R2-P1-1); published with its own role 'unit_currency' (R3-P1-1). */
export interface FactCitations{value:string;label:string;unit:string;unit_currency?:string;period:PeriodEvidence[]}
export interface FinancialFactPayload{
 concept:string;statement:'IS'|'BS'|'CF';period_start:string|null;period_end:string;duration:'6M'|'12M'|'INSTANT';
 value:string;presented:string;unit:string;scale:'1'|'0.01'|'1000'|'1000000';sign_flip:boolean;
 period_derivation:{rule:'title_duration'|'title_year_substitution'|'column_date'|'title_instant';title_date:string;column_text:string};
 consolidation:'consolidated';
}
export interface CheckResult{check:string;blocking:boolean;passed:boolean|null;detail?:Record<string,unknown>}   // passed=null ⇒ 'unavailable'/'skipped' (non-blocking only)
export interface InputSnapshot{content_sha256:string;pages_json_sha256:string;page_nos:number[];extractor_version:string;table_algo_version:string;code_version:string;hk_label_gen?:number;hk_rules_version?:string;model_id?:string;prompt_version?:string}
export interface CandidateRow{
 candidate_id:string;document_id:string;extraction_id:string;kind:CandidateKind;extractor_kind:ExtractorKind;extractor_ref:string;natural_key:string;
 citations:FactCitations|Record<string,unknown>;payload:FinancialFactPayload|Record<string,unknown>;fingerprint:string;
 checks:CheckResult[];checks_passed:boolean;status:CandidateStatus;decision_kind:DecisionKind|null;decided_by:string|null;approval_id:string|null;
 decided_at:string|null;inherited_from:string|null;input_snapshot:InputSnapshot;batch_id:string;created_at:string;
}
export type CandidateInsert=Pick<CandidateRow,'kind'|'extractor_kind'|'extractor_ref'|'natural_key'|'citations'|'payload'|'fingerprint'|'input_snapshot'>;
export interface PublicationRow{candidate_id:string;pub_gen:number;run_id:string;fact_id:string;state:PublicationState;created_at:string;updated_at:string}
export interface ApprovalRow{approval_id:string;extractor_ref:string;extractor_version:string;table_algo_version:string;code_version:string;concepts:string[];gold_sha256:string;precision:string;recall:string;report_path:string;approved_by:string;approved_at:string;revoked_at:string|null}
/** Source-ref checkpoint inside one segment pass (codex plan round 1 P2-5): last_ref = the furthest listed item
 *  processed in this pass; settled = refs processed in this pass without a stored row (404, quarantined,
 *  exhausted); attempts = failed attempts per source_ref; seq = strictly increasing per checkpoint (P2-4). */
export interface DocScopeCursor{segment:string|null;last_ref:string|null;settled:string[];attempts:Record<string,number>;seq:number}
export interface DocScopeRow{
 issuer_id:string;source:ListedSource;reasons:string[];priority:number;fetch_key:string;backfill_cursor:DocScopeCursor|Record<string,never>;backfill_done:boolean;
 poll_cursor:DocScopeCursor|Record<string,never>;next_due_at:string;lease_until:string|null;lease_batch_id:string|null;
 last_attempt_at:string|null;last_success_at:string|null;last_status:'success'|'failed'|null;updated_at:string;
}
export interface DocScopeInput{issuer_id:string;reasons:string[];priority:number;fetch_key:string}

export type HumanDecision={kind:'human';decided_by:string;status:'confirmed'|'rejected'|'candidate'};
export type AutoDecision={kind:'auto';approval_id:string};
export interface CandidatesFilter{source?:ListedSource;issuer_id?:string;document_id?:string}

export type DocumentsDbErrorCode='lease_lost'|'not_eligible'|'revision_exists'|'evidence_incomplete'|'approval_revoked'|'not_publishable'|'invalid_citation'|'decided'|'already_staged'|'binding_conflict'|'invalid_expected_rev'|'stale_plan'|'not_hk_item'|'run_pending'|'invalid_chosen'|'item_not_open'|'too_many_approvals'|'not_found'|'invalid_input'|'cursor_regression'|'unknown';
export class DocumentsDbError extends Error{constructor(public code:DocumentsDbErrorCode,message?:string){super(message??code);this.name='DocumentsDbError';}}

export interface DocumentsDb{
 // writes (rpc, one per §4.8 function of migration one)
 /** snapshotAt (F3 review, Task 5): when the sources behind rows were read. A retirement (priority 0 over a stored priority > 0) applies only to a row neither changed nor confirmed active after it; activations and upserts always apply. */
 reconcileScope(source:ListedSource,rows:DocScopeInput[],snapshotAt?:string):Promise<number>;
 claimSyncLease(issuer:string,source:ListedSource,batch:string,ttlSeconds:number):Promise<boolean>;
 renewSyncLease(issuer:string,source:ListedSource,batch:string,ttlSeconds:number):Promise<boolean>;   // F3 review (Task 7): holder-only; true only when this batch holds an unexpired lease; never reacquires
 insertDocumentVersion(issuer:string,source:ListedSource,batch:string,doc:DocumentInsert,assets:AssetInsert[]):Promise<InsertVersionResult>;
 insertUploadDocument(owner:string,doc:DocumentInsert):Promise<InsertVersionResult>;
 advanceCursor(issuer:string,source:ListedSource,batch:string,mode:'backfill'|'poll',cursor:DocScopeCursor|null,done:boolean,reset?:boolean):Promise<void>;   // never backwards unless reset (P2-4): cursor_regression
 releaseSyncLease(issuer:string,source:ListedSource,batch:string,outcome:'success'|'failed',nextDue:string):Promise<void>;
 reclassifyDocument(document:string,patch:Partial<Pick<DocumentRow,'doc_class'|'classifier_gen'|'fiscal_year'|'fiscal_period'|'period_end'|'filing_source_ref'>>,actor:string):Promise<void>;
 claimExtractLease(document:string,batch:string,ttlSeconds:number):Promise<boolean>;
 renewExtractLease(document:string,batch:string,ttlSeconds:number):Promise<boolean>;      // holder only, no attempt counted; false = taken over / moved on (P2-7)
 finishExtract(document:string,batch:string,extraction:ExtractionInsert,pages:PageInsert[]):Promise<string>;
 failExtract(document:string,batch:string,code:string):Promise<void>;
 requestExtract(document:string,actor:string):Promise<void>;
 claimCandidatesLease(extraction:string,batch:string,ttlSeconds:number):Promise<boolean>;
 renewCandidatesLease(extraction:string,batch:string,ttlSeconds:number):Promise<boolean>;  // holder only, no attempt counted (P2-7)
 finishCandidates(extraction:string,batch:string,status:'done'|'failed'):Promise<void>;
 requestCandidatesRegen(filter:CandidatesFilter,actor:string):Promise<number>;
 writeCandidateChecks(extraction:string,batch:string,rows:{candidate_id:string;checks:CheckResult[];checks_passed:boolean}[]):Promise<{written:number;inherited:number}>;
 insertCitation(row:CitationInsert):Promise<string>;
 publishCitations(ids:string[]):Promise<number>;
 insertCandidates(extraction:string,batch:string,rows:CandidateInsert[]):Promise<{inserted:number}>;
 decideCandidate(candidate:string,decision:HumanDecision|AutoDecision):Promise<{status:CandidateStatus}>;
 stageCandidatePublication(candidate:string,pubGen:number,run:string,factId:string):Promise<void>;
 insertApproval(row:Omit<ApprovalRow,'approval_id'|'approved_at'|'revoked_at'>):Promise<string>;
 revokeApproval(approvalId:string):Promise<void>;
 // reads: paged, or bounded with an explicit limit
 documentVersions(source:DocSource,sourceRef:string,page:PageOpts):Promise<Page<DocumentRow>>;
 knownSourceRefs(issuer:string,source:ListedSource,refs:string[]):Promise<Set<string>>;            // refs chunked ≤ 500
 readDocuments(issuer:string,opts:{asOf:string;source?:DocSource;docClass?:DocClass;from?:string;to?:string;allVersions?:boolean}&PageOpts):Promise<Page<DocumentRow>>;
 documentById(id:string):Promise<DocumentRow|null>;
 assetsOf(documentId:string):Promise<AssetRow[]>;                                                  // ≤ 100 (unique per role/filename)
 extractionsOf(documentId:string,page:PageOpts):Promise<Page<ExtractionRow>>;
 extractionById(id:string):Promise<ExtractionRow|null>;
 pagesOf(extractionId:string,pageNos:number[]):Promise<PageRow[]>;                                 // ≤ 100 page numbers
 citationById(id:string):Promise<CitationRow|null>;
 citationsByIds(ids:string[]):Promise<CitationRow[]>;                                              // ≤ 100
 candidatesOf(where:{extractionId:string}|{status:CandidateStatus}|{issuerId:string;status?:CandidateStatus},page:PageOpts):Promise<Page<CandidateRow>>;
 candidateById(id:string):Promise<CandidateRow|null>;
 publicationsOf(where:{candidateIds:string[]}|{runId:string}|{issuerId:string;pubGen:number;state?:PublicationState},page:PageOpts):Promise<Page<PublicationRow>>;
 approvalsFor(extractorRef:string,opts:{limit:number}):Promise<ApprovalRow[]>;                    // > limit rows → DocumentsDbError('too_many_approvals')
 storedDue(limit:number):Promise<DocumentRow[]>;
 candidatesDue(limit:number):Promise<ExtractionRow[]>;
 scopeDue(source:ListedSource,now:string,limit:number):Promise<DocScopeRow[]>;
 scopeRows(source:ListedSource,issuerIds:string[]):Promise<DocScopeRow[]>;
 scopeAll(source:ListedSource):Promise<DocScopeRow[]>;                                            // every row incl. priority 0, issuer_id asc (spec §6.4 retire)
}
export interface ObjectStore{
 put(path:string,bytes:Uint8Array,mime:string):Promise<'created'|'exists'>;
 get(path:string):Promise<Uint8Array>;
 head(path:string):Promise<{bytes:number}|null>;
 signedUrl(path:string,expiresSeconds:number):Promise<string>;
}

// pages.json (spec §7.2); offsets are code points relative to the page text
export interface LayoutItem{text:string;x0:number;x1:number;y:number;h:number;char_start:number;char_end:number}   // one text run; offsets are page code points (C-1)
export interface LayoutLine{index:number;y:number;x0:number;x1:number;text:string;char_start:number;char_end:number;items:LayoutItem[]}   // HTML lines carry one item spanning the line at x=0
export interface LayoutCell{row:number;col:number;text:string;bbox:{x0:number;y0:number;x1:number;y1:number}|null;line_index:number;char_start:number;char_end:number;numeric:boolean}
export interface LayoutTable{header_lines:LayoutLine[];cells:LayoutCell[];row_count:number;col_count:number;col_x0:number[]}
export interface PageLayout{page_no:number;width:number|null;height:number|null;text:string;lines:LayoutLine[];tables:LayoutTable[]}
export interface PagesJson{extractor_version:string;table_algo_version:string;code_version:string;content_sha256:string;has_text_layer:boolean;pages:PageLayout[]}
