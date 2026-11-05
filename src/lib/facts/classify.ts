// src/lib/facts/classify.ts
// Period → duration (spec §4.3): the day count end − start falls in one of four bands, instants
// (no start) are INSTANT, everything else is 'odd' and the caller quarantines odd_duration. No
// fiscal-quarter number is assigned here; that is a judgment, not a disclosure.
import type {Duration} from './types';

export const DURATION_BANDS:readonly {duration:Exclude<Duration,'INSTANT'>;min:number;max:number}[]=[
 {duration:'3M',min:75,max:105},{duration:'6M',min:165,max:200},{duration:'9M',min:255,max:290},{duration:'12M',min:350,max:380},
];
const DAY=86_400_000;

/** Calendar date YYYY-MM-DD that round-trips (rejects 2023-02-30), as a UTC timestamp; null otherwise. */
export function dateMs(s:string):number|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
 const t=Date.parse(`${s}T00:00:00Z`);
 return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s?t:null;
}
export const isDate=(s:unknown):s is string=>typeof s==='string'&&dateMs(s)!==null;

/** Whole days from start to end (end − start); null when either date is invalid. */
export function daysBetween(start:string,end:string):number|null{
 const a=dateMs(start),b=dateMs(end);
 return a===null||b===null?null:Math.round((b-a)/DAY);
}

export function classifyDuration(start:string|null,end:string):Duration|'odd'{
 if(dateMs(end)===null)return 'odd';
 if(start===null)return 'INSTANT';
 const days=daysBetween(start,end);
 if(days===null||days<=0)return 'odd';
 return DURATION_BANDS.find(b=>days>=b.min&&days<=b.max)?.duration??'odd';
}
