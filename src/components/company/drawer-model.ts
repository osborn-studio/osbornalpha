// src/components/company/drawer-model.ts
// Pure model of the disclosure-history drawer (plan 2026-11-06 Task 12; spec §5.6, §0 #62, #68).
// Revision differences are the server's exact entry.delta / entry.relChange (Task 9), formatted only (计划第 3 轮审计 R3).
import {companyApi,type FactKeyRow,type FactSeriesResponse,type SeriesEntry} from '@/lib/company/client';
import type {EvidenceDto,FilingSummary} from '@/lib/company/types';
import {formatPercent,formatScaled,signed,unitKindOfUnit} from './format';

export interface SeriesKey{concept:string;periodStart:string|null;periodEnd:string;unit:string|null}
export type Revision={kind:'first'}|{kind:'same'}|{kind:'withheld'}|{kind:'diff';abs:string;rel:string|null};
export interface DrawerRow{entry:SeriesEntry;valueText:string|null;revision:Revision;codeVersion:string|null;evidence:EvidenceDto|null}

// 计划第 3 轮审计 R3: revision differences come from the server's entry.delta / entry.relChange, which
// Task 9 nulls after a withheld predecessor; the drawer never recomputes across a withheld disclosure.
export function drawerRows(r:FactSeriesResponse,scaleExp:number):DrawerRow[]{
 return r.series.map((entry,i)=>{
  const evidence=r.evidence[entry.factId]??null;
  const codeVersion=evidence?.run.codeVersion?.slice(0,7)??null;
  if(entry.kind==='withheld')return {entry,valueText:null,revision:{kind:'withheld'},codeVersion,evidence};
  let revision:Revision;
  if(i===0)revision={kind:'first'};
  else if(entry.delta===null)revision={kind:'withheld'};
  else if(entry.isRevision)revision={kind:'diff',abs:signed(formatScaled(entry.delta,scaleExp)),rel:entry.relChange===null?null:signed(formatPercent(entry.relChange,4))};
  else revision={kind:'same'};
  return {entry,valueText:entry.value,revision,codeVersion,evidence};
 });
}
/** The evidence block shows the latest non-withheld row by default. */
export function defaultSelected(rows:DrawerRow[]):string|null{
 for(let i=rows.length-1;i>=0;i--)if(rows[i].valueText!==null)return rows[i].entry.factId;
 return null;
}
export function factsRequest(ticker:string,k:SeriesKey,asOf:string|null,admin:boolean):string{
 return companyApi('facts',ticker,{concept:k.concept,periodStart:k.periodStart??k.periodEnd,periodEnd:k.periodEnd,unit:k.unit,asOf},admin);
}
export function keyFromFactRow(f:FactKeyRow):SeriesKey{return {concept:f.concept,periodStart:f.periodStart??f.periodEnd,periodEnd:f.periodEnd,unit:f.unit};}
export function filingLink(f:FilingSummary|undefined|null):string|null{
 if(!f)return null;
 if(f.citation==='edgar')return f.url;
 if(f.citation==='linked')return f.documentUrl;
 return null;
}
const str=(v:unknown)=>v==null?'—':typeof v==='object'?JSON.stringify(v):String(v);
export function evidenceFields(d:EvidenceDto):[string,string][]{
 const pdf=d.locator.pdf;
 return [
  ['rawHash',d.rawHash],['snapshot.source',d.snapshot.source],['snapshot.sha256',d.snapshot.sha256],['snapshot.path',d.snapshot.path],
  ['snapshot.api',str(d.snapshot.api)],['snapshot.url',str(d.snapshot.url)],['snapshot.params',str(d.snapshot.params)],['snapshot.capturedAt',str(d.snapshot.capturedAt)],
  ['snapshot.httpStatus',str(d.snapshot.httpStatus)],['snapshot.page',str(d.snapshot.page)],
  ['locator.hashLocator',d.locator.hashLocator],['locator.jsonPointer',d.locator.jsonPointer],['locator.field',str(d.locator.field)],
  ['locator.pdf',pdf?`page ${pdf.page} · ${pdf.table??'—'} · ${pdf.row} · ${pdf.column}`:'—'],
  ['run.runId',d.run.runId],['run.codeVersion',str(d.run.codeVersion)],['run.toolVersions',str(d.run.toolVersions)],
  ['mappingVersion',d.mappingVersion],['unitRule',str(d.unitRule)],
 ];
}
/** Display exponent of a series: the page scale applies to money units only (shares, per-share, pure stay raw). */
export function scaleExpFor(unit:string|null,scaleExp:number):number{return unit!==null&&unitKindOfUnit(unit)==='money'?scaleExp:0;}
/** Evidence + row view of an other-unit entry (no revision chain: delta/relChange are always null there). */
export function otherUnitRows(r:FactSeriesResponse):DrawerRow[]{
 return r.otherUnitSeries.map(entry=>({entry,valueText:entry.kind==='fact'?entry.value:null,revision:entry.kind==='withheld'?{kind:'withheld'}:{kind:'first'},codeVersion:r.evidence[entry.factId]?.run.codeVersion?.slice(0,7)??null,evidence:r.evidence[entry.factId]??null}));
}
