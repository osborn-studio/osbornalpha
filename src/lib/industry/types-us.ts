// US extensions live outside the macro_regime@v2 pinned import closure.
import {IndustryDbError as PinnedIndustryDbError} from './types';
import type {FactsBatchReader} from '../facts/read-batch';
import type * as Pinned from './types';
export * from './types';

export type AggMetricAny=Pinned.AggMetric|'net_margin';
export type RoleReasonAny=Pinned.RoleReason|'dual_currency'|'ambiguous_period'|'period_mismatch';
export type AggMetric=AggMetricAny;
export type RoleReason=RoleReasonAny;
export type ExpectedGridUs=Omit<Pinned.MetricRunRow['expected_grid'],'metrics'>&{
 metrics:AggMetricAny[];cell_rule?:'fiscal_year_bucket/1'|null;membership_on?:string|null;
};
// Stored/unvalidated grids retain unknown rules so activation can reject them as before.
export type ExpectedGrid=Omit<ExpectedGridUs,'cell_rule'>&{cell_rule?:string|null};
export type MetricRunRow=Omit<Pinned.MetricRunRow,'expected_grid'>&{expected_grid:ExpectedGrid};
export type NewMetricRun=Omit<Pinned.NewMetricRun,'expected_grid'>&{expected_grid:ExpectedGrid};
export type MetricCellRow=Omit<Pinned.MetricCellRow,'metric'>&{metric:AggMetricAny};
export type StagedMetricCell=Omit<Pinned.StagedMetricCell,'metric'>&{metric:AggMetricAny};
export type ManifestCell=Omit<Pinned.ManifestCell,'metric'>&{metric:AggMetricAny};
export type ManifestRole=Omit<Pinned.ManifestRole,'metric'|'reason'>&{metric:AggMetricAny;reason?:RoleReasonAny};
export type AggregateManifest=Omit<Pinned.AggregateManifest,'roles'|'cells'>&{roles:ManifestRole[];cells:ManifestCell[]};
export type ManifestStore=Omit<Pinned.ManifestStore,'get'>&{get(hash:string):Promise<AggregateManifest>};
export type IndustryDb=Omit<Pinned.IndustryDb,'createMetricRun'|'stageMetricRows'|'activeMetricRun'|'metricRun'|'metricRowsOfRun'>&{
 createMetricRun(row:NewMetricRun):Promise<{runId:string;generation:number}>;
 stageMetricRows(run:string,rows:StagedMetricCell[]):Promise<number>;
 activeMetricRun(scheme:Pinned.Scheme,version:Pinned.SchemeVersion,level:number):Promise<MetricRunRow|null>;
 metricRun(run:string):Promise<MetricRunRow|null>;
 metricRowsOfRun(run:string,filter?:{codes?:string[];metrics?:AggMetricAny[];periodEnds?:string[];durations?:Pinned.AggDuration[]}):Promise<MetricCellRow[]>;
};
export type IndustryDeps=Omit<Pinned.IndustryDeps,'db'|'manifests'>&{db:IndustryDb;manifests:ManifestStore;factsBatch?:FactsBatchReader};
export type IndustryDbErrorCode=Pinned.IndustryDbErrorCode|'invalid_cell_rule'|'invalid_membership_basis';
export type IndustryDbError=Omit<Pinned.IndustryDbError,'code'>&{code:IndustryDbErrorCode};
type ErrorConstructor=new(code:IndustryDbErrorCode,message?:string)=>IndustryDbError;

export type IndustryDbBoundary=IndustryDb&Pinned.IndustryDb;
export type IndustryMetricReader=Pick<IndustryDb,'metricRun'|'metricRowsOfRun'>;
export type IndustryMetricReaderBoundary=IndustryMetricReader&Pick<Pinned.IndustryDb,'metricRun'|'metricRowsOfRun'>;

/**
 * types.ts and IndustryDb are byte-pinned by macro_regime@v2. Implementations handle
 * both CN and US rows; this identity adapter bridges that historical contract without
 * changing values or scattering narrow/wide casts. The error constructor stays the
 * same object, preserving instanceof across both contracts.
 */
export function withUsIndustryTypes<T extends IndustryDb|Pinned.IndustryDb>(db:T):T&IndustryDbBoundary;
export function withUsIndustryTypes<T extends IndustryMetricReader>(db:T):T&IndustryMetricReaderBoundary;
export function withUsIndustryTypes(error:typeof PinnedIndustryDbError):ErrorConstructor;
export function withUsIndustryTypes(value:IndustryMetricReader|Pinned.IndustryDb|typeof PinnedIndustryDbError):IndustryDbBoundary|IndustryMetricReaderBoundary|ErrorConstructor{
 return value as IndustryDbBoundary|IndustryMetricReaderBoundary|ErrorConstructor;
}
export const IndustryDbError=withUsIndustryTypes(PinnedIndustryDbError);
