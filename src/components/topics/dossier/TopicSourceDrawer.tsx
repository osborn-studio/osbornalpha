// Fetch-on-open source drawer (topic spec §6.4, D8).
'use client';
import {useEffect,useState} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {SourceDrawer,DRAWER_SECTIONS,type SourceDrawerInput} from '@/components/research-ui';
import type {EvidenceDetailDto} from '@/lib/topics/public-dto';
import {topicDrawerInput} from './topic-drawer-adapter';
type Load={key:string;status:'ready';detail:EvidenceDetailDto}|{key:string;status:'failed'};
export function TopicSourceDrawer({slug,ordinal,version,onClose}:{slug:string;ordinal:number|null;version?:number;onClose:()=>void}){
 const locale=useLocale()==='en'?'en':'zh',t=useTranslations('topics');
 const [load,setLoad]=useState<Load|null>(null);
 const key=ordinal===null?null:`/api/topics/${encodeURIComponent(slug)}/evidence/${ordinal}${version===undefined?'':`?version=${version}`}`;
 useEffect(()=>{
  if(!key)return;
  const controller=new AbortController();
  void fetch(key,{signal:controller.signal,cache:'no-store'}).then(async response=>{
   if(!response.ok)throw new Error('drawer_fetch_failed');
   const detail:EvidenceDetailDto=await response.json();
   if(!controller.signal.aborted)setLoad({key,status:'ready',detail});
  }).catch(()=>{if(!controller.signal.aborted)setLoad({key,status:'failed'});});
  return ()=>controller.abort();
 },[key]);
 const text=(message:string)=>t(message.startsWith('reasons.')?message:`attribution.${message}`);
 let input:SourceDrawerInput|null=null;
 const current=load?.key===key?load:null,pending=key!==null&&!current;
 let failed=current?.status==='failed';
 if(key){
  // The transport is pending, so all fields stay empty until the server supplies a payload.
  input={variant:'ok',payload:{kind:'macro_observation',identity:{id:'',label:t('dossier.source')},source:{publisher:'',adapter:'',url:null,locator:null,evidence_sha256:null},times:{period:'',available_at:'',ingested_at:null},transform:{code_version:null,mapping_version:null,method_version:null},licence:{status:'',note_key:''},attribution_key:'',links:{module_href:''}}};
  if(current?.status==='ready'){
   const e=current.detail.evidence;
   if(['missing','not_served','unsupported'].includes(e.state))input=null;
   else {try{input=topicDrawerInput({detail:current.detail,locale,text});}catch{failed=true;}}
  }
 }
 return <SourceDrawer input={input} onClose={onClose} text={message=>message?text(message):''} pending={pending?DRAWER_SECTIONS:[]} failed={failed?DRAWER_SECTIONS:[]}/>;
}
