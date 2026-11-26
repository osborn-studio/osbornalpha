import Link from 'next/link';
import {useLocale,useTranslations} from 'next-intl';
import {MarkTag} from '@/components/research-ui';
import type {CnDetailView} from '@/lib/industry/vendor/page-read';
import {LinkMenu,LinkSegment} from '../SchemeLevelSwitch';
import {SourceButton} from '../SourceDrawer';
import {StateNotice} from '../StateNotice';
import {vendorCellPayload} from '../drawer-model';
import {constituentsPath,hrefWith,industryPath,nodeName,type Search} from '../hrefs';
import {MembershipTable} from './CnConstituents';
import {CnSeries} from './CnSeries';
import {OriginTag} from './OriginTag';
import {formatCell} from './format';

type Detail=Extract<CnDetailView,{state:'ok'}>;

function SeriesSection({view,search}:{view:Detail;search:Search}) {
 const t=useTranslations('industries');
 const metrics=Object.keys(t.raw('cnMetrics'));
 const metric=view.series[0]?.metric??(metrics.includes(search.metric??'')?search.metric!:'revenue_yoy');
 const path=industryPath('sw2021',view.node.code);
 const options=(key:string,values:string[],group:string)=>values.map(value=>({
  value,label:t(`${group}.${value}`),href:hrefWith(path,search,{[key]:value}),
 }));
 const unavailable=(value:string,label:string)=>({value,label:`${label} · ${t('states.notYetAvailable.title')}`,href:'',disabled:true});
 const tableOnly=search.view==='table';
 return <section className="card-base min-w-0 space-y-4">
  <div className="flex flex-wrap items-center gap-2">
   <h2 className="font-semibold">{t('cnDetail.series')}</h2><MarkTag kind="fact"/>
   <OriginTag derived={metric==='revenue_yoy'}/>
  </div>
  <div className="flex flex-wrap items-center gap-2">
   <LinkMenu label={t('controls.metric')} current={metric} options={[
    ...options('metric',metrics,'cnMetrics'),unavailable('cagr',t('cnDetail.cagr')),
   ]}/>
   <LinkSegment label={t('controls.basis')} current={search.basis==='quarter'?'quarter':'annual'} options={[
    ...options('basis',['annual','quarter'],'cnBasis'),unavailable('single',t('cnBasis.single')),
   ]}/>
   <LinkSegment label={t('controls.window')} current={['5y','all'].includes(search.window??'')?search.window!:'10y'} options={options('window',['5y','10y','all'],'windows')}/>
   <LinkSegment label={t('controls.view')} current={tableOnly?'table':'chart'} options={[
    {value:'chart',label:t('controls.chartAndTable'),href:hrefWith(path,search,{view:'chart'})},
    {value:'table',label:t('controls.tableOnly'),href:hrefWith(path,search,{view:'table'})},
   ]}/>
  </div>
  <CnSeries points={view.series} metric={metric} node={view.node} header={view.header} tableOnly={tableOnly}/>
 </section>;
}

export function CnDetail({view,search}:{view:Detail;search:Search}) {
 const t=useTranslations('industries');
 const locale=useLocale()==='en'?'en':'zh';
 const {node,header,latest,constituents}=view;
 const name=nodeName(node,locale);
 return <>
  <section className="card-base space-y-3">
   <div className="flex flex-wrap items-center gap-2">
    <h2 className="font-semibold">{t('cnDetail.latest')}</h2><MarkTag kind="fact"/>
   </div>
   <p className="text-xs text-text-dim">{t('cnDetail.latestNote')}</p>
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
    {latest.map(cell=><SourceButton key={cell.metric} payload={vendorCellPayload(name,cell,header)} className="flex min-w-0 flex-col items-start gap-2 border border-border bg-bg-elevated p-3 text-left">
     <span className="font-sans text-xs text-text-dim">{t(`cnMetrics.${cell.metric}`)} · {cell.metric==='member_count'?cell.periodEnd:`FY${cell.periodEnd.slice(0,4)}`}</span>
     <span className="break-words text-sm font-semibold sm:text-lg">{formatCell(cell,locale,t)}</span>
     <OriginTag derived={cell.derived!==null}/>
    </SourceButton>)}
   </div>
  </section>
  <SeriesSection view={view} search={search}/>
  {(['cnDetail.valuation','cnDetail.prosperity','cnDetail.judgments'] as const).map(section=><section key={section} className="card-base space-y-3">
   <div className="flex items-center gap-2"><h2 className="font-semibold">{t(section)}</h2><MarkTag kind={section==='cnDetail.judgments'?'judgment':'fact'}/></div>
   {section==='cnDetail.judgments'?<StateNotice kind="noJudgment" body={t('cnDetail.noJudgment')}/>:<StateNotice kind="notServed" body={t(`${section}Body`)}/>}
  </section>)}
  <section className="card-base space-y-3">
   <div className="flex flex-wrap items-center gap-2">
    <h2 className="font-semibold">{t('cnDetail.preview')}</h2><MarkTag kind="fact"/>
    {constituents && <span className="text-xs text-text-dim">{t('cnDetail.snapshot',{total:constituents.total,date:constituents.header.fetchedTo.slice(0,10)})}</span>}
    <Link href={constituentsPath('sw2021',node.code)} className="ml-auto text-sm">{t('cnDetail.allMembers')} →</Link>
   </div>
   {constituents?.preview.length?<>
    <MembershipTable rows={constituents.preview} header={constituents.header} node={node}/>
    <p className="text-xs text-text-dim">{t('cnDetail.previewNote')}</p>
   </>:<p className="text-sm text-text-dim">{t(constituents?'cnConstituents.noRows':'cnConstituents.emptyBody')}</p>}
  </section>
 </>;
}
