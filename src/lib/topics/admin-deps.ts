// Topic plan PR-5 commander decision 1: admin-only dependency composition.
import {getAdminSupabase} from '@/lib/supabase/admin';
import {productionResolver} from '@/lib/evidence';
import type {Resolver} from '@/lib/evidence/resolve';
import {resolveCodeVersion} from '@/lib/judgments/deps';
import {supabaseTopicsDb} from './db';
import type {TopicsDb} from './types';
import {adminFixtureDeps,adminFixtureMode} from './admin-fixture';
export interface AdminDeps{db:TopicsDb;resolver:Resolver;now():Date;codeVersion:string|null;privateIds(userId:string):Promise<ReadonlySet<string>>}
export function adminDeps():AdminDeps{
 if(adminFixtureMode())return adminFixtureDeps();
 let codeVersion:string|null=null;
 try{codeVersion=resolveCodeVersion({allowGit:false})||null;}catch{/* Unavailable until deployment supplies a version. */}
 return {db:supabaseTopicsDb({admin:getAdminSupabase()}),resolver:productionResolver(),now:()=>new Date(),codeVersion,privateIds:async()=>new Set<string>()};
}
