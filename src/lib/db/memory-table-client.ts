// In-memory TableClient for unit tests. Optional `keys` declares ONE unique key (the primary key)
// per table so duplicate inserts, key-changing updates and upserts fail like PostgreSQL would
// (TableError code 23505); an upsert whose onConflict is not exactly that key set fails with
// 42P10 like PostgreSQL's "no unique constraint matching ON CONFLICT". Rows are deep-copied in
// and out so callers never share jsonb references with the store.
// Differences from PostgreSQL to keep in mind:
//  - no column defaults, generated values, triggers or check constraints: write every column;
//  - ordering and range filters (gte/lt) compare numbers numerically and everything else as
//    strings by UTF-16 code unit, which matches PostgreSQL only under C collation (ISO-8601
//    timestamps in one fixed format compare correctly; mixed offsets or locales do not).
import {TableError,assertMatch,assertUpdateMatch,checkRangeOptions,checkSelectOptions} from './table-client';
import type {RangeOptions,Row,TableClient} from './table-client';

const matches=(row:Row,match:Row)=>Object.entries(match).every(([k,v])=>row[k]===v);
const clone=<T>(v:T):T=>structuredClone(v);
const cmp=(x:unknown,y:unknown)=>{
 if(typeof x==='number'&&typeof y==='number')return x<y?-1:x>y?1:0;
 const a=String(x),b=String(y);return a<b?-1:a>b?1:0;
};
// PostgreSQL default: NULLS LAST ascending, NULLS FIRST descending.
const compare=(k:string,desc:boolean)=>(a:Row,b:Row)=>{
 const x=a[k],y=b[k];
 if(x==null||y==null)return x==null&&y==null?0:x==null?(desc?-1:1):(desc?1:-1);
 const c=cmp(x,y);return desc?-c:c;
};
// SQL comparison with NULL is never true, so null/missing values are excluded.
const inRange=(row:Row,opts:RangeOptions)=>
 Object.entries(opts.gte??{}).every(([k,v])=>row[k]!=null&&cmp(row[k],v)>=0)&&
 Object.entries(opts.lt??{}).every(([k,v])=>row[k]!=null&&cmp(row[k],v)<0);

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
  async update(t,match,patch){
   assertUpdateMatch(match);
   const rows=rowsOf(t);
   const next=rows.map(r=>matches(r,match)?{...r,...clone(patch)}:r);
   // Check every resulting key before mutating any row, so a clash leaves the table unchanged.
   if(keys[t]){const seen=new Set<string>();for(const r of next){const k=keyOf(t,r);if(seen.has(k))throw dup('update',t);seen.add(k);}}
   let n=0;
   rows.forEach((r,i)=>{if(next[i]!==r){Object.assign(r,next[i]);n++;}});
   return n;
  },
  async select(t,match,opts={}){
   assertMatch(match);checkSelectOptions(opts);
   let out=rowsOf(t).filter(r=>matches(r,match)&&inRange(r,opts));
   if(opts.orderBy)out=[...out].sort(compare(opts.orderBy,!!opts.desc));
   if(opts.offset)out=out.slice(opts.offset);
   if(opts.limit!==undefined)out=out.slice(0,opts.limit);
   return clone(out);
  },
  async count(t,match,opts={}){
   assertMatch(match);checkRangeOptions(opts);
   return rowsOf(t).filter(r=>matches(r,match)&&inRange(r,opts)).length;
  },
  async upsert(t,row,onConflict){
   const cols=onConflict.split(',').map(s=>s.trim());
   if(keys[t]){
    const declared=new Set(keys[t]);
    if(cols.length!==declared.size||!cols.every(c=>declared.has(c)))
     throw new TableError('upsert',t,'there is no unique or exclusion constraint matching the ON CONFLICT specification','42P10');
   }
   const rows=rowsOf(t);const hit=rows.find(r=>cols.every(c=>r[c]===row[c]));
   if(clashes(t,{...hit,...row},hit))throw dup('upsert',t);
   if(hit)Object.assign(hit,clone(row));else rows.push(clone(row));
  },
 };
}
