// src/lib/broker-research/postgrest-stub.ts
// Test support (not a test file): a PostgREST client over in-memory view rows with a server row cap (max_rows) —
// every response holds at most `cap` rows, like a real PostgREST max_rows. Used by db.test.ts (A4) and the public
// loader test (D1) to prove that no read silently loses rows to the cap (P-R3-05, P-R4-03).
import type {SupabaseClient} from '@supabase/supabase-js';
/** PostgREST over in-memory public-view rows with a server row cap (max_rows): every response holds at most `cap` rows. */
export function cappedAnon(views:Record<string,Record<string,unknown>[]>,cap:number){
 type Row=Record<string,unknown>;type Pred=(r:Row)=>boolean;
 const from=(table:string)=>{
  const f:Pred[]=[];const ord:[string,boolean][]=[];let lo=0,hi:number|null=null,lim:number|null=null,single=false;
  const b:Record<string,(...a:unknown[])=>unknown>={
   select:()=>b,
   eq:(k,v)=>{f.push(r=>r[k as string]===v);return b;},
   is:(k,v)=>{f.push(r=>(r[k as string]??null)===v);return b;},
   in:(k,vs)=>{f.push(r=>(vs as unknown[]).includes(r[k as string]));return b;},
   contains:(k,vs)=>{   // PostgREST cs: a JSON string = jsonb @> (array of objects, each needle contained in ONE element)
    const needles=(typeof vs==='string'?JSON.parse(vs):vs) as unknown[];
    f.push(r=>needles.every(n=>((r[k as string]??[]) as unknown[]).some(e=>typeof n==='object'&&n!==null?Object.entries(n).every(([nk,nv])=>(e as Row)[nk]===nv):e===n)));return b;},
   gte:(k,v)=>{f.push(r=>String(r[k as string])>=String(v));return b;},
   lte:(k,v)=>{f.push(r=>String(r[k as string])<=String(v));return b;},
   or:(e)=>{const m=/^published_date\.lt\.([^,]+),and\(published_date\.eq\.([^,]+),report_id\.lt\.([^)]+)\)$/.exec(String(e))!;
    f.push(r=>String(r.published_date)<m[1]||(String(r.published_date)===m[2]&&String(r.report_id)<m[3]));return b;},
   order:(k,o)=>{ord.push([k as string,(o as {ascending?:boolean}|undefined)?.ascending!==false]);return b;},
   range:(a,z)=>{lo=a as number;hi=z as number;return b;},
   limit:(n)=>{lim=n as number;return b;},
   maybeSingle:()=>{single=true;return b;},
   then:(res,rej)=>{
    const rows=(views[table]??[]).filter(r=>f.every(p=>p(r))).sort((x,y)=>{for(const [k,asc] of ord){const a=String(x[k]),c=String(y[k]);if(a!==c)return (a<c?-1:1)*(asc?1:-1);}return 0;});
    const end=hi!==null?hi+1:lim!==null?lo+lim:rows.length;
    const out=rows.slice(lo,Math.min(end,lo+cap));
    return Promise.resolve({data:single?out[0]??null:out,error:null}).then(res as never,rej as never);
   },
  };
  return b;
 };
 return {from,rpc:async()=>({data:null,error:null})} as unknown as SupabaseClient;
}
