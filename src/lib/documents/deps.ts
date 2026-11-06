// src/lib/documents/deps.ts
// Production wiring of the document pipeline (spec §6.1, §6.3). productionDocumentsDeps builds one
// PoliteHttp per run with the source's request gap (edgar 120 ms, cninfo 500 ms, hkexnews 1000 ms)
// shared by the list adapter and the document downloads, plus the Supabase DocumentsDb / TableClient /
// ObjectStore. documentsCodeVersion delegates to the facts rule (src/lib/facts/sync.ts::resolveCodeVersion):
// cron routes accept only a full VERCEL_GIT_COMMIT_SHA (allowGit false); scripts may fall back to
// `git rev-parse HEAD` (+ -dirty). null = refuse to apply. Sync wiring only: extraction wiring is
// extract/deps.ts (Task 10), candidates wiring is candidates/run.ts::supabaseCandidatesDeps (Task 15).
import {supabaseTableClient} from '../db/table-client';
import {resolveCodeVersion} from '../facts/sync';
import {getAdminSupabase} from '../supabase/admin';
import {supabaseDocumentsDb} from './db';
import {supabaseObjectStore} from './object-store';
import {CNINFO_INTERVAL_MS,cninfoAdapter} from './sources/cninfo';
import {EDGAR_DOC_FORMS,EDGAR_INTERVAL_MS,edgarAdapter} from './sources/edgar';
import {HKEX_INTERVAL_MS,hkexnewsAdapter} from './sources/hkexnews';
import {politeHttp} from './sources/shared';
import type {SourceAdapter} from './sources/shared';
import type {SyncDeps} from './sync';
import type {ListedSource} from './types';

export function documentsCodeVersion(opts:{allowGit:boolean}={allowGit:false}):string|null{
 return opts.allowGit?resolveCodeVersion(process.env):resolveCodeVersion(process.env,()=>{throw new Error('git_not_allowed');});
}

export const SOURCE_INTERVAL_MS:Record<ListedSource,number>={edgar:EDGAR_INTERVAL_MS,cninfo:CNINFO_INTERVAL_MS,hkexnews:HKEX_INTERVAL_MS};
export interface DocumentsDepsOptions{
 deadline:Date|null;codeVersion:string|null;now?:()=>Date;
 /** Reuse an existing admin client (scripts hold one). */
 admin?:ReturnType<typeof getAdminSupabase>;
 /** edgar: forms added to EDGAR_DOC_FORMS (script --forms). */
 extraForms?:string[];
 /** cninfo/hkexnews: store every announcement, not only periodic reports (script --all-announcements, owner decision B). */
 allAnnouncements?:boolean;
 fetch?:typeof fetch;userAgent?:string;
}
export function productionDocumentsDeps(source:ListedSource,opts:DocumentsDepsOptions):SyncDeps{
 const sb=opts.admin??getAdminSupabase();
 const http=politeHttp({minIntervalMs:SOURCE_INTERVAL_MS[source],fetch:opts.fetch,userAgent:opts.userAgent});
 const adapter:SourceAdapter=source==='edgar'?edgarAdapter({http,forms:[...new Set([...EDGAR_DOC_FORMS,...(opts.extraForms??[])])]})
  :source==='cninfo'?cninfoAdapter({http,allAnnouncements:opts.allAnnouncements}):hkexnewsAdapter({http,allAnnouncements:opts.allAnnouncements});
 return {db:supabaseDocumentsDb(sb),tables:supabaseTableClient(sb),store:supabaseObjectStore(sb),adapter,fetchBytes:http.fetchBytes,
  now:opts.now??(()=>new Date()),deadline:opts.deadline,codeVersion:opts.codeVersion,userAgent:http.userAgent};
}
