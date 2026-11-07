// TEST-ONLY TableClient over node-postgres, so integration tests drive the same entities/dq code
// against the real schema (constraints, triggers, exclusion indexes). Production uses the Supabase
// adapter (supabaseTableClient in table-client.ts); nothing in src/app or src/lib imports this.
// Semantics mirror the Supabase adapter: null match values use `is null`, update returns the
// matched row count, select/count honour gte/lt ranges and orderBy/desc/limit/offset; rpc calls
// public.<fn> with named arguments (objects / arrays / booleans as jsonb).
// date/timestamp/timestamptz values come back as the server's text (not JS Date) so they compare
// and round-trip exactly like the strings PostgREST returns. Plain objects and arrays are sent as
// JSON (jsonb columns); PostgreSQL array columns are not supported.
import {types} from 'pg';
import type {Pool,QueryConfig} from 'pg';
import {TableError,assertMatch,assertUpdateMatch,checkRangeOptions,checkSelectOptions} from './table-client';
import type {RangeOptions,Row,SelectOptions,TableClient} from './table-client';

const IDENT=/^[a-z_][a-z0-9_]*$/;
/** Validates a table/column name and returns it double-quoted. */
export function ident(name:string):string{
 if(typeof name!=='string'||!IDENT.test(name))throw new Error(`invalid_sql_identifier:${String(name)}`);
 return `"${name}"`;
}

const param=(v:unknown)=>v!==null&&typeof v==='object'&&!(v instanceof Date)&&!Buffer.isBuffer(v)?JSON.stringify(v):v;
const placeholders=(n:number,from=1)=>Array.from({length:n},(_,i)=>`$${from+i}`).join(', ');

/** ` where …` (or '') for an equality match plus optional ranges; pushes values onto `params`. */
export function whereSql(match:Row,range:RangeOptions,params:unknown[]):string{
 const parts:string[]=[];
 const bind=(v:unknown)=>{params.push(param(v));return `$${params.length}`;};
 for(const [k,v] of Object.entries(match))parts.push(v===null?`${ident(k)} is null`:`${ident(k)} = ${bind(v)}`);
 for(const [k,v] of Object.entries(range.gte??{}))parts.push(`${ident(k)} >= ${bind(v)}`);
 for(const [k,v] of Object.entries(range.lt??{}))parts.push(`${ident(k)} < ${bind(v)}`);
 return parts.length?` where ${parts.join(' and ')}`:'';
}

export function selectSql(rel:string,match:Row,opts:SelectOptions):{text:string;values:unknown[]}{
 const values:unknown[]=[];
 let text=`select * from ${rel}${whereSql(match,opts,values)}`;
 if(opts.orderBy)text+=` order by ${ident(opts.orderBy)} ${opts.desc?'desc':'asc'}`;
 if(opts.limit!==undefined)text+=` limit ${Number(opts.limit)}`;
 if(opts.offset!==undefined)text+=` offset ${Number(opts.offset)}`;
 return {text,values};
}

export function upsertSql(rel:string,row:Row,onConflict:string):{text:string;values:unknown[]}{
 const cols=Object.keys(row);
 const conflict=onConflict.split(',').map(s=>s.trim());
 if(!cols.length||!conflict.length)throw new Error('invalid_upsert');
 const rest=cols.filter(c=>!conflict.includes(c));
 const action=rest.length?`do update set ${rest.map(c=>`${ident(c)} = excluded.${ident(c)}`).join(', ')}`:'do nothing';
 return {
  text:`insert into ${rel} (${cols.map(ident).join(', ')}) values (${placeholders(cols.length)}) on conflict (${conflict.map(ident).join(', ')}) ${action}`,
  values:cols.map(c=>param(row[c])),
 };
}

const RAW_TEXT=new Set([1082,1114,1184]); // date, timestamp, timestamptz
const getTypeParser=types.getTypeParser as (oid:number,format?:string)=>unknown;
export const typeParsers={getTypeParser:(oid:number,format?:string)=>RAW_TEXT.has(oid)?(v:string)=>v:getTypeParser(oid,format)} as unknown as QueryConfig['types'];

interface PgErr{message?:string;code?:string;detail?:string;hint?:string}

export function pgTableClient(pool:Pool,schema='public'):TableClient{
 const rel=(table:string)=>`${ident(schema)}.${ident(table)}`;
 const run=async(op:string,table:string,text:string,values:unknown[])=>{
  try{return await pool.query({text,values,types:typeParsers});}
  catch(e){const err=e as PgErr;throw new TableError(op,table,err.message??String(e),err.code??null,{details:err.detail,hint:err.hint,cause:e});}
 };
 return {
  async insert(table,row){
   const cols=Object.keys(row);
   const text=cols.length
    ?`insert into ${rel(table)} (${cols.map(ident).join(', ')}) values (${placeholders(cols.length)}) returning *`
    :`insert into ${rel(table)} default values returning *`;
   return (await run('insert',table,text,cols.map(c=>param(row[c])))).rows[0] as Row;
  },
  async update(table,match,patch){
   assertUpdateMatch(match);
   const cols=Object.keys(patch);
   if(!cols.length)throw new Error('empty_update_patch');
   const values=cols.map(c=>param(patch[c]));
   const set=cols.map((c,i)=>`${ident(c)} = $${i+1}`).join(', ');
   const res=await run('update',table,`update ${rel(table)} set ${set}${whereSql(match,{},values)}`,values);
   return res.rowCount??0;
  },
  async select(table,match,opts={}){
   assertMatch(match);checkSelectOptions(opts);
   const {text,values}=selectSql(rel(table),match,opts);
   return (await run('select',table,text,values)).rows as Row[];
  },
  async upsert(table,row,onConflict){
   const {text,values}=upsertSql(rel(table),row,onConflict);
   await run('upsert',table,text,values);
  },
  async count(table,match,opts={}){
   assertMatch(match);checkRangeOptions(opts);
   const values:unknown[]=[];
   const res=await run('count',table,`select count(*)::int as n from ${rel(table)}${whereSql(match,opts,values)}`,values);
   return Number(res.rows[0].n);
  },
  async rpc(fn,args){
   const names=Object.keys(args);
   const text=`select ${ident(schema)}.${ident(fn)}(${names.map((k,i)=>`${ident(k)} => $${i+1}`).join(', ')}) as result`;
   return (await run('rpc',fn,text,names.map(k=>param(args[k])))).rows[0]?.result;
  },
 };
}
