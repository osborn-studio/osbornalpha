// src/app/(app)/intel/industries/page.tsx
// Industry list (spec §8.2; canvas "Main", "List-Table", "States", "M-List"). Server component:
// selectors are search params (scheme, level, metric, duration, view), data comes from the read model
// over the anon client (RLS licence gate) or, for an admin on an unlicensed scheme, the flagged
// internal preview. States: error (with the last good view when there is one), unlicensed, empty,
// stale, reconstruction, SIC navigation. Every number is a source-drawer button; the heatmap has a
// table view. Valuations render "not enabled" until the deferred I-3 pipeline publishes.
import Link from 'next/link';
import {getLocale,getTranslations} from 'next-intl/server';
import {Heatmap} from '@/components/industries/Heatmap';
import {ListTable} from '@/components/industries/ListTable';
import {RunHeaderBar} from '@/components/industries/RunHeaderBar';
import {LinkMenu,LinkSegment,SchemeLevelSwitch} from '@/components/industries/SchemeLevelSwitch';
import {SourceDrawerProvider} from '@/components/industries/SourceDrawer';
import {SourcesFooter} from '@/components/industries/SourcesFooter';
import {StateNotice} from '@/components/industries/StateNotice';
import {ValuationSnapshot} from '@/components/industries/ValuationSnapshot';
import {INDUSTRIES_PATH,constituentsPath,flatSearch,hrefWith,industryPath,nodeName} from '@/components/industries/hrefs';
import {listQueryFromSearch,loadView} from '@/lib/industry/page-data';
import {AGG_METRICS,METRIC_DURATIONS,SOURCES,industryListView} from '@/lib/industry/read';

export const dynamic='force-dynamic';

