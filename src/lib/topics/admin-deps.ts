// Topic plan PR-5 commander decision 1: admin-only dependency composition.
import {getAdminSupabase} from '@/lib/supabase/admin';
import {productionResolver} from '@/lib/evidence';
import type {Resolver} from '@/lib/evidence/resolve';
import {resolveCodeVersion} from '@/lib/judgments/deps';
import {productionCandidateLookup,type CandidateLookup} from './evidence-search';
import {supabaseTopicsDb} from './db';
import type {TopicsDb} from './types';
import {adminFixtureMode} from './admin-fixture-mode';
export {adminFixtureMode,FIXTURE_ADMIN_ID} from './admin-fixture-mode';
export interface AdminDeps{db:TopicsDb;resolver:Resolver;lookup:CandidateLookup;now():Date;codeVersion:string|null;privateIds(userId:string):Promise<ReadonlySet<string>>}
export async function adminDeps():Promise<AdminDeps>{
 if(adminFixtureMode())return (await import('./admin-fixture')).adminFixtureDeps();
 let codeVersion:string|null=null;
 try{codeVersion=resolveCodeVersion({allowGit:false})||null;}catch{/* Unavailable until deployment supplies a version. */}
 return {db:supabaseTopicsDb({admin:getAdminSupabase()}),resolver:productionResolver(),lookup:productionCandidateLookup({admin:getAdminSupabase()}),now:()=>new Date(),codeVersion,privateIds:async()=>new Set<string>()};
}
