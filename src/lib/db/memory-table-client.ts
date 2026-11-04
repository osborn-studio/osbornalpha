// In-memory TableClient for unit tests. Optional `keys` declares primary keys per table so
// duplicate inserts fail like PostgreSQL would.
import type {Row,SelectOptions,TableClient} from './table-client';

const matches=(row:Row,match:Row)=>Object.entries(match).every(([k,v])=>row[k]===v);

export function memoryTableClient(keys:Record<string,string[]>={}):TableClient&{rows(table:string):Row[]}{
 const tables=new Map<string,Row[]>();
 const rowsOf=(t:string)=>{if(!tables.has(t))tables.set(t,[]);return tables.get(t)!;};
 const keyOf=(t:string,row:Row)=>(keys[t]??[]).map(k=>String(row[k])).join('\u0000');
 return {
  rows:(t)=>rowsOf(t).map(r=>({...r})),
  async insert(t,row){
   const rows=rowsOf(t);
   if(keys[t]&&rows.some(r=>keyOf(t,r)===keyOf(t,row)))throw new Error(`duplicate key value violates unique constraint "${t}_pkey"`);
   const copy={...row};rows.push(copy);return {...copy};
  },
  async update(t,match,patch){for(const r of rowsOf(t))if(matches(r,match))Object.assign(r,patch);},
  async select(t,match,opts={}){
   let out=rowsOf(t).filter(r=>matches(r,match)).map(r=>({...r}));
   if(opts.orderBy){const k=opts.orderBy;out.sort((a,b)=>(a[k] as number)<(b[k] as number)?-1:(a[k] as number)>(b[k] as number)?1:0);if(opts.desc)out.reverse();}
   if(opts.limit)out=out.slice(0,opts.limit);
   return out;
  },
  async upsert(t,row,onConflict){
   const cols=onConflict.split(',').map(s=>s.trim());
   const rows=rowsOf(t);const hit=rows.find(r=>cols.every(c=>r[c]===row[c]));
   if(hit)Object.assign(hit,row);else rows.push({...row});
  },
 };
}
