// Evidence source ports (topic spec 2026-11-16 §4.1).
import type {ObservationRow} from '@/lib/macro/types';
import type {FactRow} from '@/lib/facts/types';
import type {Envelope,MethodologyRow} from '@/lib/judgments/types';
export type Bi={zh:string;en:string};
export interface MacroSeriesInfo{id:string;name:Bi;unit:string;status:'active'|'missing'|'restricted';rights:'public_domain'|'official_open'|'third_party';
 publisher:Bi;relay:string|null;adapter:string;dataset:'macro.fred'|'macro.akshare'}
export interface MacroRetrieval{retrieval_id:string;fetch_url:string|null;fetched_at:string;sha256:string|null}
export interface MacroSource{
 rows(ids:readonly string[]):Promise<ObservationRow[]>;                      // any status
 versions(seriesId:string,periodEnd:string):Promise<ObservationRow[]>;       // any status, version ascending
 latestPeriodEnd(seriesId:string):Promise<string|null>;                      // status ok
 series(seriesId:string):MacroSeriesInfo|null;
 retrievals(ids:readonly string[]):Promise<Map<string,MacroRetrieval>>;
}
export interface IndustryCellKey{run_id:string;code:string;metric:string;period_start:string;period_end:string}
export interface IndustryCell{
 run:{run_id:string;scheme:'sw2021'|'sic';version:string;level:number;generation:number;status:'building'|'active'|'superseded'|'failed';
  history_class:'point_in_time'|'reconstruction';activated_at:string|null;method_version:string;code_version:string};
 row:{status:'ok'|'missing';missing_reason:string|null;value_text:string|null;unit:string;duration:string;n_members:number;n_with_data:number}|null;
 label:Bi;
}
export interface IndustrySource{
 cell(key:IndustryCellKey):Promise<IndustryCell|null>;                       // null = unknown run
 datasetPublic(scheme:'sw2021'|'sic',version:string):Promise<boolean>;
 activeCell(scheme:'sw2021'|'sic',version:string,level:number,key:Omit<IndustryCellKey,'run_id'>):Promise<{run_id:string;value_text:string|null;unit:string;activated_at:string}|null>;
 latestPeriodEnd(scheme:'sw2021'|'sic',version:string,level:number,code:string,metric:string):Promise<string|null>;
}
export type FactEligibility={ok:true}|{ok:false;reason:'evidence_incomplete'|'citation_pending'};
export interface FactInfo{row:FactRow;issuer:{name:Bi;ticker:string|null};filing:{form_type:string|null;source_ref:string|null;url:string|null}|null;publisher:string}
export interface FactSource{
 facts(ids:readonly string[]):Promise<FactInfo[]>;                           // any status, any market
 eligibility(rows:readonly FactRow[],opts:{admin:boolean}):Promise<Map<string,FactEligibility>>;
 current(row:FactRow):Promise<FactRow|null>;                                 // current disclosure of the same (issuer, concept, period, duration, consolidation, unit)
 newerPeriodEnd(row:FactRow):Promise<string|null>;
}
export interface CitationInfo{citation_id:string;document_id:string;page_no:number;snippet:string;text_hash:string;visibility:'internal'|'public';created_at:string;
 document:{title:string;permission:'public'|'licensed'|'private';publisher:string;url:string|null}}
export interface DocumentSource{citation(id:string):Promise<CitationInfo|null>}
export interface JudgmentSource{judgment(id:string):Promise<{envelope:Envelope;method:MethodologyRow|null}|null>}
export interface EvidenceSources{
 macro:MacroSource;industry:IndustrySource;facts:FactSource;documents:DocumentSource;judgments:JudgmentSource;
 freshness(dataset:string,now:Date):Promise<{dataset:string;status:'fresh'|'stale'|'unknown';checked_at:string}>;
}
