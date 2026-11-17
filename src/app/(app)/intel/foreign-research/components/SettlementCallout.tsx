'use client';
// F4 claim settlement placeholder (spec §9.3).
import {useTranslations} from 'next-intl';
import {CALLOUT} from './ui';
export function SettlementCallout(){const t=useTranslations('foreign-research.public.settlement');return <section className={CALLOUT}><strong>{t('title')}</strong> · {t('body')}</section>;}
