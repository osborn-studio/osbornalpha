import type {VendorSource} from '@/lib/industry/vendor/page-read';
import type {Locale} from '@/lib/industry/display';
import type {Translate} from '../cell-text';
import type {VendorDrawerPayload} from '../drawer-model';
import {formatCell} from './format';

type Row={key:string;label:string;value:string};
type Section={id:'identity'|'source'|'times'|'transform'|'licence'|'links'|'inputs';rows:Row[]};
type View={title:string;sha:string|null;sections:Section[]};

export function adaptVendorDrawer(p:VendorDrawerPayload,locale:Locale,t:Translate):View {
 const tr=(key:string)=>t(`cnDrawer.${key}`);
 const unavailable=t('missing.vendor_not_provided');
 const row=(key:string,value:string|null|undefined):Row=>({key,label:tr(key),value:value||unavailable});
 const source=p.kind==='vendor_membership'?p.row.source:p.cell.source;
 const sha=source?.sha256??null;
 const hash=row('sha',sha?`${sha.slice(0,12)}…${sha.slice(-12)}`:null);
 const publisher=row('publisher',tr('gildata'));
 const locator=(s:VendorSource|null)=>{
  if(!s?.locator)return unavailable;
  const {block,row,column}=s.locator;
  return t('cnDrawer.blockRow',{block,row})+(column?` · ${column}`:'');
 };
 if(p.kind==='vendor_membership')return {
  title:`${p.row.securityName} · ${p.row.securityCode} ∈ ${p.nodeName}`,sha,sections:[
   {id:'source',rows:[publisher,row('sourceRow',locator(source)),hash]},
   {id:'times',rows:[row('snapshot',source?.fetchedAt),row('entryDate',unavailable),row('memberSince',tr('datingUnavailable'))]},
  ],
 };
 const {cell,header}=p;
 const metric=t(`cnMetrics.${cell.metric}`);
 const title=`${p.nodeName} · ${metric}`;
 const value=row('value',formatCell(cell,locale,t));
 if(p.kind==='vendor_derived'){
  const [current,base]=p.derived.inputs;
  const priorEnd=base?.periodEnd??String(Number(current.periodEnd.slice(0,4))-1)+current.periodEnd.slice(4);
  return {title,sha:null,sections:[
   {id:'identity',rows:[value,row('window',`${priorEnd} → ${current.periodEnd}`)]},
   {id:'transform',rows:[row('formula','(V_t ÷ V_t−1y − 1) × 100'),row('formulaVersion',p.derived.formula),row('rule',tr('missingRule'))]},
   {id:'inputs',rows:[]},
  ]};
 }
 return {title,sha,sections:[
  {id:'identity',rows:[row('industry',`${p.nodeName} · ${cell.code}`),row('metric',metric),row('period',cell.periodEnd),value]},
  {id:'source',rows:[publisher,row('product',source?.product==='datamap-mcp'?tr('datamap'):source?.product),row('interface',source?.interface),
   row('dataset',source?`${tr('templateNote')} · ${source.template.id}/${source.template.version}`:tr('templateUnavailable')),
   row('locator',locator(source)),hash,row('url',tr('noUrl'))]},
  {id:'times',rows:[row('period',cell.periodEnd),row('asOf',unavailable),row('fetched',source?.fetchedAt),row('activated',header.activatedAt)]},
  {id:'transform',rows:[row('parser',header.parserVersion),row('mapping',header.mappingVersion),row('method','vendor-reported/1'),
   row('codeVersion',header.codeVersion),row('aggregation',tr('notPublished'))]},
  {id:'licence',rows:[row('status',tr('internal')),row('attribution',tr('notRecorded')),row('note',tr('terms'))]},
  {id:'links',rows:[]},
 ]};
}
