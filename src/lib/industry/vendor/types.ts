import type {RunnerReceipt} from '../jobs';
import type {VendorObservation} from '../../vendor/gildata/parse-financials';

export const VENDOR_DATASET_KEYS=['vendor:gildata:industry-financials'] as const;
export const FRESHNESS={memberships:'vendor.gildata.industry.members.sw2021',financials:'vendor.gildata.industry.fin.sw2021'} as const;
export type VendorRunKind=keyof typeof FRESHNESS;
export type Mode='plan'|'dry-run'|'apply';
export type Grid={codes:string[];period_ends?:string[];metrics?:{metric:string;duration:VendorObservation['duration']}[]};
export type RunInput={
 run_id?:string;vendor:string;product:string;kind:VendorRunKind;dataset_key:string;scheme:'sw2021';version:'2021';level:1;
 parser_version:string;mapping_version:string;query_template_id:string;query_template_version:number;code_version:string;
 expected_grid:Grid;content_hash:string;coverage_summary:Record<string,number>;fetched_from:string;fetched_to:string;batch_id:string|null;
};
export type Run=RunInput&{run_id:string;generation:number;status:'building'|'active'|'superseded'|'failed';activated_at:string|null;failure_code:string|null};
export type Retrieval={
 retrieval_id:string;vendor:string;product:string;interface:string;query_template_id:string;query_template_version:number;
 request_canonical:Record<string,unknown>;sha256:string;canonical_sha256:string|null;api_names_returned:string[];
 http_status:number;fetched_at:string;vendor_as_of:null;batch_id:string|null;attempt:number;
 outcome:'ok'|'parse_failed'|'request_mismatch';outcome_reason:string|null;
};
export type RetrievalInput=Retrieval&{object_path:string;content_type:string;byte_length:number};
export type Classification={code:string;vendor_code:string;name_zh:string;scheme_label:string;level:number;retrieval_id:string};
export type Membership={code:string;security_code:string;security_name:string;retrieval_id:string;locator:{block:number;row:number}};
export type Observation={code:string;metric:string;period_start:string;period_end:string;duration:VendorObservation['duration'];
 status:'ok'|'missing';missing_reason:VendorObservation['missingReason'];value_text:string|null;unit:string;vendor_as_of:null;
 retrieval_id:string|null;locator:VendorObservation['locator']};
export type ObservationQuery={code:string;metric?:string;from?:string;to?:string};
export function failedReceipt(code:string):RunnerReceipt{return {status:'failed',batchId:null,counts:{},errors:[{code}]};}

export type VendorErrorToken='evidence_conflict'|'retrieval_conflict'|'invalid_table'|'run_not_building'|'wrong_run_kind'|'retrieval_not_ok'|'obsolete_run'|'incomplete_grid'|'invalid_failure_code'|'append_only'|'vendor_db_failed';
export class VendorDbError extends Error{constructor(readonly code:VendorErrorToken){super(code);}}
