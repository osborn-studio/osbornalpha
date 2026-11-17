'use client';
// Licensed target price states (spec §9.2).
import {useTranslations} from 'next-intl';
import {StateCell} from '@/components/research-ui';
import {fmtNum} from './format';
import {SRC_BTN} from './ui';
export function TargetValue({target,targetPricePublic,onOpen,currencyFirst}:{target:{price:string;currency:string|null}|null;targetPricePublic:boolean;onOpen?:()=>void;currencyFirst?:boolean}){
 const t=useTranslations('foreign-research.public.target');
 if(!targetPricePublic)return <StateCell state="withheld" detail={t('notPublic')}/>;
 if(!target)return <StateCell state="missing" detail={t('absent')}/>;
 const value=(currencyFirst?`${target.currency??''} ${fmtNum(target.price)}`:`${fmtNum(target.price)} ${target.currency??''}`).trim();
 return onOpen?<button type="button" className={SRC_BTN} onClick={onOpen}>{value}</button>:<span className="font-mono tabular-nums">{value}</span>;
}
