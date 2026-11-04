// Minimal table access used by dq/* and entities/* so logic is unit-testable with an
// in-memory client and runs in production over the service-role Supabase client.
import type {SupabaseClient} from '@supabase/supabase-js';

export type Row=Record<string,unknown>;
export interface SelectOptions{limit?:number;orderBy?:string;desc?:boolean}

export interface TableClient{
 insert(table:string,row:Row):Promise<Row>;
 update(table:string,match:Row,patch:Row):Promise<void>;
 select(table:string,match:Row,opts?:SelectOptions):Promise<Row[]>;
 upsert(table:string,row:Row,onConflict:string):Promise<void>;
}

export function supabaseTableClient(client:SupabaseClient):TableClient{
 // The hand-maintained Database type lacks the new tables; a loosely typed handle keeps
 // callers typed through TableClient instead of casting at every call site.
 const db=client as unknown as {from:(t:string)=>any};
 return {
  async insert(table,row){const {data,error}=await db.from(table).insert(row).select().single();if(error)throw new Error(`${table} insert: ${error.message}`);return data as Row;},
  async update(table,match,patch){let q=db.from(table).update(patch);for(const [k,v] of Object.entries(match))q=q.eq(k,v);const {error}=await q;if(error)throw new Error(`${table} update: ${error.message}`);},
  async select(table,match,opts={}){let q=db.from(table).select('*');for(const [k,v] of Object.entries(match))q=q.eq(k,v);if(opts.orderBy)q=q.order(opts.orderBy,{ascending:!opts.desc});if(opts.limit)q=q.limit(opts.limit);const {data,error}=await q;if(error)throw new Error(`${table} select: ${error.message}`);return (data??[]) as Row[];},
  async upsert(table,row,onConflict){const {error}=await db.from(table).upsert(row,{onConflict});if(error)throw new Error(`${table} upsert: ${error.message}`);},
 };
}
