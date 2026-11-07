// src/lib/industry/stale-views.ts
// The pages' "last good response" memory (spec §11), keyed by query and tagged with the licence dataset
// key it was read under. Per instance, bounded (200), expiring (2 h). page-data.ts serves an entry only
// after re-confirming the dataset is public; the admin licence switch calls forgetViews(key) so a revoke
// drops every remembered view of that dataset at once (Codex plan audit round 1 #2).
import type {DatasetKey} from './types';

export const STALE_MAX_MS=2*3_600_000;
const MAX_REMEMBERED=200;
const views=new Map<string,{view:unknown;at:string;datasetKey:DatasetKey}>();

export function rememberView(key:string,view:unknown,datasetKey:DatasetKey,now:Date):void{
 views.delete(key);views.set(key,{view,at:now.toISOString(),datasetKey});
 if(views.size>MAX_REMEMBERED){const oldest=views.keys().next().value;if(oldest!==undefined)views.delete(oldest);}
}
/** The remembered entry when it exists and has not expired (an expired entry is dropped). */
export function rememberedView(key:string,now:Date):{view:unknown;at:string;datasetKey:DatasetKey}|null{
 const v=views.get(key);
 if(!v)return null;
 if(now.getTime()-Date.parse(v.at)>STALE_MAX_MS){views.delete(key);return null;}
 return v;
}
export const forgetView=(key:string)=>{views.delete(key);};
/** Drops every remembered view of one dataset (licence change), or everything. */
export function forgetViews(datasetKey?:DatasetKey):void{
 if(datasetKey===undefined){views.clear();return;}
 for(const [k,v] of views)if(v.datasetKey===datasetKey)views.delete(k);
}
