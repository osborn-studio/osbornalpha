// Minimal table access used by dq/* and entities/* so logic is unit-testable with an
// in-memory client and runs in production over the service-role Supabase client.
// PostgREST caps every response (max_rows, default 1000), so select() returns at most one
// page. Reads that may exceed one page must use selectAll(), which pages in a fixed order.
import type {SupabaseClient} from '@supabase/supabase-js';

export type Row=Record<string,unknown>;
// offset requires orderBy: unordered pages are not stable across requests. limit <= MAX_PAGE.
export interface SelectOptions{limit?:number;offset?:number;orderBy?:string;desc?:boolean}

/** Largest page PostgREST returns by default; also the limit and selectAll page-size ceiling. */
export const MAX_PAGE=1000;

/** Table operation failure; `code` is the PostgreSQL SQLSTATE when known (e.g. '23505' unique violation). */
export class TableError extends Error{
 constructor(readonly op:string,readonly table:string,message:string,readonly code:string|null=null){super(`${table} ${op}: ${message}`);this.name='TableError';}
}

export interface TableClient{
 insert(table:string,row:Row):Promise<Row>;
 /** Returns the number of rows the match hit. */
 update(table:string,match:Row,patch:Row):Promise<number>;
 select(table:string,match:Row,opts?:SelectOptions):Promise<Row[]>;
 upsert(table:string,row:Row,onConflict:string):Promise<void>;
 count(table:string,match:Row):Promise<number>;
}

export function checkSelectOptions(opts:SelectOptions):void{
 if(opts.offset!==undefined&&!opts.orderBy)throw new Error('offset_requires_orderBy');
 if(opts.limit!==undefined&&opts.limit>MAX_PAGE)throw new Error('limit_exceeds_max_page');
}

/**
 * Reads every matching row, paging by `offset` in `orderBy` order and stopping only on an empty
 * page, so a server max_rows below pageSize cannot truncate the result. `orderBy` must be a
 * unique column (ties make offset pages overlap or skip). Pages are separate requests, so the
 * result is not a snapshot: concurrent writes can be missed or seen twice.
 */
export async function selectAll(client:TableClient,table:string,match:Row,orderBy:string,pageSize=MAX_PAGE):Promise<Row[]>{
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>MAX_PAGE)throw new Error(`selectAll pageSize must be 1..${MAX_PAGE}`);
 const out:Row[]=[];
 for(let offset=0;;){
  const page=await client.select(table,match,{orderBy,offset,limit:pageSize});
  if(page.length===0)return out;
  out.push(...page);offset+=page.length;
 }
}

// `.eq(k,null)` renders `k=eq.null`, which never matches in SQL; null must use `.is`.
const applyMatch=(q:any,match:Row)=>{for(const [k,v] of Object.entries(match))q=v===null?q.is(k,null):q.eq(k,v);return q;};

export function supabaseTableClient(client:SupabaseClient):TableClient{
 // The hand-maintained Database type lacks the new tables; a loosely typed handle keeps
 // callers typed through TableClient instead of casting at every call site.
 const db=client as unknown as {from:(t:string)=>any};
 const fail=(op:string,table:string,error:{message:string;code?:string}):never=>{throw new TableError(op,table,error.message,error.code??null);};
 return {
  async insert(table,row){const {data,error}=await db.from(table).insert(row).select().single();if(error)fail('insert',table,error);return data as Row;},
  // Service role bypasses RLS, so the returning read sees every updated row.
  async update(table,match,patch){const {data,error}=await applyMatch(db.from(table).update(patch),match).select();if(error)fail('update',table,error);return (data??[]).length;},
  async select(table,match,opts={}){checkSelectOptions(opts);let q=applyMatch(db.from(table).select('*'),match);if(opts.orderBy)q=q.order(opts.orderBy,{ascending:!opts.desc});if(opts.limit!==undefined||opts.offset!==undefined){const from=opts.offset??0;q=q.range(from,from+(opts.limit??MAX_PAGE)-1);}const {data,error}=await q;if(error)fail('select',table,error);return (data??[]) as Row[];},
  async upsert(table,row,onConflict){const {error}=await db.from(table).upsert(row,{onConflict});if(error)fail('upsert',table,error);},
  async count(table,match){const {count,error}=await applyMatch(db.from(table).select('*',{count:'exact',head:true}),match);if(error)fail('count',table,error);return (count??0) as number;},
 };
}
