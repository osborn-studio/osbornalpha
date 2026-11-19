'use client';
import Link from 'next/link';
import {createContext,useContext,type ReactNode} from 'react';
import {useTranslations} from 'next-intl';

const Available=createContext(false);
export function FromThesisLinkProvider({children}:{children:ReactNode}){
 return <Available.Provider value={true}>{children}</Available.Provider>;
}
export function FromThesisLink({href}:{href:string}){
 return useContext(Available)?<PromotionLink href={href}/>:null;
}
function PromotionLink({href}:{href:string}){
 const t=useTranslations('topicsAdmin.promotion');
 return <Link href={href} className="rounded border border-border px-2 py-1 text-sm">{t('start')}</Link>;
}
