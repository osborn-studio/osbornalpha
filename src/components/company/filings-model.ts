// src/components/company/filings-model.ts
// Pure model of the filings view (plan 2026-11-06 Task 13; spec §5.5, §10.3).
import type {FilingSummary,Market} from '@/lib/company/types';

export const LINK_FAILED_ATTEMPTS=5;
const CN_TYPES=new Set(['annual','semiannual','q1','q3','restatement']);
export function typeLabel(f:FilingSummary,market:Market):{key:string}|{text:string}{
 if(market==='US')return {text:f.formType};
 return {key:CN_TYPES.has(f.formType)?f.formType:'other'};
}
export function fiscalLabel(f:FilingSummary):string{return [f.fiscalYear??'',f.fiscalPeriod??''].join(' ').trim()||'—';}
export type CitationBadge={kind:'edgar'|'linked';href:string|null}|{kind:'pending'}|{kind:'failed';attempts:number};
export function citationBadge(f:FilingSummary):CitationBadge{
 if(f.citation==='edgar')return {kind:'edgar',href:f.url};
 if(f.citation==='linked')return {kind:'linked',href:f.documentUrl};
 return f.linkAttempts>=LINK_FAILED_ATTEMPTS?{kind:'failed',attempts:f.linkAttempts}:{kind:'pending'};
}
/** "Original" target: document first, then the filing URL; pending filings have none (spec §5.5). */
export function originalHref(f:FilingSummary):string|null{return f.citation==='pending'?null:f.documentUrl??f.url??null;}
