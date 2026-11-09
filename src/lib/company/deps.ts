// src/lib/company/deps.ts
// Production wiring (plan Task 8). Digest: every dependency service_role (company_digest_state,
// issuer_events, company_fact_evidence and fact_sync_scope are not readable by anon, §0 #64).
// The read-route wiring (ReadDeps / productionReadDeps / productionEventGateDeps) is appended by
// Task 9 Step 1 — this task creates only the digest side.
import type {SupabaseClient} from '@supabase/supabase-js';
import {supabaseTableClient} from '../db/table-client';
import {supabaseFactsDb} from '../facts/db';
import {getAdminSupabase} from '../supabase/admin';
import {supabaseCompanyDb} from './db';
import {companyEvidenceFetch} from './evidence-request';
import type {DigestDeps} from './digest';
import {supabaseSnapshotObjectStore} from './evidence-index';
import {readSnapshot} from './snapshot-read';
import {getAnonSupabase} from '../supabase/anon';
import type {TableClient} from '../db/table-client';
import {lineageFilings,publicClients} from '../facts/public-route';
import {SNAPSHOT_BUCKET} from '../facts/snapshot-store';
import type {FactsDb,Market} from '../facts/types';
import {audit} from '../research/store';
import type {ResearchSupabase} from '../research/store';
import {emptyPdfLocatorSource} from './pdf-locator';
import type {PdfLocatorSource} from './pdf-locator';
import {metricsComputedAt} from './metrics-computed-at';
import type {ComputedAtMap} from './metrics-computed-at';
import type {CompanyDb,ReadSnapshotOptions,ReadSnapshotResult} from './types';

export interface ProductionDigestOptions{deadline:Date|null;codeVersion:string|null;admin?:SupabaseClient;now?:()=>Date}
export function productionDigestDeps(opts:ProductionDigestOptions):DigestDeps{
 const sb=opts.admin??getAdminSupabase(companyEvidenceFetch());
 return {db:supabaseCompanyDb(sb),tables:supabaseTableClient(sb),readSnapshot:(i,m,o)=>readSnapshot(sb,i,m,o),facts:supabaseFactsDb(sb),
  reader:supabaseSnapshotObjectStore(sb),now:opts.now??(()=>new Date()),deadline:opts.deadline,codeVersion:opts.codeVersion};
}

// --- read side (Tasks 9, 10, 14, 15) --------------------------------------------------------
/** Everything a composed read route needs (spec §6, §0 #64). Public data via anon; events/evidence via service_role. */
export interface ReadDeps{
 tables:TableClient;                                                         // anon: issuers, issuer_securities
 facts:Pick<FactsDb,'readFactsLineage'|'readFacts'|'factsByIds'|'filingsOfIssuer'|'metricsOfIssuer'|'lineageOf'|'stateRevs'>;   // anon
 lineageFilings(lineage:readonly string[],market:Market,opts?:{from?:string;to?:string}):ReturnType<typeof lineageFilings>; // anon published member filings
 stateRev(issuer:string,market:Market):Promise<number>;                     // anon fact_state_rev
 snapshot(issuer:string,market:Market,opts:ReadSnapshotOptions):Promise<ReadSnapshotResult>;   // anon company_read_snapshot
 company:CompanyDb;                                                          // service_role: eventsOfIssuer(s), evidenceOf
 publicCompany:CompanyDb;                                                    // anon: coverageOf, listCoverage
 pdf:PdfLocatorSource;
 metricsComputedAt(issuer:string,market:Market,formulaVersion:string):Promise<ComputedAtMap>;   // anon select financial_metrics.computed_at
 freshnessTables():TableClient;                                              // service_role (dq_freshness)
 signSnapshot(path:string,seconds:number):Promise<string>;                  // service_role storage signed URL
 audit(userId:string,action:string,objectId:string,detail:Record<string,unknown>):Promise<void>;   // research_audit_log via service_role
}
/** What the shared event gate (Task 10 event-dto.ts) reads: evidence via service_role, facts/filings via anon, CN PDF locators. */
export type EventGateDeps=Pick<ReadDeps,'company'|'facts'|'pdf'>;
export function productionReadDeps():ReadDeps{
 const anon=getAnonSupabase() as unknown as SupabaseClient;
 const {tables,db,stateRev}=publicClients();
 let admin:SupabaseClient|null=null;
 const adminClient=()=>admin??=(getAdminSupabase() as unknown as SupabaseClient);
 let service:CompanyDb|null=null;
 return {
  tables,facts:db,stateRev,lineageFilings:(lineage,market,opts)=>lineageFilings(db,lineage,market,opts),
  snapshot:(issuer,market,opts)=>readSnapshot(anon,issuer,market,opts),
  get company(){return service??=supabaseCompanyDb(adminClient());},
  publicCompany:supabaseCompanyDb(anon),
  pdf:emptyPdfLocatorSource,
  metricsComputedAt:(issuer,market,v)=>metricsComputedAt(anon,issuer,market,v),
  freshnessTables:()=>supabaseTableClient(adminClient()),
  signSnapshot:async(path,seconds)=>{
   const {data,error}=await adminClient().storage.from(SNAPSHOT_BUCKET).createSignedUrl(path,seconds);
   if(error||!data?.signedUrl)throw new Error('snapshot_sign_failed');
   return data.signedUrl;
  },
  audit:(userId,action,objectId,detail)=>audit({supabase:adminClient() as unknown as ResearchSupabase,userId},action,objectId,detail),
 };
}
/** Tracking inbox (Task 16): the same members as the read routes, so the inbox and /api/companies/[ticker]/events gate identically. */
export const productionEventGateDeps=():EventGateDeps=>productionReadDeps();
