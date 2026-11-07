// src/lib/industry/licenses.ts
// Dataset licence keys (spec §4.1, §4.8). industry_dataset_licenses holds one row per key; the
// migration writes the defaults below (owner decision A pending: three Tushare datasets internal,
// SEC SIC public). Only set_industry_dataset_license changes a row, and only for these four keys.
import type {DatasetKey,LicenseStatus,Scheme,SchemeVersion} from './types';

export const DATASET_KEYS:readonly DatasetKey[]=['scheme:sw2021:2021','scheme:sic:sec-current','marks:tushare-daily_basic','official:tushare-sw_daily'];
/** Defaults written by migration 20261111090000 (on conflict do nothing: a replay keeps admin decisions). */
export const DEFAULT_LICENSES:Readonly<Record<DatasetKey,LicenseStatus>>={'scheme:sw2021:2021':'internal','scheme:sic:sec-current':'public','marks:tushare-daily_basic':'internal','official:tushare-sw_daily':'internal'};
/** The one version per scheme this module loads. */
export const SCHEME_VERSION:Readonly<Record<Scheme,SchemeVersion>>={sw2021:'2021',sic:'sec-current'};

/** 'scheme:'+scheme+':'+version; throws invalid_scheme_version for a pair that is not a dataset (e.g. sw2021 + sec-current). */
export function schemeDatasetKey(scheme:Scheme,version:SchemeVersion):DatasetKey{
 if(SCHEME_VERSION[scheme]!==version)throw new Error(`invalid_scheme_version:${scheme}:${version}`);
 return `scheme:${scheme}:${version}` as DatasetKey;
}
export const isDatasetKey=(v:unknown):v is DatasetKey=>typeof v==='string'&&(DATASET_KEYS as readonly string[]).includes(v);
export const isLicensedStatus=(v:unknown):v is LicenseStatus=>v==='internal'||v==='public';