export default async function IndustriesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const search=flatSearch(await searchParams);
  const q=listQueryFromSearch(search);
  const {view:mode,...query}=q;
  const load=await loadView(`list:${JSON.stringify(query)}`,deps=>industryListView(deps,query),{scheme:query.scheme});
  const t=await getTranslations('industries');
  const locale=(await getLocale())==='en'?'en':'zh';
  const v=load.view;
  return (
    <SourceDrawerProvider>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-5" data-page="industries-list">
        <div className="text-xs text-text-dim"><Link href="/intel">{t('page.breadcrumbResearch')}</Link> / {t('page.breadcrumbIndustries')}</div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight">{t('page.title')}</h1>
            <p className="m-0 max-w-[65ch] text-xs text-text-dim">{t('page.subtitle')}</p>
          </div>
          <div className="ml-auto"><SchemeLevelSwitch path={INDUSTRIES_PATH} search={search} scheme={q.scheme} level={q.level} /></div>
        </div>
        {load.error&&(
          <StateNotice kind="error" body={load.staleAt?t('states.error.body',{at:load.staleAt.replace('T',' ').slice(0,16)}):t('states.error.bodyNoCache')}>
            <Link href={hrefWith(INDUSTRIES_PATH,search,{})}>{t('states.error.retry')}</Link>
          </StateNotice>
        )}
        {load.preview&&v&&v.state!=='unlicensed'&&<StateNotice kind="adminPreview" values={{dataset:v.datasetKey}} />}
        {v?.state==='unlicensed'&&(
          <StateNotice kind="unlicensed" values={{scheme:t(`schemes.${q.scheme}`)}}>
            <Link href={hrefWith(INDUSTRIES_PATH,{},{scheme:'sic'})}>{t('states.unlicensed.switchToSic')}</Link>
            <a href="#industry-sources">{t('states.unlicensed.learnMore')} →</a>
          </StateNotice>
        )}
        {v?.state==='empty'&&(<><RunHeaderBar header={null} freshness={v.freshness} /><StateNotice kind="empty" /></>)}
        {v&&(v.state==='empty'&&v.nodes.length>0||v.state==='ok'&&v.kind==='navigation')&&(
          <section className="card-base" aria-label={t(`schemes.${q.scheme}`)}>
            {q.scheme==='sic'&&<div className="mb-3 flex flex-wrap items-center gap-2"><StateNotice kind="currentOnly" /></div>}
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-text-dim"><th className="py-1.5 font-normal">{t(`schemes.${q.scheme}`)}</th><th className="py-1.5 font-normal">{t('table.industry')}</th><th className="py-1.5 text-right font-normal">{t('detail.members')}</th><th className="py-1.5 font-normal" /></tr></thead>
              <tbody>
                {v.nodes.map(n=>(
                  <tr key={n.code} className="border-t border-border">
                    <td className="py-1.5 font-mono tabular-nums">{n.code}</td>
                    <td className="py-1.5"><Link href={industryPath(q.scheme,n.code)} className="text-text hover:text-accent">{nodeName(n,locale)}</Link></td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{'members' in n&&n.members!==null?n.members:'—'}</td>
                    <td className="py-1.5 text-right"><Link href={constituentsPath(q.scheme,n.code)} className="text-xs">{t('detail.viewConstituents')} →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {v?.state==='ok'&&v.kind==='aggregate'&&(
          <>
            <RunHeaderBar header={v.header} freshness={v.freshness} extra={t('header.grid',{codes:v.nodes.length,periods:v.periodEnds.length})} />
            {v.freshness==='stale'&&<StateNotice kind="stale" values={{date:v.header.factsAsOf,activatedAt:v.header.activatedAt?v.header.activatedAt.replace('T',' ').slice(0,16):'—',generation:v.header.generation}} />}
            {v.header.historyClass==='reconstruction'&&<StateNotice kind="reconstruction" />}
            <div className="flex flex-wrap items-center gap-2">
              <LinkMenu label={t('controls.metric')} current={q.metric} options={AGG_METRICS.map(m=>({value:m,label:t(`metrics.${m}`),href:hrefWith(INDUSTRIES_PATH,search,{metric:m,duration:undefined})}))} />
              <LinkMenu label={t('controls.basis')} current={q.duration} options={METRIC_DURATIONS[q.metric].map(d=>({value:d,label:t(`durations.${d}`),href:hrefWith(INDUSTRIES_PATH,search,{duration:d})}))} />
              <LinkSegment label={t('controls.view')} current={mode} options={[
                {value:'heatmap',label:t('controls.heatmap'),href:hrefWith(INDUSTRIES_PATH,search,{view:undefined})},
                {value:'table',label:t('controls.table'),href:hrefWith(INDUSTRIES_PATH,search,{view:'table'})},
              ]} />
            </div>
            {mode==='heatmap'
              ?<Heatmap scheme={q.scheme} nodes={v.nodes} periodEnds={v.periodEnds} cells={v.cells} metric={v.metric} header={v.header} preview={v.preview} tableHref={hrefWith(INDUSTRIES_PATH,search,{view:'table'})} />
              :<ListTable scheme={q.scheme} nodes={v.nodes} periodEnds={v.periodEnds} cells={v.cells} companion={v.companion} metric={v.metric} header={v.header} preview={v.preview} />}
            <ValuationSnapshot scheme={q.scheme} nodes={v.nodes} block={v.valuation} preview={v.preview} title="title" />
            <section className="card-base" aria-label={t('judgments.title')}>
              <div className="mb-2 flex items-center gap-2"><h2 className="text-lg font-semibold">{t('judgments.title')}</h2><span className="rounded-[4px] border border-border px-1.5 text-xs text-text-dim">F4</span><span className="ml-auto text-xs text-text-dim">{t('judgments.methodsLink')}</span></div>
              <StateNotice kind="noJudgment"><span className="text-text-dim">{t('judgments.scope',{scheme:t(`schemes.${q.scheme}`),level:t(`levels.${q.level}`)})}</span></StateNotice>
            </section>
          </>
        )}
        <div id="industry-sources"><SourcesFooter sources={SOURCES[q.scheme]} /></div>
      </div>
    </SourceDrawerProvider>
  );
}
