// src/components/industries/row-model.ts — pure decisions of IndustryRow (tested without a DOM).
import {DISPLAY_MIN_MEMBERS_SIC} from '@/lib/industry/method-constants';
import type {IssuerIndustriesView} from '@/lib/industry/read';

type Ok=Extract<IssuerIndustriesView,{state:'ok'}>;

/** An A-share whose SW scheme is not public says "licence pending" instead of showing nothing. */
export const swLicencePending=(ticker:string,data:Pick<Ok,'schemes'>)=>/\.(SH|SZ|BJ)$/i.test(ticker)&&data.schemes.some(s=>s.scheme==='sw2021'&&!s.public);
/** The row renders when there is an industry to show or a licence-pending note. */
export const rowVisible=(ticker:string,data:Pick<Ok,'schemes'|'industries'>)=>data.industries.length>0||swLicencePending(ticker,data);

/** SIC snapshot rows: latest bucket's members, then code; absent rows stay navigable. */
export function orderSicRows<T extends {code:string}>(nodes:T[],cells:readonly {code:string;periodEnd:string;nMembers:number}[]):T[]{
 const latest=new Map<string,{periodEnd:string;nMembers:number}>();
 for(const c of cells){const old=latest.get(c.code);if(!old||c.periodEnd>old.periodEnd)latest.set(c.code,c);}
 return [...nodes].sort((a,b)=>{
  const an=latest.get(a.code)?.nMembers??0,bn=latest.get(b.code)?.nMembers??0;
  return Number(BigInt(bn)>=BigInt(DISPLAY_MIN_MEMBERS_SIC))-Number(BigInt(an)>=BigInt(DISPLAY_MIN_MEMBERS_SIC))||bn-an||(a.code<b.code?-1:a.code>b.code?1:0);
 });
}
