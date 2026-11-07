// Calendar helpers for period_end (spec §4.2: day = the date, month = last day of the month, quarter =
// last day of the quarter). Pure UTC date arithmetic on ISO YYYY-MM-DD strings; no Date parsing of
// local time. Shared by parsers (period_end of a source row), derive (month_end, yoy) and later tasks.
import type {PeriodKind} from './types';

const ISO=/^(\d{4})-(\d{2})-(\d{2})$/;
const pad=(n:number,w=2)=>String(n).padStart(w,'0');
/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isIsoDate(s:string):boolean{
 const m=ISO.exec(s);if(!m)return false;
 const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
 return mo>=1&&mo<=12&&d>=1&&d<=daysInMonth(y,mo);
}
export function daysInMonth(year:number,month:number):number{return new Date(Date.UTC(year,month,0)).getUTCDate();}
/** Last day of month (month 1..12). */
export function monthEnd(year:number,month:number):string{
 if(!Number.isInteger(year)||!Number.isInteger(month)||month<1||month>12)throw new Error('invalid_month');
 return `${pad(year,4)}-${pad(month)}-${pad(daysInMonth(year,month))}`;
}
/** Last day of quarter (q 1..4). */
export function quarterEnd(year:number,q:number):string{
 if(!Number.isInteger(q)||q<1||q>4)throw new Error('invalid_quarter');
 return monthEnd(year,q*3);
}
/** period_end of the period containing `date` for the series' period kind. */
export function periodEndOf(date:string,period:PeriodKind):string{
 if(!isIsoDate(date))throw new Error(`invalid_date:${date.slice(0,20)}`);
 const y=Number(date.slice(0,4)),m=Number(date.slice(5,7));
 return period==='day'?date:period==='month'?monthEnd(y,m):quarterEnd(y,Math.ceil(m/3));
}
/** Month end n months after the month of `date` (n may be negative). */
export function shiftMonthEnd(date:string,n:number):string{
 if(!isIsoDate(date)||!Number.isInteger(n))throw new Error('invalid_shift');
 const total=Number(date.slice(0,4))*12+Number(date.slice(5,7))-1+n;
 return monthEnd(Math.floor(total/12),(total%12+12)%12+1);
}
/** 'YYYY-MM' of an ISO date. */
export const monthKey=(date:string)=>date.slice(0,7);
