// Minimal table access used by dq/* and entities/* so logic is unit-testable with an
// in-memory client and runs in production over the service-role Supabase client.
// PostgREST caps every response (max_rows, default 1000), so select() returns at most one
// page. Reads that may exceed one page must use selectAll(), which pages in a fixed order.
import type {SupabaseClient} from '@supabase/supabase-js';

export type Row=Record<string,unknown>;
// offset requires orderBy: unordered pages are not stable across requests.
export interface SelectOptions{limit?:number;offset?:number;orderBy?:string;desc?:boolean}

/** Largest page PostgREST returns by default; also the selectAll page-size ceiling. */
export const MAX_PAGE=1000;

export interface TableClient{
 insert(table:string,row:Row):Promise<Row>;
 update(table:string,match:Row,patch:Row):Promise<void>;
 select(table:string,match:Row,opts?:SelectOptions):Promise<Row[]>;
 upsert(table:string,row:Row,onConflict:string):Promise<void>;
 count(table:string,match:Row):Promise<number>;
}

/** Reads every matching row, paging by `offset` in `orderBy` order until a short page. */
export async function selectAll(client:TableClient,table:string,match:Row,orderBy:string,pageSize=MAX_PAGE):Promise<Row[]>{
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>MAX_PAGE)throw new Error(`selectAll pageSize must be 1..${MAX_PAGE}`);
 const out:Row[]=[];
 for(let offset=0;;offset+=pageSize){
  const page=await client.select(table,match,{orderBy,offset,limit:pageSize});
  out.push(...page);
  if(page.length<pageSize)return out;
 }
}

export function supabaseTableClient(client:SupabaseClient):TableClient{
 // The hand-maintained Database type lacks the new tables; a loosely typed handle keeps
 // callers typed through TableClient instead of casting at every call site.
 const db=client as unknown as {from:(t:string)=>any};
 return {
  async insert(table,row){const {data,error}=await db.from(table).insert(row).select().single();if(error)throw new Error(`${table} insert: ${error.message}`);return data as Row;},
  async update(table,match,patch){let q=db.from(table).update(patch);for(const [k,v] of Object.entries(match))q=q.eq(k,v);const {error}=await q;if(error)throw new Error(`${table} update: ${error.message}`);},
  async select(table,match,opts={}){let q=db.from(table).select('*');for(const [k,v] of Object.entries(match))q=q.eq(k,v);if(opts.orderBy)q=q.order(opts.orderBy,{ascending:!opts.desc});if(opts.offset!==undefined&&!opts.orderBy)throw new Error('offset_requires_orderBy');if(opts.limit!==undefined||opts.offset!==undefined){const from=opts.offset??0;q=q.range(from,from+(opts.limit??MAX_PAGE)-1);}const {data,error}=await q;if(error)throw new Error(`${table} select: ${error.message}`);return (data??[]) as Row[];},
  async upsert(table,row,onConflict){const {error}=await db.from(table).upsert(row,{onConflict});if(error)throw new Error(`${table} upsert: ${error.message}`);},
  async count(table,match){let q=db.from(table).select('*',{count:'exact',head:true});for(const [k,v] of Object.entries(match))q=q.eq(k,v);const {count,error}=await q;if(error)throw new Error(`${table} count: ${error.message}`);return (count??0) as number;},
 };
}
