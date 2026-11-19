'use client';
import {useState,type Dispatch} from 'react';
import {useTranslations} from 'next-intl';
import type {DraftBody} from '@/lib/topics/types';
import {unreviewedBlocks,type EditorAction} from './editor-state';
import {BUTTON} from './FlowBar';
export function NotCarriedOver({stripped,body,locale,dispatch,readOnly}:{stripped:{field:string;count:number|null}[];body:DraftBody;locale:'en'|'zh';dispatch:Dispatch<EditorAction>;readOnly:boolean}){
 const t=useTranslations('topicsAdmin.promotion'),[expanded,setExpanded]=useState(false),blocks=unreviewedBlocks(body,locale);
 return <section className="space-y-3 rounded-lg border border-warn bg-bg-card p-3 text-sm">
  <h2 className="font-semibold">{t('title')}</h2><p>{t('intro')}</p>
  <ul className="list-disc ps-5">{stripped.map(({field,count})=><li key={field}>{t('fields.'+field)} {count!==null&&<span className="font-mono tabular-nums">{count}</span>}</li>)}</ul>
  {blocks.length>0&&<div className="space-y-2 border-t border-warn pt-2"><p className="font-mono tabular-nums">{t('unreviewed',{n:blocks.length})}</p>
   <code>unreviewed_private_block</code><p>{t('instructions')}</p><button className={BUTTON} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{t('review')}</button>
   {expanded&&blocks.map(b=><div key={b.key} className="space-y-1 border-t border-border pt-2"><p className="line-clamp-2 break-words">{b.text}</p>
    <button className={BUTTON} disabled={readOnly} onClick={()=>document.getElementById('field-'+b.field)?.focus()}>{t('rewrite')}</button>{' '}
    <button className={BUTTON} disabled={readOnly} onClick={()=>dispatch({type:'confirmBlock',key:b.key})}>{t('confirm')}</button></div>)}
  </div>}
 </section>;
}
