// src/app/(app)/intel/industries/[scheme]/[code]/page.tsx
// Industry detail (spec §8.3; canvas "Detail", "M-Detail", "States"): 1 title (Chinese name + code
// in both locales for SW), run header; 2 member summary (unresolved as a count) → constituents;
// 3 aggregate series: metric / basis / window / view selectors, SVG line + table equivalent (table
// only below 640px); 4 valuation (published cells only; "not enabled" in this plan); 5 judgment area
// (F4 cards behind INDUSTRY_JUDGMENTS_ENABLED); 6 methods & sources. Unknown code → notFound().
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getLocale,getTranslations} from 'next-intl/server';
import {JudgmentArea} from '@/components/industries/JudgmentArea';
import {RunHeaderBar} from '@/components/industries/RunHeaderBar';
import {LinkSegment} from '@/components/industries/SchemeLevelSwitch';
import {SeriesChart} from '@/components/industries/SeriesChart';
import {SourceDrawerProvider} from '@/components/industries/SourceDrawer';
import {SourcesFooter} from '@/components/industries/SourcesFooter';
import {StateNotice} from '@/components/industries/StateNotice';
import {ValuationSnapshot} from '@/components/industries/ValuationSnapshot';
import {INDUSTRIES_PATH,constituentsPath,flatSearch,hrefWith,industryPath,nodeName} from '@/components/industries/hrefs';
import {industrySubjectKey,judgmentsEnabled} from '@/lib/industry/judgment-contract';
import {codeOfPath,detailQueryFromSearch,loadView,schemeOfPath} from '@/lib/industry/page-data';
import {AGG_METRICS,METRIC_DURATIONS,industryDetailView} from '@/lib/industry/read';

export const dynamic='force-dynamic';

