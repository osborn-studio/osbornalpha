// Production dependencies for broker research services (plan Part C): private DB/storage, DQ tables, clock and ids.
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {getAdminSupabase} from '../supabase/admin';
import {supabaseTableClient} from '../db/table-client';
import type {TableClient} from '../db/table-client';
import {resolveCodeVersion} from '../facts/deps';
import {supabaseBrokerResearchDb} from './db';
import {supabaseBrokerStorage} from './storage';
import type {BrokerStorage} from './storage';
import type {BrokerResearchDb} from './types';
export interface CoreDeps{db:BrokerResearchDb;storage:BrokerStorage;tables:TableClient;now:()=>Date;codeVersion:string;newId:()=>string}
export function coreDeps():CoreDeps{
 const admin=getAdminSupabase() as unknown as SupabaseClient;
 return {db:supabaseBrokerResearchDb({admin}),storage:supabaseBrokerStorage(admin),tables:supabaseTableClient(admin),
  now:()=>new Date(),codeVersion:resolveCodeVersion({allowGit:false})??'unknown',newId:randomUUID};
}
