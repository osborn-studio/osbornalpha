'use client';
// Neutral normalized rating chip (spec §9).
import {useTranslations} from 'next-intl';
import type {NormalizedRating} from '@/lib/broker-research/public-types';
import {StateBadge} from '@/components/research-ui';
import {CHIP} from './ui';
export function RatingBadge({value,raw}:{value:NormalizedRating|null;raw?:string|null}){
 const t=useTranslations('foreign-research');
 if(value===null)return <StateBadge state="missing" detail={raw?t('rating.unmapped'):t('public.target.absent')}/>;
 return <span className={CHIP}>{t(`rating.${value}`)}</span>;
}
