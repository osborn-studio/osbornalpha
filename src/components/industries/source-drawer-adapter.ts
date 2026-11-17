// Pure presentation adapter. Server display decisions also govern drawer values.
import type {SourceDrawerInput,SourceDrawerPayload,DrawerRow} from '@/components/research-ui/source-drawer/types';
import {unifiedState} from '@/components/research-ui/states';
import {formatMetricValue,formatMoney,formatValuation,type Locale} from '@/lib/industry/display';
import {schemeDatasetKey,SCHEME_VERSION} from '@/lib/industry/licenses';
import industryMessages from '../../../messages/en/industries.json';
import type {DrawerPayload} from './drawer-model';
import {coverageOf,factEvidenceUrl} from './drawer-model';
import {cellPresentation,type Translate} from './cell-text';
import {industryPath,stockPath,INDUSTRIES_PATH} from './hrefs';

export function adaptSourceDrawer(p:DrawerPayload,locale:Locale,t:Translate,options:{unlicensed?:boolean}={}):SourceDrawerInput|null{
 if(p.kind==='membership')return null;
 const fact=p.kind==='fact';
 const kind=fact?'financial_fact':'industry_metric';
 const id=fact?p.fact.factId:`${p.kind==='aggregate'?p.header.runId:p.runId}:${p.code}:${p.cell.metric}:${p.kind==='aggregate'?`${p.cell.periodEnd}:${p.cell.duration}`:p.cell.tradeDate}`;
 const label=fact?`${p.issuerName} · ${p.fact.concept}`:`${p.code} ${p.nodeName} · ${t(`metrics.${p.cell.metric}`)}`;
 const identity={id,label};
 if(options.unlicensed||(p.kind==='aggregate'&&(p.cell.display as string)==='unlicensed'))return {variant:'withheld',kind,identity,reason:{code:'unlicensed',text:t('drawer.licenceNote')}};
 const row=(key:string,labelKey:string,value:string|null|undefined):DrawerRow=>({key,label:t(labelKey),value:value??'—',mono:true});
 if(p.kind==='fact'){
  const f=p.fact;
  const payload:SourceDrawerPayload={kind,identity,source:{publisher:t(f.unit==='USD'?'sources.edgar_companyfacts':'sources.tushare_statements'),adapter:f.unit==='USD'?'EDGAR companyfacts':'Tushare statements',url:factEvidenceUrl(p.ticker,f.factId),locator:f.filingId,evidence_sha256:f.rawHash},times:{period:f.periodEnd,available_at:f.availableDate,ingested_at:null},transform:{code_version:null,mapping_version:null,method_version:null},licence:{status:'public',note_key:'drawer.licenceNote'},attribution_key:'drawer.attribution',links:{module_href:p.ticker?stockPath(p.ticker):INDUSTRIES_PATH}};
  return {variant:'ok',payload,extras:{title:label,value:formatMoney(f.value,f.unit,locale),period:f.periodEnd,mark:'fact',rows:{source:[row('concept','drawer.concept',f.concept),row('filing','drawer.filingId',f.filingId)]}}};
 }
 const aggregate=p.kind==='aggregate';
 const header=aggregate?p.header:null;
 const c=p.cell;
 const period=aggregate?p.cell.periodEnd:p.cell.tradeDate;
 const dataset=schemeDatasetKey(p.scheme,SCHEME_VERSION[p.scheme]);
 const payload:SourceDrawerPayload={kind,identity,source:{publisher:t(p.scheme==='sic'?'sources.edgar_companyfacts':'sources.tushare_statements'),adapter:p.scheme==='sic'?'SEC submissions / EDGAR companyfacts':'Tushare',url:null,locator:aggregate?`${p.code}:${p.cell.metric}:${p.cell.duration}`:`${p.code}:${p.cell.metric}`,evidence_sha256:c.manifestHash},times:{period,available_at:c.updatedAt??'',ingested_at:null},transform:{code_version:header?.codeVersion??null,mapping_version:null,method_version:header?.methodVersion??(!aggregate?p.methodVersion??null:null)},licence:{status:p.preview?'internal':'public',note_key:'drawer.licenceNote'},attribution_key:'drawer.attribution',links:{module_href:industryPath(p.scheme,p.code)}};
 const coverage=aggregate?coverageOf(p.cell):{n:c.nWithData,d:c.nMembers===null||c.nUnresolved===null?null:c.nMembers+c.nUnresolved};
 const source=[row('run','drawer.runId',header?.runId??(!aggregate?p.runId:null)),row('scheme','controls.scheme',t(`schemes.${p.scheme}`)),row('code','table.code',p.code),row('cell','drawer.concept',t(`metrics.${c.metric}`)),row('coverage','table.coverage',`${coverage.n??'—'}/${coverage.d??'—'}`),row('unresolved','detail.unresolved',String(c.nUnresolved??'—'))];
 const transform=[row('formula','drawer.formula',t(`${p.scheme==='sic'&&Object.hasOwn(industryMessages.formulasSic,c.metric)?'formulasSic':'formulas'}.${c.metric}`))];
 if(header){source.push(row('history','drawer.historyClass',t(`historyClass.${header.historyClass}`)));transform.push(row('config','detail.configHash',header.configHash),row('formulaVersion','detail.formulaVersion',header.formulaVersion));}
 const presentation=aggregate?cellPresentation(p.cell,p.cell.metric,locale,t):null;
 const states=header?.historyClass==='reconstruction'?[unifiedState('reconstruction')!]:[];
 if(presentation?.state)states.push(presentation.state);
 if(presentation?.detail)source.push(row('display','table.value',presentation.detail));
 const value=aggregate?(p.cell.display==='value'&&p.cell.value!==null?formatMetricValue(p.cell.metric,p.cell.value,locale,p.cell.unit):undefined):formatValuation(p.cell.metric,p.cell.value,locale);
 return {variant:'ok',payload,extras:{title:label,value,period,mark:'fact',as_of:header?.factsAsOf??(!aggregate?p.cell.factsAsOf:undefined),states,rows:{source,transform,licence:[row('dataset','drawer.dataset',dataset)]}}};
}
