// src/lib/dq/calendar-deps.ts
// Production wiring of CalendarSyncDeps (spec §6.2) shared by /api/cron/filing-calendar and
// scripts/dq/calendar-sync.ts: Supabase TableClient / FactsDb / pass functions / reconcile-raw store,
// SEC submissions (Task 6 fetcher: raw JSON and pages kept in the bucket) and Tushare disclosure_date
// through tushareCallRaw (bytes kept by calendar-sync, T15). The budget derives from the deadline.
import {getAdminSupabase} from '../supabase/admin';
import {supabaseTableClient} from '../db/table-client';
import {tushareCallRaw} from '../data/sources/tushare';
import {fetchSubmissions} from '../entities/identifiers/sec-submissions';
import {supabaseFactsDb} from '../facts/db';
import {makeBudget} from '../facts/sync';
import {supabaseRawStore} from './raw-store';
import type {RawStore} from './raw-store';
import {submissionsView} from './filer-categories';
import {filingsWindowStart} from './calendar';
import {DISCLOSURE_FIELDS,supabaseCalendarPassDb} from './calendar-sync';
import type {CalendarSyncDeps} from './calendar-sync';

export interface CalendarDepsOptions{deadline:Date|null;codeVersion:string;now?:()=>Date;/** Reuse an existing admin client (scripts hold one). */admin?:ReturnType<typeof getAdminSupabase>;/** Raw-evidence store for BOTH the returned deps and the submissions fetcher; default = the Supabase bucket. Previews pass a memory store. */raw?:RawStore}
export function productionCalendarDeps(opts:CalendarDepsOptions):CalendarSyncDeps{
 const sb=opts.admin??getAdminSupabase();
 const raw=opts.raw??supabaseRawStore(sb);
 const now=opts.now??(()=>new Date());
 return {
  tables:supabaseTableClient(sb),db:supabaseFactsDb(sb),passes:supabaseCalendarPassDb(sb),raw,
  submissions:async(cik10,b)=>submissionsView(await fetchSubmissions(cik10,{fetch:globalThis.fetch.bind(globalThis),raw,budget:b},{coverFrom:filingsWindowStart(new Date().toISOString().slice(0,10))})),
  disclosureDate:(tsCode,b)=>tushareCallRaw('disclosure_date',{ts_code:tsCode},DISCLOSURE_FIELDS,{budget:b}),
  now,budget:makeBudget(opts.deadline,now),codeVersion:opts.codeVersion,
 };
}
