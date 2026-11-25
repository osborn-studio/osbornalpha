import Link from 'next/link';
import {useLocale,useTranslations} from 'next-intl';
import type {CnListView,VendorCell} from '@/lib/industry/vendor/page-read';
import {MarkTag} from '@/components/research-ui';
import {hrefWith,INDUSTRIES_PATH,industryPath,nodeName,type Search} from '../hrefs';
import {LinkSegment} from '../SchemeLevelSwitch';
import {SourceButton} from '../SourceDrawer';
import {vendorCellPayload} from '../drawer-model';
import {StateNotice} from '../StateNotice';
import {OriginTag} from './OriginTag';
import {formatCell} from './format';
import {heatStep} from './heat-model';

type View=Extract<CnListView,{state:'ok'}>;
const choices=['revenue_yoy','net_income_parent_yoy','gross_margin','roe_avg'];
const url=(search:Search,patch:Search)=>hrefWith(INDUSTRIES_PATH,search,{scheme:'sw2021',...patch});

function PeriodStepper({periods,current,search}:{periods:string[];current:string|undefined;search:Search}){
 const t=useTranslations('industries');
 const index=current?periods.indexOf(current):-1;
 return <nav aria-label={t('cnList.period')} className="flex items-center justify-between sm:hidden">
  {([-1,0,1] as const).map(delta=>{
   if(delta===0)return <strong key={delta} className="font-mono">{current}</strong>;
   const period=periods[index+delta],label=t(delta<0?'controls.prev':'controls.next');
   return period?<Link key={delta} className="p-2" href={url(search,{period})}>{label}</Link>:<span key={delta} aria-disabled="true" className="p-2 text-text-muted">{label}</span>;
  })}
 </nav>;
}
function Legend(){
 const t=useTranslations('industries');
 return <div className="hidden items-center gap-1 text-xs text-text-dim sm:flex">{t('cnList.negative')}
  {['n4','n3','n2','n1','zero','p1','p2','p3','p4'].map(step=>step==='zero'?<span key={step}>0</span>:<i key={step} aria-hidden="true" className="h-3 w-4 rounded-sm" data-heat={step}/>)}
  {t('cnList.positive')} <span className="rounded border border-dashed border-border px-1">{t('cnList.missing')}</span></div>;
}
function Grid({view,search,table}:{view:View;search:Search;table:boolean}){
 const t=useTranslations('industries'),locale=useLocale()==='en'?'en':'zh';
 const {nodes,periodEnds,cells,header}=view;
 const current=periodEnds.includes(search.period??'')?search.period:periodEnds.at(-1);
 const byKey=new Map(cells.map(c=>[c.code+'/'+c.periodEnd,c]));
 const col=(end:string)=>end===current?'table-cell':'hidden sm:table-cell';
 function button(cell:VendorCell,name:string,member=false){
  const value=formatCell(cell,locale,t,!member);
  return <SourceButton payload={vendorCellPayload(name,cell,header)} label={t('heatmap.cellTitle',{industry:name,period:cell.periodEnd,metric:t(`cnMetrics.${cell.metric}`),value})}
   className="w-full px-1 py-1.5 text-xs"><span data-heat={member||table?undefined:heatStep(cell.valueText)} className="block rounded px-1 py-1">
    {cell.valueText===null?<>{t('cnList.missing')}<small className="block">{t(`missing.${cell.missingReason}`)}</small></>:value}</span></SourceButton>;
 }
 return <section aria-label={t(table?'table.label':'heatmap.label')} className="card-base min-w-0 space-y-3">
  <header className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{t(`cnMetrics.${search.metric}`)} · {t(`cnBasis.${search.basis}`)}</h2>
   <MarkTag kind="fact"/><OriginTag derived={search.metric==='revenue_yoy'}/>
   {!table&&<Legend/>}
  </header>
  <PeriodStepper periods={periodEnds} current={current} search={search}/>
  <div className="max-w-full overflow-x-auto"><table className="w-full text-left text-sm" data-cn-grid={table?'table':'heatmap'}>
   <thead className="text-xs text-text-dim"><tr><th>{t('table.industry')}</th><th>{t('cnMetrics.member_count')}</th>
    {periodEnds.map(end=><th key={end} className={`${col(end)} text-center font-mono`}>{search.basis==='annual'?'FY'+end.slice(0,4):end}</th>)}
    {table&&<th className="hidden sm:table-cell">{t('table.source')}</th>}</tr></thead>
   <tbody>{nodes.map(n=>{
    const name=nodeName(n,locale),last=periodEnds.at(-1),source=last?byKey.get(n.code+'/'+last):undefined;
    return <tr key={n.code} className="border-t border-border"><th scope="row" className="py-1.5 pr-2 font-normal"><Link href={industryPath('sw2021',n.code)}>{name}<small className="block font-mono text-text-dim">{n.code}</small></Link></th>
     <td className="text-center">{n.members?button(n.members,name,true):t('missing.vendor_not_provided')}</td>
     {periodEnds.map(end=>{const cell=byKey.get(n.code+'/'+end)!;return <td key={end} className={col(end)}>{button(cell,name)}</td>;})}
     {table&&<td className="hidden sm:table-cell">{source&&<SourceButton payload={vendorCellPayload(name,source,header)}>{t('table.sourceButton')}</SourceButton>}</td>}</tr>;
   })}</tbody>
  </table></div>
  {!table&&<p className="text-xs text-text-dim">{t('cnList.caption')}</p>}
 </section>;
}

export function CnListBody({view,search}:{view:View;search:Search}){
 const t=useTranslations('industries');
 const requested=search.view??search.display;
 const mode=requested==='table'||requested==='stages'?requested:'heatmap';
 const options=(key:string,values:string[],group:string)=>values.map(value=>({value,label:t(`${group}.${value}`),href:url(search,{[key]:value})}));
 return <>
  <div className="flex flex-wrap items-center gap-2">
   <span className="text-xs text-text-dim">{t('levels.1')}</span>
   <LinkSegment label={t('controls.metric')} current={search.metric!} options={options('metric',choices,'cnMetrics')}/>
   <LinkSegment label={t('controls.basis')} current={search.basis!} options={[...options('basis',['annual','quarter'],'cnBasis'),
    {value:'single',label:t('cnBasis.single')+' · '+t('states.notYetAvailable.title'),href:'#',disabled:true}]}/>
   <LinkSegment label={t('controls.view')} current={mode==='stages'?'stages':'grid'} options={['grid','stages'].map(value=>({value,label:t(`cnList.${value}`),href:url(search,{view:value==='grid'?'heatmap':'stages'})}))}/>
   {mode!=='stages'&&<div className="hidden sm:block"><LinkSegment label={t('cnList.display')} current={mode} options={options('view',['heatmap','table'],'controls')}/></div>}
  </div>
  {mode==='stages'?<StateNotice kind="noStageMethod"/>:<Grid view={view} search={search} table={mode==='table'}/>}
  <section className="space-y-2"><h2 className="text-lg font-semibold">{t('valuation.title')}</h2><StateNotice kind="notServed"/></section>
  <section className="space-y-2"><h2 className="text-lg font-semibold">{t('cnList.judgments')} <MarkTag kind="judgment"/></h2><StateNotice kind="noJudgment" body={t('cnList.judgmentBody')}/></section>
 </>;
}
