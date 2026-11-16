'use client';
// Shared public and admin preview composition using whitelisted DTOs (spec §9.1–9.3).
import {useCallback,useState} from 'react';
import Link from 'next/link';
import {useLocale,useTranslations} from 'next-intl';
import type {ReportStatus,ReviewStatus} from '@/lib/broker-research/types';
import type {ReportPageData} from '@/lib/broker-research/public-types';
import {SPREAD_WINDOW_MONTHS} from '@/lib/broker-research/public-types';
import {FactsSection} from './FactsSection';
import {SourceDrawer} from './SourceDrawer';
import type {DrawerSubject} from './SourceDrawer';
import {SummarySection} from './SummarySection';
import {SnippetsSection} from './SnippetsSection';
import {HistoryBlock} from './HistoryBlock';
import {SpreadBlock} from './SpreadBlock';
import {SettlementCallout} from './SettlementCallout';
import {institutionHref} from './ReportsTable';
import {citationFor,displayTitle,snippetsFor} from './format';
import {CALLOUT,CHIP,H1,TAG,TINY} from './ui';
export interface PreviewMeta{status:ReportStatus;reviewStatus:ReviewStatus}
export function ReportView({data,preview}:{data:ReportPageData;preview?:PreviewMeta}){
 const t=useTranslations('foreign-research.public'),locale=useLocale(),r=data.report;
 const [subject,setSubject]=useState<DrawerSubject|null>(null),[focusKey,setFocusKey]=useState(data.focusTargetKey),close=useCallback(()=>setSubject(null),[]);
 const title=displayTitle(r.title,locale),focus=r.targets.find(x=>x.targetKey===focusKey)??r.targets[0]??null;
 return <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
  {preview?null:<nav className={TINY}><Link href="/intel">{t('breadcrumb.research')}</Link> / <Link href="/intel/foreign-research">{t('breadcrumb.list')}</Link> / {t('breadcrumb.report')}</nav>}
  <header><div className="flex flex-wrap items-center gap-2">{r.institution?(preview?<span className={CHIP}>{r.institution.nameEn}</span>:<Link href={institutionHref(r.institution.id)} className={CHIP}>{r.institution.nameEn}</Link>):null}<span className={TINY}>{t('detail.published',{date:r.publishedDate??'—'})}</span>{preview?<span className={TAG}>{t('preview.status',{status:preview.status,review:preview.reviewStatus})}</span>:null}</div>
   <h1 className={H1}>{title.text}</h1>{title.rewritten?<p className={TINY}><span className={TAG}>{t('title.rewritten')}</span> {t('title.rewrittenNote')}</p>:null}{title.translated?<p className={TINY}><span className={TAG}>{t('title.translated')} · {title.modelId??'—'}</span> {t('title.translatedNote',{original:r.title.text})}</p>:null}
   <div className="flex flex-wrap gap-2">{r.targets.map(x=><button key={x.targetKey} type="button" aria-pressed={focus?.targetKey===x.targetKey} className={CHIP} onClick={()=>setFocusKey(x.targetKey)}>{x.securityTicker??x.tickerAsStated}</button>)}</div>
   {r.analysts.length?<p className={TINY}>{t('detail.analysts')}：{r.analysts.map(a=>a.displayName).join('、')}</p>:null}
  </header>
  {focus?<FactsSection report={r} target={focus} onOpen={setSubject}/>:<section className={CALLOUT}>{t('detail.noTargets')}</section>}
  <SummarySection summaries={r.summaries} targetPricePublic={r.targetPricePublic} onOpenFact={(targetKey,field,label,value)=>{const c=citationFor(r.citations,targetKey,field);setSubject({label,targetKey,value,citation:c,snippets:snippetsFor(r.snippets,c),judgment:field!=='price_at_report'});}}/>
  <SnippetsSection snippets={r.snippets} maxChars={r.licence.snippetMaxChars}/>
  {preview?<p className={CALLOUT}>{t('preview.noHistory')}</p>:focus?.securityTicker?<><HistoryBlock rows={data.history} institutionName={r.institution?.nameEn??'—'} securityTicker={focus.securityTicker} currency={focus.target?.currency??null}/><SpreadBlock rows={data.spread} securityTicker={focus.securityTicker} currency={focus.currency} windowMonths={SPREAD_WINDOW_MONTHS}/></>:null}
  <SettlementCallout/><SourceDrawer subject={subject} availableAt={r.availableAt} codeVersion={r.codeVersion} rulesVersion={r.rulesVersion} publicationId={focus?.publicationId??null} onClose={close}/>
 </div>;
}
