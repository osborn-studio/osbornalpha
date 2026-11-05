// src/lib/facts/errors.ts
// Sync-level failure codes (spec §10) raised by fetchers, the snapshot store and the sync core.
// FactsDbError (types.ts) covers database outcomes; SyncError covers everything before/around
// the database. The code is the batch error code written to ingest_batches.errors.
// tushare_unavailable (Part C): Tushare HTTP/API failure that is not a quota message; spec §10 has
// no such row, so it is a non-info code like sec_unavailable.
export type SyncErrorCode='quota_exhausted'|'sec_unavailable'|'no_companyfacts'|'snapshot_too_large'|'snapshot_upload_failed'|'parse_error'|'code_version_unavailable'|'tushare_unavailable'|'snapshot_hash_mismatch';
export class SyncError extends Error{
 constructor(public code:SyncErrorCode,message?:string){super(message===undefined?code:`${code}: ${message}`);this.name='SyncError';}
}
