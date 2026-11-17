// src/app/(app)/admin/broker-research/_shared/gate.tsx
// Per-page admin gate (the layout does not re-run on client navigation, so every page calls this).
import type {User} from '@supabase/supabase-js';
import {getTranslations} from 'next-intl/server';
import {redirect} from 'next/navigation';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';

export async function adminGate(next:string):Promise<User|null>{
 try{return await requireAdminUser();}
 catch(e){
  if(e instanceof AdminForbidden)return null;
  if(e instanceof AdminUnauthenticated)redirect(`/login?next=${encodeURIComponent(next)}`);
  throw e;
 }
}
export async function AdminDenied(){
 const t=await getTranslations('foreign-research.admin.denied');
 return <section className="border-y border-border py-8"><h1 className="text-xl font-bold">{t('title')}</h1><p className="mt-2 text-sm text-text-dim">{t('body')}</p></section>;
}
