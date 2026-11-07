// src/components/company/tracking/ImportResultPanel.tsx
// Result of "import from watchlist" (artboard Tracking): added / existing / unresolved / over the limit.
'use client';

import { useTranslations } from 'next-intl';
import { Button, Card } from '@/components/ui';
import type { ImportResult } from '@/lib/company/tracking-client';

export function ImportResultPanel({ result, onDismiss }: { result: ImportResult; onDismiss: () => void }) {
  const t = useTranslations('tracking');
  const tickers = (items: { ticker: string }[]) => (items.length ? `（${items.map((i) => i.ticker).join('、')}）` : '');
  return (
    <Card className="mb-3" data-testid="import-result">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold">{t('import.title')}</span>
        <Button variant="ghost" size="sm" onClick={onDismiss}>{t('import.dismiss')}</Button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-text-muted">
        <span>{t('import.added', { count: result.added.length })}</span>
        <span>{t('import.existing', { count: result.existing.length })}</span>
        <span>{t('import.unresolved', { count: result.unresolved.length })}{tickers(result.unresolved)}</span>
        <span>{t('import.skippedByLimit', { count: result.skippedByLimit.length })}{tickers(result.skippedByLimit)}</span>
      </div>
    </Card>
  );
}
