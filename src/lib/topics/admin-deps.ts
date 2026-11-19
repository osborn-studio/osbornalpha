// Topic plan PR-5 commander decision 1: admin-only dependency composition.
import type {TableClient} from '@/lib/db/table-client';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {serviceDeps} from './deps';
import type {Resolver} from '@/lib/evidence/resolve';
import {resolveCodeVersion} from '@/lib/judgments/deps';
import {productionCandidateLookup,type CandidateLookup} from './evidence-search';
import {privateIds,researchSession} from './private-ids';
import type {TopicsDb} from './types';
import {adminFixtureMode} from './admin-fixture-mode';
export {adminFixtureMode,FIXTURE_ADMIN_ID} from './admin-fixture-mode';
export interface AdminDeps{tables:TableClient;db:TopicsDb;resolver:Resolver;lookup:CandidateLookup;now():Date;codeVersion:string|null;privateIds(userId:string):Promise<ReadonlySet<string>>}
export async function adminDeps():Promise<AdminDeps>{
 if(adminFixtureMode())return (await import('./admin-fixture')).adminFixtureDeps();
 let codeVersion:string|null=null;
 try{codeVersion=resolveCodeVersion({allowGit:false})||null;}catch{/* Unavailable until deployment supplies a version. */}
 return {...serviceDeps(),lookup:productionCandidateLookup({admin:getAdminSupabase()}),codeVersion,privateIds:async actor=>privateIds(await researchSession(actor))};
}
