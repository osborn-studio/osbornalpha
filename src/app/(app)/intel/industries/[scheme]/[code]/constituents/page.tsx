// src/app/(app)/intel/industries/[scheme]/[code]/constituents/page.tsx
// Constituents (spec §8.4; canvas "Constituents"): a date picker (GET form → ?on=), members on that
// date by today's knowledge (spec §4.6), unresolved members as a count only, each row with ticker,
// name, in/out dates (opening the membership drawer), the L2/L3 path, the latest annual revenue and
// net income visible on that date (fact drawer), and the company link. SIC is current_only: the
// in-date column is the first observation date and the page says so. Paged (100 per page).
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getLocale,getTranslations} from 'next-intl/server';
import {SourceButton,SourceDrawerProvider} from '@/components/industries/SourceDrawer';
import {SourcesFooter} from '@/components/industries/SourcesFooter';
import {StateNotice} from '@/components/industries/StateNotice';
import {FreshnessChip} from '@/components/industries/FreshnessChip';
import {INDUSTRIES_PATH,constituentsPath,flatSearch,hrefWith,industryPath,issuerLabel,nodeName,stockPath} from '@/components/industries/hrefs';
import {formatMoney} from '@/lib/industry/display';
import {codeOfPath,constituentsQueryFromSearch,loadView,schemeOfPath} from '@/lib/industry/page-data';
import {SOURCES,constituentsView} from '@/lib/industry/read';

export const dynamic='force-dynamic';

