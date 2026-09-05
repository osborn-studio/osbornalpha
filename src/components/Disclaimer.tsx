'use client';

import { useTranslations } from 'next-intl';

export function Disclaimer() {
  const t = useTranslations('components.disclaimer');
  return (
    <footer className="mt-6 border-t border-border/70 px-1 py-3 text-[11px] leading-relaxed text-text-muted/80">
      <div className="hidden xl:block"><strong className="text-text-dim">{t('heading')}</strong>: {t('body')}</div>
      <details className="xl:hidden">
        <summary className="w-fit cursor-pointer select-none font-semibold text-text-dim">{t('heading')}</summary>
        <p className="mt-2 pr-2">{t('body')}</p>
      </details>
    </footer>
  );
}
