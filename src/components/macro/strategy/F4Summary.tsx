'use client';
// Number-free F4 summary (spec §5.2 N12, §7): category, lifecycle words, calibration words, method id@version, as-of
// date and a link to the F4 method page. Never a distribution, margin, hit rate or percentage.
import Link from 'next/link';
import { Panel } from '@/components/ui';
import type { F4Summary } from '@/lib/macro/strategy/contract';
import { f4SummaryDisplay } from './strategy-view-model';
import { useStrategyT } from './use-strategy-t';

export function F4SummaryPanel({ summary }: { summary: F4Summary }) {
  const { t } = useStrategyT();
  const d = f4SummaryDisplay(summary, t);
  return (
    <Panel title={t('f4.title')} className="space-y-1 text-xs">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-text-dim">{t('f4.category')}</dt><dd>{d.category}</dd>
        <dt className="text-text-dim">{t('f4.lifecycleLabel')}</dt><dd>{d.lifecycle}</dd>
      </dl>
      <p>{d.calibration}</p>
      <p className="font-mono text-text-dim">{d.method} · {d.asOf}</p>
      {d.href ? <Link href={d.href} className="text-accent hover:underline">{t('f4.link')}</Link> : null}
      <p className="text-[10px] text-text-dim">{t('f4.noNumbers')}</p>
    </Panel>
  );
}
