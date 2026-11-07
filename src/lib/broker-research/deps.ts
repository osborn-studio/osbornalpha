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
import {productionF3Port} from './ports/f3';
import type {F3Port} from './ports/f3';
import {productionLlmPort} from './ports/llm';
import type {LlmPort} from './ports/llm';
export interface CoreDeps{db:BrokerResearchDb;storage:BrokerStorage;tables:TableClient;now:()=>Date;codeVersion:string;newId:()=>string}
export function coreDeps():CoreDeps{
 const admin=getAdminSupabase() as unknown as SupabaseClient;
 return {db:supabaseBrokerResearchDb({admin}),storage:supabaseBrokerStorage(admin),tables:supabaseTableClient(admin),
  now:()=>new Date(),codeVersion:resolveCodeVersion({allowGit:false})??'unknown',newId:randomUUID};
}
/** Injected processing dependencies; both production ports are flag gated. */
export interface BrokerDeps extends CoreDeps{f3:F3Port;llm:LlmPort}
export function brokerDeps():BrokerDeps{return {...coreDeps(),f3:productionF3Port(),llm:productionLlmPort()};}
export const ROUTE_BUDGET_MS=300_000,DEADLINE_MARGIN_MS=20_000;
export const deadlineFrom=(start:Date)=>new Date(start.getTime()+ROUTE_BUDGET_MS-DEADLINE_MARGIN_MS);
