// Topic directory server gate and preview (spec §7.1, D1).
import Link from 'next/link';
import type {Route} from 'next';
import {notFound,redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {PageHeader,MarkLegend} from '@/components/research-ui';
import {DirectoryClient,DirectorySearch} from '@/components/topics/directory/DirectoryClient';
import {topicsEnabled} from '@/lib/topics/flags';
import {fixtureMode} from '@/lib/topics/e2e-fixture';
import {publicDeps,previewDeps} from '@/lib/topics/deps';
import {listTopics} from '@/lib/topics/public-read';
import {TopicError} from '@/lib/topics/errors';
import {CATEGORIES,type Category} from '@/lib/topics/types';
export const dynamic='force-dynamic';
export default async function TopicsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 if(!topicsEnabled())notFound();
 let isAdmin=false;
 if(!fixtureMode())try{await requireAdminUser();isAdmin=true;}catch(e){
  if(e instanceof AdminUnauthenticated)redirect('/login?next=%2Fintel%2Ftopics');
  if(!(e instanceof AdminForbidden))throw e;
 }
 const params=await searchParams,t=await getTranslations('topics');
 let initial:Awaited<ReturnType<typeof listTopics>>={items:[],nextCursor:null},preview=false,error:string|null=null;
 try{
  const category=typeof params.category==='string'?params.category:undefined;
  if(category&&!CATEGORIES.includes(category as Category))throw new TopicError('invalid_parameter:category');
  const query={category:category as Category|undefined,q:typeof params.q==='string'?params.q:undefined,cursor:typeof params.cursor==='string'?params.cursor:undefined,limit:50};
  const deps=await publicDeps();
  const publicEnabled=await deps.db.publicOpen();
  if(!publicEnabled&&!isAdmin)notFound();
  if(publicEnabled)initial=await listTopics(deps,query);
  if(isAdmin&&!initial.items.length){
   preview=!publicEnabled;
   // Preview uses the service projection only after the admin gate above.
   initial=await listTopics(previewDeps(),query);
  }
 }catch(e){
  if(e instanceof TopicError&&e.code==='not_found'&&!isAdmin)notFound();
  // Preserve framework navigation exceptions.
  if(e&&typeof e==='object'&&'digest' in e)throw e;
  error=e instanceof TopicError?e.code:'unavailable';
 }
 return <main className="min-w-0 space-y-5">
  <PageHeader title={t('meta.title')} altTitle={t('meta.titleEn')} scope={t('meta.scope')} legend={false} scopeSwitch={<div className="flex max-w-full flex-wrap items-center gap-3">
   <DirectorySearch preview={preview}/>{isAdmin&&<Link href={'/admin/topics' as Route} className="text-sm text-accent">{t('directory.manage')}</Link>}<MarkLegend/>
  </div>}/>
  <DirectoryClient initial={initial} isAdmin={isAdmin} preview={preview} initialError={error}/>
 </main>;
}