export default async function IndustryDetailPage({params,searchParams}:{params:Promise<{scheme:string;code:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const raw=await params;
  const scheme=schemeOfPath(raw.scheme),code=codeOfPath(raw.code);
  if(!scheme||!code)notFound();
  const search=flatSearch(await searchParams);
  const q=detailQueryFromSearch(scheme,code,search);
  const {metric,duration,tableOnly,...query}=q;
  const load=await loadView(`detail:${JSON.stringify(query)}`,deps=>industryDetailView(deps,query),{scheme});
  const t=await getTranslations('industries');
  const locale=(await getLocale())==='en'?'en':'zh';
  const v=load.view;
  if(v?.state==='unknown_industry')notFound();
  const path=industryPath(scheme,code);
  return (
    <SourceDrawerProvider>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-5" data-page="industries-detail">
        <div className="text-xs text-text-dim"><Link href="/intel">{t('page.breadcrumbResearch')}</Link> / <Link href={hrefWith(INDUSTRIES_PATH,{},{scheme:scheme==='sw2021'?undefined:scheme})}>{t('page.breadcrumbIndustries')}</Link>{v?.state==='ok'&&<> / {t(`schemes.${scheme}`)} · {t(`levels.${v.node.level}`)} · {nodeName(v.node,locale)}</>}</div>
        {load.error&&<StateNotice kind="error" body={load.staleAt?t('states.error.body',{at:load.staleAt.replace('T',' ').slice(0,16)}):t('states.error.bodyNoCache')}><Link href={hrefWith(path,search,{})}>{t('states.error.retry')}</Link></StateNotice>}
        {v?.state==='unlicensed'&&<StateNotice kind="unlicensed" values={{scheme:t(`schemes.${scheme}`)}}><Link href={hrefWith(INDUSTRIES_PATH,{},{scheme:'sic'})}>{t('states.unlicensed.switchToSic')}</Link></StateNotice>}
        {v?.state==='ok'&&(
          <>
            {load.preview&&<StateNotice kind="adminPreview" values={{dataset:v.datasetKey}} />}
            <section className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-2">
                <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight">{nodeName(v.node,locale)} <span className="font-mono text-xl font-medium text-text-dim">{v.node.code}</span></h1>
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-dim">
                  <span className="rounded-[4px] border border-border px-2 py-0.5">{t(`schemes.${scheme}`)}</span>
                  <span className="rounded-[4px] border border-border px-2 py-0.5">{t(`levels.${v.node.level}`)}</span>
                  {scheme==='sw2021'&&locale==='en'&&<span>{t('detail.namesNote')}</span>}
                  {scheme==='sic'&&<span className="rounded-[4px] border border-warn px-2 py-0.5 text-warn">{t('stock.currentOnly')}</span>}
                </div>
              </div>
            </section>
            <RunHeaderBar header={v.header} freshness={v.freshness} />
            {v.header?.historyClass==='reconstruction'&&<StateNotice kind="reconstruction" />}
            {v.freshness==='stale'&&v.header&&<StateNotice kind="stale" values={{date:v.header.factsAsOf}} />}
            <section className="card-base flex flex-wrap items-center gap-8" aria-label={t('detail.summary')}>
              <div><div className="text-[10px] uppercase tracking-wide text-text-dim">{t('detail.members')}</div><div className="font-mono text-[22px] font-medium tabular-nums">{v.members.count}</div></div>
              {scheme==='sw2021'&&<div><div className="text-[10px] uppercase tracking-wide text-text-dim">{t('detail.unresolved')}</div><div className="font-mono text-[22px] font-medium tabular-nums">{v.members.unresolved}</div></div>}
              <div><div className="text-[10px] uppercase tracking-wide text-text-dim">{t('detail.lastAddition')}</div><div className="font-mono text-[22px] font-medium tabular-nums">{v.members.lastAddition??'—'}</div></div>
              {v.children.length>0&&<div><div className="text-[10px] uppercase tracking-wide text-text-dim">{t('detail.children')}</div><div className="font-mono text-[22px] font-medium tabular-nums">{v.children.length}</div></div>}
              <Link href={constituentsPath(scheme,code)} className="ml-auto rounded-md border border-border px-3 py-2 text-sm text-text hover:border-[var(--border-active)] hover:no-underline">{t('detail.viewConstituents')} →</Link>
            </section>
            <section className="card-base flex flex-col gap-4" aria-label={t('detail.series')}>
              <h2 className="text-lg font-semibold">{t('detail.series')}</h2>
              {!v.aggregated||!v.header?<StateNotice kind="empty" body={t('detail.notAggregated')} />:(
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <LinkSegment label={t('controls.metric')} current={metric} options={AGG_METRICS.map(m=>({value:m,label:t(`metrics.${m}`),href:hrefWith(path,search,{metric:m,duration:undefined})}))} />
                    <LinkSegment label={t('controls.basis')} current={duration} options={METRIC_DURATIONS[metric].map(d=>({value:d,label:t(`durations.${d}`),href:hrefWith(path,search,{duration:d})}))} />
                    <LinkSegment label={t('controls.window')} current={q.window} options={(['5y','10y','all'] as const).map(w=>({value:w,label:t(`windows.${w}`),href:hrefWith(path,search,{window:w==='10y'?undefined:w})}))} />
                    <LinkSegment label={t('controls.view')} current={tableOnly?'table':'chart'} options={[{value:'chart',label:t('controls.chartAndTable'),href:hrefWith(path,search,{view:undefined})},{value:'table',label:t('controls.tableOnly'),href:hrefWith(path,search,{view:'table'})}]} />
                  </div>
                  <SeriesChart scheme={scheme} node={v.node} metric={metric} header={v.header} preview={v.preview} tableOnly={tableOnly}
                    points={v.periodEnds.filter(pe=>duration!=='12M'||pe.endsWith('-12-31')).map(pe=>({periodEnd:pe,cell:v.series.find(c=>c.periodEnd===pe&&c.metric===metric&&c.duration===duration)??null}))} />
                </>
              )}
            </section>
            {scheme==='sw2021'&&<ValuationSnapshot scheme={scheme} nodes={[v.node]} block={v.valuation} preview={v.preview} title="titleDetail" />}
            <JudgmentArea enabled={judgmentsEnabled()} subjectKey={scheme==='sw2021'?industrySubjectKey(scheme,'2021',code):null} />
            <details className="card-base" open>
              <summary className="cursor-pointer text-lg font-semibold">{t('detail.methods')}</summary>
              <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-y-2">
                <dt className="text-text-dim">{t('drawer.method')}</dt><dd className="m-0 font-mono text-xs">{v.method.methodVersion} · {t('detail.configHash')} {v.method.configHash.slice(0,8)} · {t('detail.formulaVersion')} {v.method.formulaVersion??'—'}</dd>
                <dt className="text-text-dim">{t('detail.methodConfig')}</dt><dd className="m-0 min-w-0"><code className="block whitespace-pre-wrap break-all text-xs text-text-dim">{JSON.stringify(v.method.config)}</code></dd>
                <dt className="text-text-dim">{t('detail.schemeSource')}</dt><dd className="m-0">{scheme==='sw2021'?t('detail.schemeSourceSw'):t('detail.schemeSourceSic')}</dd>
                <dt className="text-text-dim">{t('detail.availabilityAssumption')}</dt><dd className="m-0">{scheme==='sw2021'?t('detail.availabilitySw'):t('detail.availabilitySic')}</dd>
                <dt className="text-text-dim">{t('detail.licence')}</dt><dd className="m-0"><span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs">{v.datasetKey} · {v.preview?'internal':'public'}</span></dd>
                <dt className="text-text-dim">{t('detail.codeVersion')}</dt><dd className="m-0 font-mono text-xs">{v.method.codeVersion?.slice(0,7)??'—'}</dd>
              </dl>
            </details>
            <SourcesFooter sources={v.sources} />
          </>
        )}
      </div>
    </SourceDrawerProvider>
  );
}
