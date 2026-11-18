// Topic directory loading, empty and failure states (spec §7.1).
import Link from 'next/link';
import type {Route} from 'next';
import {useTranslations} from 'next-intl';
export function DirectoryStates({loading,error,isAdmin,retry}:{loading?:boolean;error?:string|null;isAdmin:boolean;retry():void}){
 const t=useTranslations('topics.directory.states');
 if(loading)return <div aria-busy="true" className="space-y-3 py-8">{[0,1,2,3].map(n=><div key={n} className="h-4 rounded bg-bg-elevated animate-pulse"/>)}</div>;
 if(error)return <div role="alert" className="space-y-2 py-8"><h2>{t('errorTitle',{code:error})}</h2><p className="text-sm text-text-dim">{t('errorBody')}</p><button onClick={retry} className="text-accent">{t('retry')}</button></div>;
 return <div role="status" className="space-y-2 py-8"><h2>{t('emptyTitle')}</h2><p className="text-sm text-text-dim">{t(isAdmin?'emptyAdmin':'emptyUser')}</p>{isAdmin&&<Link href={'/admin/topics/new' as Route} className="text-accent">{t('create')}</Link>}</div>;
}