export default async function ConstituentsPage({params,searchParams}:{params:Promise<{scheme:string;code:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const raw=await params;
  const scheme=schemeOfPath(raw.scheme),code=codeOfPath(raw.code);
  if(!scheme||!code)notFound();
  const search=flatSearch(await searchParams);
  const now=new Date();
  const q=constituentsQueryFromSearch(scheme,code,search,now);
  const load=await loadView(`constituents:${JSON.stringify(q)}`,deps=>constituentsView(deps,q),{scheme,now});
  const t=await getTranslations('industries');
  const locale=(await getLocale())==='en'?'en':'zh';
  const v=load.view;
  if(v?.state==='unknown_industry')notFound();
  const path=constituentsPath(scheme,code);
  const today=now.toISOString().slice(0,10);
  const pages=v?.state==='ok'?Math.max(1,Math.ceil(v.total/v.pageSize)):1;
  return (
    <SourceDrawerProvider>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4" data-page="industries-constituents">
        <div className="text-xs text-text-dim"><Link href="/intel">{t('page.breadcrumbResearch')}</Link> / <Link href={hrefWith(INDUSTRIES_PATH,{},{scheme:scheme==='sw2021'?undefined:scheme})}>{t('page.breadcrumbIndustries')}</Link>{v?.state==='ok'&&<> / <Link href={industryPath(scheme,code)}>{nodeName(v.node,locale)}</Link></>} / {t('page.constituents')}</div>
        {load.error&&<StateNotice kind="error" body={load.staleAt?t('states.error.body',{at:load.staleAt.replace('T',' ').slice(0,16)}):t('states.error.bodyNoCache')}><Link href={hrefWith(path,search,{})}>{t('states.error.retry')}</Link></StateNotice>}
        {v?.state==='unlicensed'&&<StateNotice kind="unlicensed" values={{scheme:t(`schemes.${scheme}`)}}><Link href={hrefWith(INDUSTRIES_PATH,{},{scheme:'sic'})}>{t('states.unlicensed.switchToSic')}</Link></StateNotice>}
        {v?.state==='ok'&&(
          <>
            {load.preview&&<StateNotice kind="adminPreview" values={{dataset:v.datasetKey}} />}
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight">{t('constituents.title',{name:nodeName(v.node,locale)})}</h1>
                <div className="mt-1 text-xs text-text-dim">{t(`schemes.${scheme}`)} · {t(`levels.${v.node.level}`)} · <span className="font-mono">{v.node.code}</span></div>
              </div>
              <form method="get" action={path} className="ml-auto flex items-end gap-2">
                <label className="flex flex-col gap-1.5 text-xs text-text-dim" htmlFor="industry-on">{t('constituents.asOf')}
                  <input id="industry-on" name="on" type="date" defaultValue={v.on} max={today} className="h-9 font-mono tabular-nums" />
                </label>
                <button type="submit" className="h-9 rounded-md bg-accent px-3 text-sm font-medium text-bg">{t('controls.apply')}</button>
                <Link href={path} className="flex h-9 items-center rounded-md border border-border px-3 text-sm text-text-dim hover:no-underline">{t('controls.today')}</Link>
              </form>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="rounded-full border border-border px-2 py-0.5"><span className="font-mono tabular-nums">{t('constituents.members',{n:v.total})}</span></span>
              {scheme==='sw2021'&&<span className="rounded-full border border-warn px-2 py-0.5 text-warn"><span className="font-mono tabular-nums">{t('constituents.unresolved',{n:v.unresolvedCount})}</span></span>}
              <FreshnessChip status={v.freshness} />
              <span className="ml-auto text-text-dim">{t('constituents.rule')}</span>
            </div>
            {v.currentOnly&&<StateNotice kind="currentOnly" />}
            {v.rows.length===0?<StateNotice kind="noMembers" values={{on:v.on}} />:(
              <section className="card-base" style={{padding:'4px 0'}}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-text-dim">
                      <th className="py-2 pl-3 font-normal sm:pl-4">{t('constituents.ticker')}</th>
                      <th className="py-2 font-normal">{t('constituents.name')}</th>
                      <th className="py-2 font-normal">{v.currentOnly?t('constituents.observed'):t('constituents.inDate')}</th>
                      <th className="hidden py-2 font-normal sm:table-cell">{t('constituents.outDate')}</th>
                      <th className="hidden py-2 font-normal md:table-cell">{v.currentOnly?t('constituents.sic'):t('constituents.path')}</th>
                      <th className="py-2 text-right font-normal">{t('constituents.revenue')}</th>
                      <th className="hidden py-2 text-right font-normal sm:table-cell">{t('constituents.netIncome')}</th>
                      <th className="hidden py-2 pr-4 font-normal sm:table-cell">{t('constituents.company')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.rows.map(r=>{
                      const name=issuerLabel(r,locale);
                      const memberPayload={kind:'membership' as const,scheme,nodeName:nodeName(v.node,locale),issuerName:name,ticker:r.ticker,membership:r.membership,path:r.path};
                      const fact=(f:typeof r.revenue)=>f?<SourceButton payload={{kind:'fact',issuerName:name,ticker:r.ticker,fact:f}} label={`${name} ${f.concept} ${f.periodEnd}`}>{formatMoney(f.value,f.unit,locale)}</SourceButton>:<span className="font-mono text-xs text-text-dim" title={t('constituents.noFact')}>—</span>;
                      return (
                        <tr key={r.membership.membershipId} className="border-t border-border">
                          <td className="py-1.5 pl-3 font-mono text-xs sm:pl-4">{r.ticker??'—'}</td>
                          <td className="py-1.5">{name}</td>
                          <td className="py-1.5"><SourceButton payload={memberPayload} label={`${name} ${r.membership.validFrom}`} className="text-xs text-text-dim">{r.membership.validFrom}</SourceButton></td>
                          <td className="hidden py-1.5 font-mono text-xs tabular-nums text-text-dim sm:table-cell">{r.membership.validTo??'—'}</td>
                          <td className="hidden py-1.5 text-xs text-text-dim md:table-cell">{v.currentOnly?<span className="font-mono">{r.membership.code}</span>:r.path.slice(1).map(n=>nodeName(n,locale)).join(' / ')||'—'}</td>
                          <td className="py-1.5 text-right">{fact(r.revenue)}</td>
                          <td className="hidden py-1.5 text-right sm:table-cell">{fact(r.netIncome)}</td>
                          <td className="hidden py-1.5 pr-4 sm:table-cell">{r.ticker&&<Link href={stockPath(r.ticker)} className="text-xs">{t('constituents.companyLink')} →</Link>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-xs text-text-dim">
                  <span>{t('constituents.unit',{page:v.page,pages,size:v.pageSize})}</span>
                  <div className="ml-auto flex gap-2">
                    {v.page>1?<Link href={hrefWith(path,search,{page:String(v.page-1)})} className="rounded-md border border-border px-3 py-1">{t('controls.prev')}</Link>:<span className="rounded-md border border-border px-3 py-1 opacity-50">{t('controls.prev')}</span>}
                    {v.page<pages?<Link href={hrefWith(path,search,{page:String(v.page+1)})} className="rounded-md border border-border px-3 py-1">{t('controls.next')} →</Link>:<span className="rounded-md border border-border px-3 py-1 opacity-50">{t('controls.next')}</span>}
                  </div>
                </div>
              </section>
            )}
            <SourcesFooter sources={SOURCES[scheme]} />
          </>
        )}
      </div>
    </SourceDrawerProvider>
  );
}
