import {seriesById} from '@/lib/macro/series-registry';
import type {ResearchSource} from '@/components/research-ui/ResearchFooter';
export function registrySources(ids:readonly string[],locale:'zh'|'en'):ResearchSource[] {
 const sources=new Map<string,ResearchSource>();
 for(const id of ids){
  const source=seriesById(id)?.source;
  if(!source)continue;
  const item={publisher:source.publisher[locale],relay:source.via?.[locale]??null};
  sources.set(JSON.stringify(item),item);
 }
 return [...sources.values()];
}
/** Resolve only actual registry identifiers present in the displayed DTO. */
export function registryIdsIn(value:unknown):string[] {
 if(typeof value==='string')return seriesById(value)?[value]:[];
 if(!value||typeof value!=='object')return [];
 return [...new Set(Object.values(value).flatMap(registryIdsIn))];
}
