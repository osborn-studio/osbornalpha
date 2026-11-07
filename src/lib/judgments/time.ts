// src/lib/judgments/time.ts
// Date and instant arithmetic of the judgment layer (spec §3.4, §3.7 S08). Dates are 'YYYY-MM-DD',
// periods 'YYYY-MM', instants toISOString() UTC. EXCHANGE_CLOSE is F4's own map: forward.ts keeps
// EXCHANGE_TZ private and is not changed; time.test.ts asserts both agree through exchangeDate().
// closeInstantUtc converts the local close with Intl, so DST comes from the platform tz database.
// settleWindowOf is the TS twin of the SQL helpers public.judgments_settle_after /
// public.judgments_grace_days in 20261109150000_judgments.sql (plan 契约补充 结算窗口算术):
// session_index → base_date + n days; date → the date; period → first day of the next month;
// fiscal_period → period_end + 1; settle_by = settle_after + grace_days. Change both together.
import {JudgmentError} from './errors';
import type {Horizon,PriceMarket,Target} from './types';

export const EXCHANGE_CLOSE:Readonly<Record<PriceMarket,{tz:string;close:string}>>={A:{tz:'Asia/Shanghai',close:'15:00'},HK:{tz:'Asia/Hong_Kong',close:'16:00'},US:{tz:'America/New_York',close:'16:00'}};
export const DEFAULT_GRACE_DAYS:Readonly<Record<Horizon['unit'],number>>={trading_sessions:60,calendar_days:30,calendar_months:30,fiscal_quarters:120};
const DAY=86_400_000;
const DATE=/^(\d{4})-(\d{2})-(\d{2})$/;
const PERIOD=/^(\d{4})-(\d{2})$/;
const invalid=(what:string,v:unknown):never=>{throw new JudgmentError('invalid_parameter',`${what}:${String(v)}`);};

function ymd(date:string):[number,number,number]{
 const m=typeof date==='string'?DATE.exec(date):null;
 if(!m)return invalid('date',date);
 const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
 const t=new Date(Date.UTC(y,mo-1,d));
 if(y<1000||t.getUTCFullYear()!==y||t.getUTCMonth()!==mo-1||t.getUTCDate()!==d)return invalid('date',date);
 return [y,mo,d];
}
function ym(period:string):[number,number]{
 const m=typeof period==='string'?PERIOD.exec(period):null;
 const y=Number(m?.[1]),mo=Number(m?.[2]);
 if(!m||y<1000||mo<1||mo>12)return invalid('period',period);
 return [y,mo];
}
const dayOf=(ms:number)=>new Date(ms).toISOString().slice(0,10);

export function isIsoDate(v:unknown):v is string{
 if(typeof v!=='string')return false;
 try{ymd(v);return true;}catch{return false;}
}
export function endOfUtcDay(date:string):string{ymd(date);return `${date}T23:59:59.999Z`;}
export function addDaysIso(date:string,n:number):string{
 if(!Number.isSafeInteger(n))invalid('days',n);
 const [y,m,d]=ymd(date);return dayOf(Date.UTC(y,m-1,d)+n*DAY);
}
export function addMonthsPeriod(period:string,n:number):string{
 if(!Number.isSafeInteger(n))invalid('months',n);
 const [y,m]=ym(period);const t=y*12+(m-1)+n;const ny=Math.floor(t/12);const nm=t-ny*12+1;
 return `${String(ny).padStart(4,'0')}-${String(nm).padStart(2,'0')}`;
}
export function monthEndIso(period:string):string{const [y,m]=ym(period);return dayOf(Date.UTC(y,m,0));}

const formats=new Map<string,Intl.DateTimeFormat>();
/** The wall clock of instant `ms` in `tz`, read back as if it were UTC (ms). */
function wallClock(ms:number,tz:string):number{
 let f=formats.get(tz);
 if(!f){f=new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});formats.set(tz,f);}
 const p:Record<string,number>={};
 for(const x of f.formatToParts(new Date(ms)))if(x.type!=='literal')p[x.type]=Number(x.value);
 return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
}
/** UTC instant of the exchange close on local trading date `date` (two-step offset fix-up). */
export function closeInstantUtc(date:string,market:PriceMarket):string{
 const c=EXCHANGE_CLOSE[market];
 if(!c)return invalid('market',market);
 const [y,m,d]=ymd(date);const [hh,mm]=c.close.split(':').map(Number);
 const local=Date.UTC(y,m-1,d,hh,mm);
 let t=local-(wallClock(local,c.tz)-local);
 t=local-(wallClock(t,c.tz)-t);
 return new Date(t).toISOString();
}

export function graceDaysOf(params:Record<string,number|string>,horizon:Horizon):number{
 const g=params.grace_days;
 if(g===undefined){const d=DEFAULT_GRACE_DAYS[horizon.unit];return d===undefined?invalid('horizon_unit',horizon.unit):d;}
 const n=typeof g==='number'?g:/^\d+$/.test(g)?Number(g):Number.NaN;
 if(!Number.isSafeInteger(n)||n<1)return invalid('grace_days',g);
 return n;
}
export function settleAfterDate(target:Target):string{
 switch(target.kind){
  case 'session_index':return addDaysIso(target.base_date,target.n);
  case 'date':ymd(target.date);return target.date;
  case 'period':return addDaysIso(monthEndIso(target.period),1);
  case 'fiscal_period':return addDaysIso(target.period_end,1);
  default:return invalid('target_kind',(target as {kind?:unknown}).kind);
 }
}
export function settleWindowOf(target:Target,horizon:Horizon,params:Record<string,number|string>):{settle_after:string;settle_by:string}{
 const d=settleAfterDate(target);
 return {settle_after:`${d}T00:00:00.000Z`,settle_by:`${addDaysIso(d,graceDaysOf(params,horizon))}T00:00:00.000Z`};
}
