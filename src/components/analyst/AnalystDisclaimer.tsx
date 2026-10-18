'use client';

import { useTranslations } from 'next-intl';

export function AnalystDisclaimer() {
  const t = useTranslations('analyst');
  return (
    <footer className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-dim)]">
      {t('disclaimer')}
    </footer>
  );
}
