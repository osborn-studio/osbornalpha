'use client';

import { useTranslations } from 'next-intl';

export function Disclaimer() {
  const t = useTranslations('components.disclaimer');
  return (
    <div className="mt-8 rounded-lg border border-border bg-bg-card p-4 text-xs leading-relaxed text-text-muted">
      <strong className="text-text-dim">{t('heading')}</strong>：{t('body')}
    </div>
  );
}
