// In-memory TableClient for unit tests. Optional `keys` declares primary keys per table so
// duplicate inserts and upserts fail like PostgreSQL would (TableError code 23505). Rows are
// deep-copied in and out so callers never share jsonb references with the store.
import {TableError,checkSelectOptions} from './table-client';
import type {Row,TableClient} from './table-client';

const matches=(row:Row,match:Row)=>Object.entries(match).every(([k,v])=>row[k]===v);
const clone=<T>(v:T):T=>structuredClone(v);
// PostgreSQL default: NULLS LAST ascending, NULLS FIRST descending.
const compare=(k:string,desc:boolean)=>(a:Row,b:Row)=>{
 const x=a[k] as number,y=b[k] as number;
 if(x==null||y==null)return x==null&&y==null?0:x==null?(desc?-1:1):(desc?1:-1);
 const c=x<y?-1:x>y?1:0;return desc?-c:c;
};

export function memoryTableClient(keys:Record<string,string[]>={}):TableClient&{rows(table:string):Row[]}{
 const tables=new Map<string,Row[]>();
 const rowsOf=(t:string)=>{if(!tables.has(t))tables.set(t,[]);return tables.get(t)!;};
 const keyOf=(t:string,row:Row)=>(keys[t]??[]).map(k=>String(row[k])).join('\u0000');
 const dup=(op:string,t:string)=>new TableError(op,t,`duplicate key value violates unique constraint "${t}_pkey"`,'23505');
 const clashes=(t:string,row:Row,except?:Row)=>!!keys[t]&&rowsOf(t).some(r=>r!==except&&keyOf(t,r)===keyOf(t,row));
 return {
  rows:(t)=>clone(rowsOf(t)),
  async insert(t,row){
   if(clashes(t,row))throw dup('insert',t);
   const copy=clone(row);rowsOf(t).push(copy);return clone(copy);
  },
  async update(t,match,patch){let n=0;for(const r of rowsOf(t))if(matches(r,match)){Object.assign(r,clone(patch));n++;}return n;},
  async select(t,match,opts={}){
   checkSelectOptions(opts);
   let out=rowsOf(t).filter(r=>matches(r,match));
   if(opts.orderBy)out=[...out].sort(compare(opts.orderBy,!!opts.desc));
   if(opts.offset)out=out.slice(opts.offset);
   if(opts.limit!==undefined)out=out.slice(0,opts.limit);
   return clone(out);
  },
  async count(t,match){return rowsOf(t).filter(r=>matches(r,match)).length;},
  async upsert(t,row,onConflict){
   const cols=onConflict.split(',').map(s=>s.trim());
   const rows=rowsOf(t);const hit=rows.find(r=>cols.every(c=>r[c]===row[c]));
   if(clashes(t,{...hit,...row},hit))throw dup('upsert',t);
   if(hit)Object.assign(hit,clone(row));else rows.push(clone(row));
  },
 };
}
