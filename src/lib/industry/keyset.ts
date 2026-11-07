/**
 * Industry keyset paging helper (industry spec §4.10, §18 #16). Plan 2's `facts/scope.ts::keysetAll` is left
 * untouched for plan-2 callers; this version differs in how it ends: it reads until a page has nothing new, never
 * on a short page (a server may cap pages below MAX_PAGE), and it THROWS `scope_tie_group_overflow` whenever a
 * non-empty page yields nothing new while a full page was requested (a tie group that cannot advance) — it never
 * silently truncates.
 *
 * Pages on `orderBy` (not unique); after every page restarts from the last value INCLUSIVE (gte) so rows tied with
 * the boundary are re-read from their first row; `keyCols` de-duplicate.
 */
import {MAX_PAGE} from '../db/table-client';
import type {RangeOptions,Row,TableClient} from '../db/table-client';

export async function industryKeysetAll(tables:TableClient,table:string,match:Row,range:RangeOptions,orderBy:string,keyCols:string[]):Promise<Row[]>{
 const seen=new Set<string>(),out:Row[]=[];
 let cursor:string|null=null;
 for(;;){
  const gte={...range.gte,...(cursor===null?{}:{[orderBy]:cursor})};
  const page=await tables.select(table,match,{...range,gte,orderBy,limit:MAX_PAGE});
  let fresh=0;
  for(const r of page){const k=keyCols.map(c=>String(r[c])).join('\u0000');if(!seen.has(k)){seen.add(k);out.push(r);fresh++;}}
  if(page.length===0)return out;
  // a non-empty page with nothing new: either the natural end (inclusive restart re-read only the boundary rows)
  // or a tie group the cap cannot step past. A page of MAX_PAGE rows with nothing new is the latter; fail loudly.
  if(fresh===0){
   if(page.length>=MAX_PAGE)throw new Error('scope_tie_group_overflow');
   return out;
  }
  cursor=String(page[page.length-1][orderBy]);
 }
}
