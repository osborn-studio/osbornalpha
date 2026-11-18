// Topic directory controls and public reads (spec §7.1).
'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import type {Route} from 'next';
import {useTranslations} from 'next-intl';
import {ResearchFooter} from '@/components/research-ui';
import {CATEGORIES} from '@/lib/topics/types';
import type {DirectoryItem} from '@/lib/topics/public-dto';
import {TopicCard} from './TopicCard';
import {DirectoryStates} from './DirectoryStates';
type Page={items:DirectoryItem[];nextCursor:string|null};
function directoryUrl(params:URLSearchParams){return `/intel/topics${params.size?`?${params}`:''}` as Route;}
export function DirectorySearch({preview}:{preview:boolean}){
 const t=useTranslations('topics.directory'),params=useSearchParams(),router=useRouter();
 const q=params.get('q')??'',[value,setValue]=useState(q),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{setValue(q);},[q]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 return <input type="search" aria-label={t('searchLabel')} placeholder={t('searchPlaceholder')} maxLength={32} value={value}
  className="w-full min-w-0 rounded border border-border bg-bg px-3 py-2 text-sm text-text"
  onChange={e=>{
   const value=e.target.value;setValue(value);if(timer.current)clearTimeout(timer.current);
   timer.current=setTimeout(()=>{
    const p=new URLSearchParams(window.location.search);p.delete('cursor');if(value)p.set('q',value);else p.delete('q');
    if(preview)router.replace(directoryUrl(p),{scroll:false});else window.history.replaceState(null,'',directoryUrl(p));
   },300);
  }}/>;
}
export function DirectoryClient({initial,isAdmin,preview,initialError=null}:{initial:Page;isAdmin:boolean;preview:boolean;initialError?:string|null}){
 const t=useTranslations('topics.directory'),params=useSearchParams(),router=useRouter();
 const [data,setData]=useState(initial),[loading,setLoading]=useState(false),[error,setError]=useState(initialError),[attempt,setAttempt]=useState(0);
 const category=params.get('category')??'',q=params.get('q')??'',cursor=params.get('cursor');
 const generation=useRef(0),controller=useRef<AbortController|null>(null);
 useEffect(()=>{
  if(preview){setData(old=>cursor?{items:[...old.items,...initial.items.filter(item=>!old.items.some(o=>o.slug===item.slug))],nextCursor:initial.nextCursor}:initial);setError(initialError);return;}
  const id=++generation.current,abort=new AbortController();controller.current?.abort();controller.current=abort;
  setLoading(true);setError(null);
  const p=new URLSearchParams();if(category)p.set('category',category);if(q)p.set('q',q);
  fetch(`/api/topics?${p}`,{cache:'no-store',signal:abort.signal}).then(async res=>{
   const body=await res.json();if(!res.ok)throw new Error(body.error?.code??String(res.status));
   if(id===generation.current)setData(body);
  }).catch(e=>{if(!abort.signal.aborted&&id===generation.current){setData({items:[],nextCursor:null});setError(e instanceof Error?e.message:'unavailable');}})
   .finally(()=>{if(id===generation.current&&!abort.signal.aborted)setLoading(false);});
  return ()=>abort.abort();
 },[category,q,cursor,attempt,preview,initial,initialError]);
 async function more(){
  if(!data.nextCursor)return;
  const p=new URLSearchParams();if(category)p.set('category',category);if(q)p.set('q',q);p.set('cursor',data.nextCursor);
  if(preview){router.replace(directoryUrl(p),{scroll:false});return;}
  const id=++generation.current,abort=new AbortController();controller.current?.abort();controller.current=abort;
  setLoading(true);setError(null);
  try{
   const res=await fetch(`/api/topics?${p}`,{cache:'no-store',signal:abort.signal}),body=await res.json();
   if(!res.ok)throw new Error(body.error?.code??String(res.status));
   if(id===generation.current)setData(old=>({items:[...old.items,...body.items],nextCursor:body.nextCursor}));
  }catch(e){if(!abort.signal.aborted&&id===generation.current){setData({items:[],nextCursor:null});setError(e instanceof Error?e.message:'unavailable');}}
  finally{if(!abort.signal.aborted&&id===generation.current)setLoading(false);}
 }
 return <>
  {preview&&<aside className="rounded border border-border bg-bg-elevated p-3 text-sm"><h2>{t('previewBanner.title')}</h2><p className="text-text-dim">{t('previewBanner.body')}</p></aside>}
  <div role="group" aria-label={t('categoryLabel')} className="flex flex-wrap gap-2">{['',...CATEGORIES].map(c=><button key={c} aria-pressed={category===c} className="rounded border border-border px-3 py-1.5 text-sm text-text-dim aria-pressed:text-accent aria-pressed:border-accent" onClick={()=>{
   const p=new URLSearchParams(params);p.delete('cursor');if(c)p.set('category',c);else p.delete('category');
   if(preview)router.replace(directoryUrl(p),{scroll:false});else window.history.replaceState(null,'',directoryUrl(p));
  }}>{t(`categories.${c||'all'}`)}</button>)}</div>
  {loading||error||!data.items.length?<DirectoryStates loading={loading} error={error} isAdmin={isAdmin} retry={()=>{if(preview)router.refresh();else setAttempt(n=>n+1);}}/>:
   <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{data.items.map(item=><TopicCard key={item.slug} item={item}/>)}</div>}
  {!loading&&!error&&data.nextCursor&&<button className="text-accent" onClick={more}>{t('loadMore')}</button>}
  <ResearchFooter sources={[]}/>
 </>;
}
