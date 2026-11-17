import {MACRO_CATALOG} from './catalog';
import {DISPLAY_CATALOG} from './display-catalog';
import type {AnySeriesDef} from './display-catalog';
import type {Adapter,Region} from './types';
export const ALL_SERIES:readonly AnySeriesDef[]=Object.freeze([...MACRO_CATALOG,...DISPLAY_CATALOG]);
const byId=new Map<string,AnySeriesDef>();
for(const def of ALL_SERIES){if(byId.has(def.id))throw new Error(`duplicate_series:${def.id}`);byId.set(def.id,def);}
const displayIds=new Set(DISPLAY_CATALOG.map(d=>d.id));
export const seriesById=(id:string):AnySeriesDef|undefined=>byId.get(id);
export const isDisplayOnly=(id:string):boolean=>displayIds.has(id);
export const collectableSeriesOf=(adapter:Adapter):AnySeriesDef[]=>ALL_SERIES.filter(d=>d.status==='active'&&!d.derive&&!d.aliasOf&&d.source?.adapter===adapter);
export const derivedSeriesOf=(region:Region):AnySeriesDef[]=>ALL_SERIES.filter(d=>d.region===region&&d.status==='active'&&d.derive);
