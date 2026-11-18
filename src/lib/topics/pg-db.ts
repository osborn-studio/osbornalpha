// PostgreSQL topic adapter (spec §4.9). Authenticated reads have transaction-local roles.
import type {Pool} from 'pg';
import {TopicsDbError,type TopicsDb} from './types';
import {topicDbError,topicRow,topicsAdapter,type TopicRead} from './db';
const ident=(s:string)=>{if(!/^[a-z_][a-z0-9_]*$/.test(s))throw new TopicsDbError('invalid_identifier');return `"${s}"`;};
const param=(v:unknown)=>v!==null&&typeof v==='object'?JSON.stringify(v):v;
export function pgTopicsDb(pool:Pool,opts?:{role:'authenticated'}):TopicsDb{
 const query=async(text:string,values:unknown[],isPublic=false)=>{
  if(opts?.role&&!isPublic)throw new TopicsDbError('client_unavailable');
  try{
   if(!opts?.role)return (await pool.query(text,values)).rows;
   const c=await pool.connect();
   try{await c.query('begin');await c.query('set local role authenticated');return (await c.query(text,values)).rows;}
   finally{try{await c.query('rollback');}finally{c.release();}}
  }catch(e){throw topicDbError(e);}
 };
 return topicsAdapter({
  async rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
   const entries=Object.entries(args);
   const rows=await query(`select public.${ident(name)}(${entries.map(([key],n)=>`${ident(key)} => $${n+1}`).join(',')}) as result`,entries.map(([,v])=>param(v)));
   const result=rows[0]?.result;
   return result!==null&&typeof result==='object'&&!Array.isArray(result)?topicRow<T>(result):result as T;
  },
  async read<T>(r:TopicRead):Promise<T[]>{
   const values:unknown[]=[],clauses:string[]=[];
   const bind=(v:unknown)=>{values.push(v);return `$${values.length}`;};
   for(const [key,value] of Object.entries(r.match??{}))clauses.push(value===null?`r.${ident(key)} is null`:`r.${ident(key)}=${bind(value)}`);
   if(r.live)clauses.push('v.unpublished_at is null');
   if(r.after)clauses.push(`(r.version_id,r.ordinal)>(${bind(r.after.version_id)},${bind(r.after.ordinal)})`);
   const columns=r.columns?.map(key=>'r.'+ident(key)).join(',')??'r.*';
   const text=`select ${columns} from public.${ident(r.table)} r${r.live?' join public.topic_versions v on v.version_id=r.version_id':''}${clauses.length?` where ${clauses.join(' and ')}`:''}${r.order.length?` order by ${r.order.map(k=>`r.${ident(k)} ${r.desc?'desc':'asc'}`).join(',')}`:''}${r.limit!==undefined?` limit ${bind(r.limit)}`:''}`;
   return (await query(text,values,r.public)).map(row=>topicRow<T>(row));
  },
 });
}
