// src/components/industries/row-model.ts — pure decisions of IndustryRow (tested without a DOM).
import type {IssuerIndustriesView} from '@/lib/industry/read';

type Ok=Extract<IssuerIndustriesView,{state:'ok'}>;

/** An A-share whose SW scheme is not public says "licence pending" instead of showing nothing. */
export const swLicencePending=(ticker:string,data:Pick<Ok,'schemes'>)=>/\.(SH|SZ|BJ)$/i.test(ticker)&&data.schemes.some(s=>s.scheme==='sw2021'&&!s.public);
/** The row renders when there is an industry to show or a licence-pending note. */
export const rowVisible=(ticker:string,data:Pick<Ok,'schemes'|'industries'>)=>data.industries.length>0||swLicencePending(ticker,data);
