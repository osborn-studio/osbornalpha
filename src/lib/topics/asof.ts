// Topic replay selection and staleness (spec §6.2, A5, A15).
import {TopicError} from './errors';
export type AsOfPick={kind:'ok';version_no:number}|{kind:'no_version'}|{kind:'unpublished';version_no:number};
export function versionAtAsOf(versions:readonly {version_no:number;published_at:string;unpublished_at:string|null}[],asOf:string,today:string):AsOfPick{
 const ms=Date.parse(`${asOf}T00:00:00Z`);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==asOf||asOf>today)throw new TopicError('invalid_parameter:asOf');
 const end=Date.parse(`${asOf}T23:59:59.999Z`);
 const candidate=versions.filter(v=>Date.parse(v.published_at)<=end).sort((a,b)=>b.version_no-a.version_no)[0];
 if(!candidate)return {kind:'no_version'};
 return {kind:candidate.unpublished_at===null?'ok':'unpublished',version_no:candidate.version_no};
}
export const ageDays=(publishedAt:string,now:Date):number=>Math.floor((now.getTime()-Date.parse(publishedAt))/86_400_000);
export const DRIFT_STALE_HOURS=72;
export const driftUnchecked=(checkedAt:string|null,now:Date):boolean=>checkedAt===null||now.getTime()-Date.parse(checkedAt)>DRIFT_STALE_HOURS*3_600_000;
