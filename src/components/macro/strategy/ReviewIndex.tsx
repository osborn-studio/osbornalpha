'use client';
// Review list (spec §3.5; canvas "复盘列表"): month × region grid with generated / insufficient / no result and the
// generation time. Failed attempts are service-only logs and never appear here.
import Link from 'next/link';
import { Panel } from '@/components/ui';
import type { ReviewIndexItem } from '@/lib/macro/strategy/route-helpers';
import { formatInstant, reviewGrid, type IndexCell } from './strategy-view-model';
import { useStrategyT } from './use-strategy-t';

export function ReviewIndex({ months, us, cn }: { months: string[]; us: ReviewIndexItem[]; cn: ReviewIndexItem[] }) {
  const { t } = useStrategyT();
  return (
    <Panel className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('review.title')}</h2>
        <span className="text-[11px] text-text-dim">{t('review.indexSubtitle')}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-text-dim">
              <th className="px-1.5 py-1 font-medium">{t('review.month')}</th>
              <th className="px-1.5 py-1 font-medium">{t('region.US')}</th>
              <th className="px-1.5 py-1 font-medium">{t('region.CN')}</th>
            </tr>
          </thead>
          <tbody>
            {reviewGrid(months, us, cn).map((row) => (
              <tr key={row.month} className="border-t border-border">
                <td className="px-1.5 py-1 font-mono tabular-nums">{row.month}</td>
                <IndexTd cell={row.US} href={`/intel/macro/review/US/${row.month}`} />
                <IndexTd cell={row.CN} href={`/intel/macro/review/CN/${row.month}`} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function IndexTd({ cell, href }: { cell: IndexCell; href: string }) {
  const { t } = useStrategyT();
  const label = t(`review.status.${cell.status}`);
  return (
    <td className="px-1.5 py-1">
      {cell.status === 'none' ? <span className="text-text-dim">{label}</span> : <Link href={href} className="text-accent hover:underline">{label}</Link>}
      {cell.updatedAt ? <span className="ml-2 font-mono text-[10px] text-text-dim">{t('review.generatedAt', { time: formatInstant(cell.updatedAt) })}</span> : null}
    </td>
  );
}
