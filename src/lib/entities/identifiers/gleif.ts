// src/lib/entities/identifiers/gleif.ts
// Stage A (spec §4.1.1): GLEIF ISIN↔LEI mapping (`LEI,ISIN` CSV, public domain). The ~300 MB file
// is pre-filtered line by line (filterGleifLines) and the kept lines go through the landed
// selectIsinsForLeis, which validates the header (invalid_schema). The subset is rendered
// deterministically (sorted, deduplicated, check-digit valid) so its sha256 is stable evidence for
// reconcile-raw. Bond ISINs are kept here: stage B (OpenFIGI) judges the security type.
import {createHash} from 'node:crypto';
import {selectIsinsForLeis} from '../../research/entity-keys/parsers';
import {isValidIsin} from '../../research/entity-keys/identifiers';

export const GLEIF_HEADER='LEI,ISIN';
export const GLEIF_URL='https://mapping.gleif.org/api/v2/isin-lei/latest/download';
export interface GleifSubset{csv:string;sha256:string;byLei:Map<string,string[]>;missing:string[];invalidIsins:string[]}

const stripBom=(s:string)=>s.charCodeAt(0)===0xfeff?s.slice(1):s;

/** Streams the file, yielding the header (BOM/CR stripped) and the lines whose LEI is wanted. */
export async function* filterGleifLines(lines:AsyncIterable<string>,leis:ReadonlySet<string>):AsyncGenerator<string>{
 let first=true;
 for await(const raw of lines){
  const line=raw.replace(/\r$/,'');
  if(first){first=false;yield stripBom(line);continue;}
  const comma=line.indexOf(',');
  if(comma>0&&leis.has(line.slice(0,comma)))yield line;
 }
}

/** Header + candidate lines → validated subset. Throws invalid_schema (landed parser) on a wrong or missing header. */
export function subsetForLeis(lines:Iterable<string>,leis:ReadonlySet<string>):GleifSubset{
 const {found}=selectIsinsForLeis(lines,new Set(leis));
 const byLei=new Map<string,string[]>();
 const invalidIsins:string[]=[];
 for(const lei of Object.keys(found).sort()){
  const isins=[...new Set(found[lei].map(s=>s.trim().toUpperCase()))].sort().filter(i=>{
   if(isValidIsin(i))return true;
   invalidIsins.push(`${lei},${i}`);return false;
  });
  if(isins.length)byLei.set(lei,isins);
 }
 const csv=[GLEIF_HEADER,...[...byLei].flatMap(([lei,isins])=>isins.map(i=>`${lei},${i}`))].join('\n')+'\n';
 return {csv,sha256:createHash('sha256').update(csv,'utf8').digest('hex'),byLei,missing:[...leis].filter(l=>!byLei.has(l)).sort(),invalidIsins:invalidIsins.sort()};
}

/** Replays a stored subset (every LEI in it). */
export function parseGleifCsv(csv:string):Map<string,string[]>{
 const lines=stripBom(csv).split('\n').map(l=>l.replace(/\r$/,'')).filter((l,i)=>i===0||l!=='');
 const leis=new Set(lines.slice(1).map(l=>{const c=l.indexOf(',');return c<0?l:l.slice(0,c);}));
 return subsetForLeis(lines,leis).byLei;
}
