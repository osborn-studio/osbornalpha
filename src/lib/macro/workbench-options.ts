// src/lib/macro/workbench-options.ts
// Server-side options for the correlation form (spec §3.4): active monthly indicators and assets from the catalog.
// Built in the server page and passed to the client, so client bundles never import catalog.ts.
import {MACRO_CATALOG} from './catalog';
import type {Bilingual,Region} from './types';
export interface SeriesOption{id:string;region:Region;name:Bilingual}
export function correlationOptions():{indicators:SeriesOption[];assets:SeriesOption[]}{
 const usable=MACRO_CATALOG.filter(d=>d.status==='active'&&d.period==='month');
 const opt=(role:'indicator'|'asset')=>usable.filter(d=>d.role===role).map(d=>({id:d.id,region:d.region,name:d.name}));
 return {indicators:opt('indicator'),assets:opt('asset')};
}
