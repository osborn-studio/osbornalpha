'use client';
// Licensed target price states (spec §9.2).
import {useTranslations} from 'next-intl';
import {fmtNum} from './format';
import {SRC_BTN} from './ui';
export function TargetValue({target,targetPricePublic,onOpen,currencyFirst}:{target:{price:string;currency:string|null}|null;targetPricePublic:boolean;onOpen?:()=>void;currencyFirst?:boolean}){
 const t=useTranslations('foreign-research.public.target');
 if(!targetPricePublic)return <span className="text-text-muted">{t('notPublic')}</span>;
 if(!target)return <span className="text-text-muted">{t('absent')}</span>;
 const value=(currencyFirst?`${target.currency??''} ${fmtNum(target.price)}`:`${fmtNum(target.price)} ${target.currency??''}`).trim();
 return onOpen?<button type="button" className={SRC_BTN} onClick={onOpen}>{value}</button>:<span className="font-mono tabular-nums">{value}</span>;
}
