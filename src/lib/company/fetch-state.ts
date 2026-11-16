// src/lib/company/fetch-state.ts
// Pure state selection of useCompanyFetch (plan 2026-11-06 Task 11 review fix): a stored result is only
// valid for the url it was fetched with; any other url reads as loading until its own result arrives.
import type {FetchResult} from './client';

export type FetchState<T>={status:'idle'}|{status:'loading'}|FetchResult<T>;
export interface Stored<T>{url:string;result:FetchResult<T>}
export function stateFor<T>(url:string|null,stored:Stored<T>|null):FetchState<T>{
 if(!url)return {status:'idle'};
 return stored&&stored.url===url?stored.result:{status:'loading'};
}
