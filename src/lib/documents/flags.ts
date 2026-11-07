// src/lib/documents/flags.ts
// Feature flags of the document pipeline, read the same way everywhere (cron routes, the admin
// reprocess route): DOCUMENTS_SYNC_ENABLED, DOCUMENTS_EXTRACT_ENABLED (and later the candidates flag)
// are on exactly for '1' or 'true' (lower case). Anything else, including unset, is off.
export type DocumentsFlagName='DOCUMENTS_SYNC_ENABLED'|'DOCUMENTS_EXTRACT_ENABLED'|'DOCUMENTS_CANDIDATES_ENABLED';
export function documentsFlag(name:DocumentsFlagName):boolean{
 const v=process.env[name];
 return v==='1'||v==='true';
}
