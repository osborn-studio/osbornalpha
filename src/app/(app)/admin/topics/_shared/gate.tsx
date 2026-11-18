// Topic plan T5.4: per-page authentication, including isolated admin fixtures.
import {getTranslations} from 'next-intl/server';
import {redirect} from 'next/navigation';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {adminFixtureMode,FIXTURE_ADMIN_ID} from '@/lib/topics/admin-fixture-mode';
export async function adminGate(next:string):Promise<{id:string}|null>{
 if(adminFixtureMode())return {id:FIXTURE_ADMIN_ID};
 try{return await requireAdminUser();}
 catch(e){
  if(e instanceof AdminForbidden)return null;
  if(e instanceof AdminUnauthenticated)redirect(`/login?next=${encodeURIComponent(next)}`);
  throw e;
 }
}
export async function AdminDenied(){
 const t=await getTranslations('topicsAdmin');
 return <section className="border-y border-border py-8"><h1 className="text-xl font-bold">{t('denied.title')}</h1><p className="mt-2 text-sm text-text-dim">{t('denied.body')}</p></section>;
}
