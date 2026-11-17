'use client';
import {useLocale, useTranslations} from 'next-intl';
import {useRouter} from 'next/navigation';
import {useEffect, useState} from 'react';
import type {AppLocale} from '@/lib/i18n/locale';
import {selectLanguage} from './language-preference';

export function LanguageSwitch() {
  const locale = useLocale() as AppLocale;
  const [language, setLanguage] = useState(locale);
  const router = useRouter();
  const t = useTranslations('common.nav');
  useEffect(() => setLanguage(locale), [locale]);
  return <div role="group" aria-label={t('language')} className="inline-flex rounded-[4px] border border-border overflow-hidden">
    {(['zh', 'en'] as const).map(value => <button key={value} type="button" aria-pressed={language === value}
      className={`min-h-[44px] min-w-[52px] px-2 text-xs ${language === value ? 'bg-[var(--accent-wash)] text-accent font-semibold' : 'text-text-dim'}`}
      onClick={() => {setLanguage(value); void selectLanguage(value, () => router.refresh());}}>{t(value === 'zh' ? 'langZh' : 'langEn')}</button>)}
  </div>;
}
