'use client';
// Uniform withdrawn, hidden and absent wording (spec §9.2).
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import {BTN,CALLOUT} from './ui';
export function NotFoundCallout({kind}:{kind:'report'|'institution'}){const t=useTranslations('foreign-research.public.notFound');return <section className={CALLOUT}><h1 className="text-lg font-semibold">{t(`${kind}.title`)}</h1><p>{t(`${kind}.body`)}</p><Link className={BTN} href="/intel/foreign-research">{t('back')}</Link></section>;}
