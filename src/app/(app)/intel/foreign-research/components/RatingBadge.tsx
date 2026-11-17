'use client';
// Neutral normalized rating chip (spec §9).
import {useTranslations} from 'next-intl';
import type {NormalizedRating} from '@/lib/broker-research/types';
import {CHIP} from './ui';
export function RatingBadge({value}:{value:NormalizedRating|null}){const t=useTranslations('foreign-research.rating');return <span className={CHIP}>{t(value??'unmapped')}</span>;}
