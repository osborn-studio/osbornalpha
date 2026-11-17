// Pure facts provenance mapping. Citation gates are not licences.
import type {SourceDrawerInput} from '@/components/research-ui';
import {companyHref,type FactSeriesResponse} from '@/lib/company/client';
import type {WithheldReason} from '@/lib/company/types';
import {defaultSelected,drawerRows,filingLink,scaleExpFor,type DrawerRow,type SeriesKey} from './drawer-model';
import {companyExchangePublisher} from './company-sources';
import {divisorLabel,formatScaled} from './format';

export type CompanyDrawerText=(key:string,values?:Record<string,string|number>)=>string;
export const naturalKey=(key:SeriesKey)=>[key.concept,key.periodStart??key.periodEnd,key.periodEnd,key.unit??''].join('|');
export function withheldDrawerInput(title:string,reason:WithheldReason,text:CompanyDrawerText,id=title):SourceDrawerInput {
 return {variant:'withheld',kind:'financial_fact',identity:{id,label:title},reason:{code:reason,text:text(reason==='citation_pending'?'reasonPending':'reasonIncomplete')}};
}
export function transformText(row:DrawerRow,concept:string,exp:number,t:CompanyDrawerText):string {
 return [t('tMap',{source:row.entry.sourceConcept,concept,version:row.entry.mappingVersion,gen:row.entry.mappingGen}),row.evidence?.unitRule?t('tUnit',{rule:row.evidence.unitRule}):t('tUnitNone'),exp?t('tScale',{divisor:divisorLabel(exp)}):t('tScaleNone')].join(' ');
}
export function disclosureDrawerInput({ticker,key,data,selected,scaleExp,asOf,conceptLabel,text:t}:{ticker:string;key:SeriesKey|null;data:FactSeriesResponse|null;selected:DrawerRow|null;scaleExp:number;asOf:string|null;conceptLabel:string;text:CompanyDrawerText}):SourceDrawerInput {
 const period=key?`${key.periodStart??key.periodEnd} → ${key.periodEnd}`:'';
 const title=key?`${conceptLabel} ${key.concept} · ${period}`:ticker;
 if(!selected&&data?.series.length&&data.series.every(e=>e.kind==='withheld'))selected=drawerRows(data,scaleExp).at(-1)??null;
 if(selected?.entry.kind==='withheld')return withheldDrawerInput(title,selected.entry.reason,t,key?naturalKey({...key,unit:selected.entry.unit}):title);
 const rows=data?drawerRows(data,scaleExp).sort((a,b)=>a.entry.availableDate.localeCompare(b.entry.availableDate)||(a.entry.disclosureSeq??0)-(b.entry.disclosureSeq??0)):[];
 const latest=[...rows].reverse().find(r=>r.entry.kind==='fact');
 const evidence=selected?.evidence, snapshot=evidence?.snapshot, filing=selected?data?.filings[selected.entry.filingId]:null;
 const gate=filing?.citation==='edgar'?'edgar':filing?.citation==='linked'?'linked':'';
 const publishers:Record<string,string>={edgar:'SEC EDGAR'};
 const publisher=snapshot?(data?.market==='US'?'SEC EDGAR':snapshot.source==='tushare'?companyExchangePublisher(ticker):publishers[snapshot.source]??''):'';
 const pdf=evidence?.locator.pdf;
 const locator=evidence?[evidence.locator.hashLocator,evidence.locator.jsonPointer,evidence.locator.field,pdf?`page ${pdf.page} · ${pdf.table??''} · ${pdf.row} · ${pdf.column}`:null].filter(Boolean).join(' · ')||null:null;
 const exp=scaleExpFor(latest?.entry.unit??key?.unit??null,scaleExp);
 return {variant:'ok',payload:{kind:'financial_fact',identity:{id:selected?.entry.factId??(key?naturalKey(key):ticker),label:`${ticker} · ${title}`},
  source:{publisher,adapter:snapshot?[snapshot.source,snapshot.api].filter(Boolean).join(' · '):'',url:filingLink(filing)??evidence?.sourceDocument?.url??null,locator,evidence_sha256:snapshot?.sha256??null},
  times:{period,available_at:selected?.entry.availableDate??'',ingested_at:snapshot?.capturedAt??null},
  transform:{code_version:evidence?.run.codeVersion??null,mapping_version:selected?`${selected.entry.mappingVersion} · gen ${selected.entry.mappingGen}`:null,method_version:null},
  licence:{status:gate,note_key:gate==='edgar'?'citationEdgar':gate==='linked'?'citationLinked':'citationUnknown'},attribution_key:'citationAttribution',links:{module_href:companyHref(ticker,{view:'statements',asOf})}},
  extras:{title,period,mark:'fact',...(asOf?{as_of:asOf}:{}),...(latest?.valueText!==null&&latest?.valueText!==undefined?{value:`${formatScaled(latest.valueText,exp)} ${latest.entry.unit} · ${exp?t('displayTransform',{divisor:divisorLabel(exp)}):t('displayRaw')}`} : {}),
   relay:snapshot?.source==='tushare'?'Tushare':null,evidence_href:snapshot?.download??undefined,
   transform_label:selected?transformText(selected,key?.concept??'',scaleExpFor(selected.entry.unit,scaleExp),t):undefined,
   rows:{source:[{key:'issuer',label:t('issuer'),value:data?`${data.issuerId} · ${ticker}`:ticker},{key:'concept',label:t('concept'),value:key?`${conceptLabel} ${key.concept}`:''},{key:'filing',label:t('colFiling'),value:filing?`${filing.formType} ${filing.sourceRef}`:'',href:filingLink(filing)??undefined}]},
   revisions:rows.map(r=>({period,value:r.entry.kind==='withheld'?t(r.entry.reason==='citation_pending'?'reasonPending':'reasonIncomplete'):`${formatScaled(r.entry.value,scaleExpFor(r.entry.unit,scaleExp))} ${r.entry.unit}`,available:r.entry.availableDate,version:`#${r.entry.disclosureSeq??'—'}${r.entry.isCurrent===null?'':` · ${t(r.entry.isCurrent?'currentDisclosure':'supersededDisclosure')}`}`,current:r.entry.factId===defaultSelected(rows)})),
   states:rows.at(-1)?.entry.isRevision?['revised']:[],
  }};
}
