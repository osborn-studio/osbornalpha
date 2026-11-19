'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useTranslations} from 'next-intl';
export function FromThesisLink({href}:{href:string}){
 const t=useTranslations('topicsAdmin.promotion'),[available,setAvailable]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/admin/topics',{signal:controller.signal,cache:'no-store'}).then(res=>setAvailable(res.status===200)).catch(()=>{});
  return ()=>controller.abort();
 },[]);
 return available?<Link href={href} className="rounded border border-border px-2 py-1 text-sm">{t('start')}</Link>:null;
}
