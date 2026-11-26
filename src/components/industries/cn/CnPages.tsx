import Link from 'next/link';
import type {ReactNode} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {PageHeader,FreshnessChip,ResearchFooter,StateBadge} from '@/components/research-ui';
import type {CnListView,CnDetailView,CnConstituentsView,VendorFreshness,RunHeader,VendorNode} from '@/lib/industry/vendor/page-read';
import {SourceDrawerProvider} from '../SourceDrawer';
import {StateNotice} from '../StateNotice';
import {SchemeSwitch} from '../SchemeLevelSwitch';
import {hrefWith,INDUSTRIES_PATH,industryPath,type Search} from '../hrefs';
import {CnListBody} from './CnList';
import {CnDetail as DetailBody} from './CnDetail';
import {CnConstituents as ConstituentsBody} from './CnConstituents';

const sic=INDUSTRIES_PATH+'?scheme=sic', sw=INDUSTRIES_PATH+'?scheme=sw2021';
const layout='mx-auto flex w-full min-w-0 max-w-[1400px] flex-col gap-5';
type PageKind='list'|'detail'|'constituents';
type PageProps<V>={view:Extract<V,{state:'ok'}>;search:Search};

function ScopeSwitch({status}:{status?:'withheld'|'preview'}){
 const t=useTranslations('industries');
 return <SchemeSwitch path={INDUSTRIES_PATH} search={{}} scheme="sw2021" swStatus={status?t(`cnList.${status}`):undefined}/>;
}

export function CnState({state,licence,kind,path,search}:{licence?:RunHeader['licence'];state:'withheld'|'empty'|'error';kind:PageKind;path:string;search:Search}){
 const t=useTranslations('industries');
 return <div className={layout}>
  <PageHeader title={t('page.title')} scope="" scopeSwitch={<ScopeSwitch status={state==='withheld'?'withheld':licence==='internal'?'preview':undefined}/>} legend={false}/>
  {licence==='internal'&&<PreviewNotice dataset={kind==='constituents'?'memberships':'financials'}/>}
  {state==='withheld'?<StateNotice kind="withheldCn">
    <Link className="rounded border border-accent px-3 py-2" href={sic}>{t('states.unlicensed.switchToSic')}</Link>
    <details className="text-text-dim"><summary className="cursor-pointer">{t('states.unlicensed.learnMore')}</summary><p className="mt-1">{t('cnDrawer.terms')}</p></details>
   </StateNotice>:state==='error'?<StateNotice kind="error" body={t('states.error.bodyNoCache')}><Link href={hrefWith(path,search,{})}>{t('states.error.retry')}</Link></StateNotice>
   :<StateNotice kind="empty" title={t('cnList.emptyTitle')} body={t(kind==='constituents'?'cnConstituents.emptyBody':'cnList.empty')}><Link href={sic}>{t('states.unlicensed.switchToSic')}</Link></StateNotice>}
 </div>;
}

function PreviewNotice({dataset}:{dataset:RunHeader['kind']}){
 const t=useTranslations('industries');
 return <StateNotice kind="adminPreview" title={t('states.adminPreviewVendor.title')} body={t('states.adminPreviewVendor.body',{dataset:t(`cnDatasets.${dataset}`)})}/>;
}

function VendorShell({kind,header,freshness,node,scope,children}:{kind:PageKind;header:RunHeader;freshness:VendorFreshness;node?:VendorNode;scope:string;children:ReactNode}){
 const t=useTranslations('industries'),english=useLocale()==='en';
 const title=node?`${node.code} ${node.nameZh}${kind==='constituents'?' · '+t('page.constituents'):''}`:t('page.title');
 return <SourceDrawerProvider><div className={layout}>
  <nav className="text-xs text-text-dim"><Link href={sw}>{t('page.title')}</Link> / {t('schemes.sw2021')} · {t('levels.1')}
   {node&&<> / <Link href={industryPath('sw2021',node.code)}>{node.code}</Link></>}{kind==='constituents'&&' / '+t('page.constituents')}</nav>
  <PageHeader title={title} altTitle={english?node?.nameEn:undefined} scope={scope} scopeSwitch={<ScopeSwitch status={header.licence==='internal'?'preview':undefined}/>} legend={false}/>
  <div className="flex flex-wrap items-center gap-2 text-xs">
   {(['financials','memberships'] as const).map(key=><span key={key} className="inline-flex items-center gap-1">{t(`cnList.${key}`)} <FreshnessChip status={freshness[key].status} asOf={freshness[key].lastOkAt?.slice(0,10)}/></span>)}
   <span>{t('cnList.valuation')} · {t('states.notServed.title')}</span>
  </div>
  {header.licence==='internal'&&<PreviewNotice dataset={header.kind}/>}
  <section id="vendor-run" className="space-y-2 rounded-lg border border-border p-3 text-xs text-text-dim">
   <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><strong>{t('cnList.run')}</strong>
    <code className="break-all">{header.runId}</code><span>{t('cnList.generation',{n:header.generation})}</span>
    <span>{t('cnList.activated')} <time className="font-mono">{header.activatedAt??t('missing.vendor_not_provided')}</time></span>
    <span>{header.kind==='financials'?t('header.grid',header.gridSize):t('cnList.industryCount',{n:header.gridSize.codes})}</span>
    <StateBadge state="reconstructed"/><span className="rounded border border-border px-1">{t('origin.vendor')}</span>
    <a href="#industry-methods">{t('header.methods')}</a>
   </div><p id="industry-methods">{t('cnList.reconstruction')}</p>
  </section>
  {children}
  <ResearchFooter sources={[{publisher:t(header.licence==='public'?'cnList.sourcePublic':'cnList.source')}]} methodsHref="#industry-methods"/>
 </div></SourceDrawerProvider>;
}

export function CnList({view,search}:PageProps<CnListView>){
 const t=useTranslations('industries');
 return <VendorShell kind="list" header={view.header} freshness={view.freshness} scope={t('cnList.scope',{n:view.nodes.length,basis:t(`cnBasis.${search.basis}`)})}>
  <CnListBody view={view} search={search}/></VendorShell>;
}
export function CnDetail({view,search}:PageProps<CnDetailView>){
 const t=useTranslations('industries');
 return <VendorShell kind="detail" node={view.node} header={view.header} freshness={view.freshness} scope={t('cnList.detailScope')}>
  <DetailBody view={view} search={search}/></VendorShell>;
}
export function CnConstituents({view,search}:PageProps<CnConstituentsView>){
 const t=useTranslations('industries');
 return <VendorShell kind="constituents" node={view.node} header={view.header} freshness={view.freshness} scope={t('cnList.membersScope')}>
  <ConstituentsBody view={view} search={search}/></VendorShell>;
}
