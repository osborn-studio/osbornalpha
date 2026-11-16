'use client';

import type { Regime } from '@/lib/macro/judgment-contract';
import { ALLOCATION_TEMPLATE_VERSION, allocationRows } from '@/lib/macro/allocation-template';
import { useMacroT } from './use-macro-t';

const ASSETS = ['equity', 'bond', 'commodity', 'cash'] as const;

/** A static reference; the published clock selection only marks a row. */
export function AllocationTemplateCard({ current }: { current: Regime | null }) {
  const { t } = useMacroT();
  const a = (key: string) => t(`judgment.allocation.${key}`);
  return (
    <section aria-label={a('title')} className="mt-3 min-w-0 space-y-3 rounded-md border border-border bg-[var(--bg-card)] p-4">
      <header className="space-y-2">
        <p className="flex flex-wrap gap-x-2 text-xs font-semibold text-text-dim">
          <span>{a('labels.framework')}</span><span aria-hidden="true">·</span>
          <span>{a('labels.untested')}</span><span aria-hidden="true">·</span>
          <span>{a('labels.disclaimer')}</span>
        </p>
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold">{a('title')}</h2>
          {current === null && <span className="text-xs text-text-dim">{a('staticReference')}</span>}
        </div>
        <p className="text-xs text-text-dim">{a('proportions')} · {a('scope')}</p>
      </header>
      <ul className="space-y-2">
        {allocationRows().map(({ regime, weights }) => (
          <li key={regime} aria-current={current === regime ? 'true' : undefined} data-current={current === regime ? 'true' : undefined}
            className={`min-w-0 space-y-2 rounded-md border p-3 ${current === regime ? 'border-[var(--border-active)] bg-[var(--accent-wash)]' : 'border-border'}`}>
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-sm font-semibold">{t(`judgment.clock.${regime}`)}</h3>
              {current === regime && <span className="text-xs font-semibold text-[var(--accent)]">{a('current')}</span>}
            </div>
            <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-4">
              {ASSETS.map(asset => <div key={asset} className="flex items-baseline justify-between gap-2 sm:block">
                <dt className="text-text-dim">{a(`assets.${asset}`)}</dt>
                <dd className="font-mono tabular-nums">{weights[asset]}%</dd>
              </div>)}
            </dl>
            <p className="text-xs leading-relaxed text-text-dim">{a(`tilt.${regime}`)}</p>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-text-dim">{a('source')}</p>
      <p className="break-all font-mono text-[11px] text-text-dim">{ALLOCATION_TEMPLATE_VERSION}</p>
    </section>
  );
}
