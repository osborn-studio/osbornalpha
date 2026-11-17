'use client';
// URL-filtered public list with four states and no mock fallback (spec §9.2).
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {PUBLIC_RATINGS} from '@/lib/broker-research/public-types';
import type {PublicInstitutionDto} from '@/lib/broker-research/public-types';
import type {LibraryTotals} from '@/lib/broker-research/public-types';
import {ForeignHeader,ForeignFooter} from './ResearchShell';
import {ReportsTable} from './ReportsTable';
import {apiQuery,classifyListResponse,EMPTY_FILTERS,filtersToParams,parseListFilters} from './list-query';
import type {ListFilters,ListOutcome} from './list-query';
import {BTN,CALLOUT,CARD,CARD_FLUSH,CHIP,INPUT,SEG,TINY,segBtn} from './ui';
const LIMIT=50;
interface Stats{institutions:PublicInstitutionDto[];totals:LibraryTotals}
export function ListClient(){
 const t=useTranslations('foreign-research.public'),tr=useTranslations('foreign-research.rating'),router=useRouter(),pathname=usePathname(),sp=useSearchParams();
 const key=filtersToParams(parseListFilters(new URLSearchParams(sp.toString()))).toString(),filters=parseListFilters(new URLSearchParams(key));
 const [draft,setDraft]=useState<ListFilters>(filters),[cursors,setCursors]=useState<string[]>([]),[outcome,setOutcome]=useState<ListOutcome|null>(null),[stats,setStats]=useState<Stats|null>(null),[retry,setRetry]=useState(0);
 const cursor=cursors.at(-1)??null;
 useEffect(()=>{setDraft(parseListFilters(new URLSearchParams(key)));setCursors([]);},[key]);
 useEffect(()=>{const ctrl=new AbortController();setOutcome(null);fetch(`/api/broker-research/reports?${apiQuery(parseListFilters(new URLSearchParams(key)),cursor,LIMIT)}`,{cache:'no-store',signal:ctrl.signal}).then(r=>classifyListResponse(r,key!=='',cursor!==null)).then(setOutcome).catch(e=>{if(!(e instanceof Error&&e.name==='AbortError'))setOutcome({kind:'error'});});return ()=>ctrl.abort();},[key,cursor,retry]);
 useEffect(()=>{const ctrl=new AbortController();fetch('/api/broker-research/institutions',{cache:'no-store',signal:ctrl.signal}).then(r=>r.ok?r.json() as Promise<Stats>:null).then(setStats).catch(()=>{});return ()=>ctrl.abort();},[retry]);
 const apply=(f:ListFilters)=>{const q=filtersToParams(f).toString();router.replace(q?`${pathname}?${q}`:pathname);};
 return <div className="mx-auto flex max-w-[1400px] flex-col gap-4"><nav className={TINY}><Link href="/intel">{t('breadcrumb.research')}</Link> / {t('breadcrumb.list')}</nav><ForeignHeader title={t('list.title')} controls={<span className={CHIP}>{t('list.stats.reports')} {stats?.totals.reports??'—'} · {t('list.stats.institutions')} {stats?.totals.institutions??'—'} · {t('list.stats.lastAdded')} {stats?.totals.lastAvailableAt?.slice(0,10)??'—'}</span>}/>
  <form className={`${CARD} flex flex-wrap items-end gap-3`} onSubmit={e=>{e.preventDefault();apply(draft);}}><label className="text-xs">{t('list.filters.security')}<input className={`${INPUT} block w-full`} value={draft.ticker} onChange={e=>setDraft({...draft,ticker:e.target.value})}/></label>
   <label className="text-xs">{t('list.filters.institution')}<select className={`${INPUT} block w-full`} value={draft.institution} onChange={e=>{const f={...draft,institution:e.target.value};setDraft(f);apply(f);}}><option value="">{t('list.filters.all')}</option>{stats?.institutions.map(i=><option key={i.id} value={i.id}>{i.nameEn}</option>)}</select></label>
   <div><span className="text-xs">{t('list.filters.rating')}</span><div className={SEG}>{['',...PUBLIC_RATINGS].map(r=><button key={r||'all'} type="button" aria-pressed={draft.rating===r} className={segBtn(draft.rating===r)} onClick={()=>{const f={...draft,rating:r};setDraft(f);apply(f);}}>{r?tr(r):t('list.filters.all')}</button>)}</div></div>
   <label className="text-xs">{t('list.filters.from')}<input type="date" className={`${INPUT} block`} value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label><label className="text-xs">{t('list.filters.to')}<input type="date" className={`${INPUT} block`} value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label>
   <label className="text-xs"><input type="checkbox" checked={draft.summary} onChange={e=>{const f={...draft,summary:e.target.checked};setDraft(f);apply(f);}}/> {t('list.filters.summaryOnly')}</label><button className={BTN} type="submit">{t('list.filters.apply')}</button><button type="button" className={BTN} onClick={()=>{setDraft(EMPTY_FILTERS);setCursors([]);apply(EMPTY_FILTERS);}}>{t('list.filters.clear')}</button></form>
  {key?<div className="flex flex-wrap gap-2">{(['ticker','institution','rating','from','to','summary'] as const).filter(k=>filters[k]).map(k=><button key={k} type="button" className={BTN} onClick={()=>apply({...filters,[k]:k==='summary'?false:''})}>{t(`list.filters.${k==='ticker'?'security':k==='from'||k==='to'?'published':k==='summary'?'summaryOnly':k}`)}: {String(filters[k])} ×</button>)}</div>:null}
  {outcome===null?<div className={CARD} aria-busy="true">{t('list.loading')}</div>:outcome.kind==='error'?<div role="alert" className={CALLOUT}>{t('list.error.body')} <button type="button" className={BTN} onClick={()=>setRetry(x=>x+1)}>{t('list.error.retry')}</button></div>:outcome.kind==='empty'?<section className={CALLOUT}><h2>{t('list.empty.title')}</h2><p>{t('list.empty.body')}</p></section>:outcome.kind==='noResults'?<section className={CALLOUT}><h2>{t(outcome.unknownTicker?'list.noResults.unknownTicker':'list.noResults.title')}</h2><button type="button" className={BTN} onClick={()=>apply(EMPTY_FILTERS)}>{t('list.noResults.clear')}</button></section>:<section className={CARD_FLUSH}><ReportsTable reports={outcome.page.reports}/><div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3"><span className={TINY}>{t('list.upsideNote')}</span><div><button type="button" className={BTN} disabled={!cursors.length} onClick={()=>setCursors(c=>c.slice(0,-1))}>{t('list.prev')}</button><button type="button" className={BTN} disabled={!outcome.page.nextCursor} onClick={()=>{if(outcome.page.nextCursor)setCursors(c=>[...c,outcome.page.nextCursor!]);}}>{t('list.next')}</button></div></div></section>}
 <ForeignFooter/></div>;
}
