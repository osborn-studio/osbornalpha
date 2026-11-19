// Topic plan T5.4: bilingual creation form and inline API errors.
'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {CATEGORIES} from '@/lib/topics/types';
import {TopicAdminFrame} from '@/app/(app)/admin/topics/_shared/TopicAdminFrame';
import {adminJson,baseCode} from '@/app/(app)/admin/topics/_shared/admin-fetch';
import {newTopicErrors} from './list-model';
const INPUT='block min-h-9 w-full rounded-md border border-border bg-bg-card px-3 text-sm text-text focus:border-accent';
export function NewTopicForm({fromThesis}:{fromThesis?:string}){
 const [hydrated,setHydrated]=useState(false);
 useEffect(()=>{setHydrated(true);},[]);
 const t=useTranslations('topicsAdmin'),router=useRouter(),sending=useRef(false);
 const [input,setInput]=useState({slug:'',category:'macro',title:{zh:'',en:''}});
 const [errors,setErrors]=useState<Record<string,string>>({}),[code,setCode]=useState<string|null>(null),[pending,setPending]=useState(false);
 async function submit(e:FormEvent){
  e.preventDefault();if(sending.current)return;
  const invalid=newTopicErrors(input,fromThesis===undefined);setErrors(invalid);setCode(null);if(Object.keys(invalid).length)return;
  sending.current=true;setPending(true);
  try{
   const result=await adminJson<{topic_id:string}>('POST',fromThesis===undefined?'':'/from-thesis',fromThesis===undefined?input:{thesis_id:fromThesis,slug:input.slug,category:input.category});
   if(result.ok){router.push(`/admin/topics/${result.data.topic_id}`);return;}
   if(baseCode(result.code)==='slug_taken')setErrors({slug:'errors.slugTaken'});
   else if(baseCode(result.code)==='invalid_body'){
    const field=result.code.slice('invalid_body:'.length);
    const keys:Record<string,string>={slug:'errors.slug',category:'errors.category','title.zh':'errors.title','title.en':'errors.title'};
    if(keys[field])setErrors({[field]:keys[field]});else setCode(result.code);
   }else setCode(result.code);
  }finally{sending.current=false;setPending(false);}
 }
 const error=(field:string)=>errors[field]?<p id={`error-${field}`} role="alert" className="mt-1 text-xs text-danger">{t(errors[field])}</p>:null;
 return <div data-hydrated={hydrated||undefined}><TopicAdminFrame crumb={t('newTopic.title')} title={t('newTopic.title')}>
  <form onSubmit={submit} noValidate className="max-w-2xl space-y-4 rounded-lg border border-border bg-bg-card p-4">
   <fieldset disabled={pending} className="space-y-4">
    <div><label htmlFor="topic-slug" className="mb-1 block text-xs text-text-dim">{t('newTopic.slug')}</label>
     <input id="topic-slug" className={`${INPUT} font-mono tabular-nums`} value={input.slug} onChange={e=>setInput({...input,slug:e.target.value})} aria-invalid={!!errors.slug} aria-describedby={`slug-hint${errors.slug?' error-slug':''}`} autoComplete="off"/>
     <p id="slug-hint" className="mt-1 font-mono text-xs tabular-nums text-text-muted">{t('newTopic.slugHint')} · {t('newTopic.immutable')}</p>{error('slug')}
    </div>
    <div><label htmlFor="topic-category" className="mb-1 block text-xs text-text-dim">{t('newTopic.category')}</label>
     <select id="topic-category" className={INPUT} value={input.category} onChange={e=>setInput({...input,category:e.target.value})} aria-invalid={!!errors.category} aria-describedby={errors.category?'error-category':undefined}>{CATEGORIES.map(c=><option key={c} value={c}>{t(`category.${c}`)}</option>)}</select>{error('category')}
    </div>
    {fromThesis===undefined&&(['zh','en'] as const).map(loc=><div key={loc}><label htmlFor={`topic-title-${loc}`} className="mb-1 block text-xs text-text-dim">{t(`newTopic.title_${loc}`)}</label>
     <input id={`topic-title-${loc}`} lang={loc} className={INPUT} value={input.title[loc]} onChange={e=>setInput({...input,title:{...input.title,[loc]:e.target.value}})} aria-invalid={!!errors[`title.${loc}`]} aria-describedby={errors[`title.${loc}`]? `error-title.${loc}`:undefined}/>{error(`title.${loc}`)}
    </div>)}
    <button type="submit" className="min-h-9 rounded-md border border-accent bg-[var(--accent-wash)] px-3 text-sm text-accent disabled:opacity-50">{t(pending?'newTopic.creating':'newTopic.create')}</button>
   </fieldset>
   {code&&<p role="alert" className="text-sm text-danger">{t('errors.generic')} <span className="font-mono tabular-nums">{code}</span></p>}
  </form>
 </TopicAdminFrame></div>;
}
