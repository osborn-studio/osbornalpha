'use client';
import Link from 'next/link';
import {Button} from '@/components/ui';
import type {ColumnMode} from './strategy-view-model';
import {useStrategyT} from './use-strategy-t';
export function ColumnToggle({mode, onMode, hidden}: {mode: ColumnMode; onMode: (mode: ColumnMode) => void; hidden: number}) {
  const {t} = useStrategyT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={t('columns.label')} className="flex gap-1">
        {(['available', 'all'] as const).map(value => (
          <Button key={value} size="sm" variant={mode === value ? 'primary' : 'secondary'} aria-pressed={mode === value} onClick={() => onMode(value)}>{t(`columns.${value}`)}</Button>
        ))}
      </div>
      {hidden > 0 ? <p className="text-[11px] text-text-dim">{t('columns.hidden', {n: hidden})} · <Link href="/macro?tab=methodology#data-gaps" className="text-accent hover:underline">{t('columns.plan')}</Link></p> : null}
    </div>
  );
}
