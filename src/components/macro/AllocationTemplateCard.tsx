'use client';

import type { Regime } from '@/lib/macro/judgment-contract';
import { ALLOCATION_TEMPLATE_VERSION, allocationRows } from '@/lib/macro/allocation-template';
import { useMacroT } from './use-macro-t';
import './investment-clock.css';

const ASSETS = ['equity', 'bond', 'commodity', 'cash'] as const;

/** A static reference; the published clock selection only marks a row. */
export function AllocationTemplateCard({ current }: { current: Regime | null }) {
  const { t } = useMacroT();
  const a = (key: string) => t(`judgment.allocation.${key}`);
  return (
    <section aria-label={a('title')} className="allocation-template">
      <header className="allocation-header">
        <p className="allocation-labels">
          <span className="allocation-pill">{a('labels.framework')}</span>
          <span className="allocation-pill">{a('labels.untested')}</span>
          <span className="allocation-pill">{a('labels.disclaimer')}</span>
        </p>
        <div className="allocation-heading">
          <h2 className="allocation-title">{a('title')}</h2>
          {current === null && <span className="allocation-scope">{a('staticReference')}</span>}
        </div>
        <p className="allocation-scope">{a('proportions')} · {a('scope')}</p>
      </header>
      <ul className="allocation-regimes">
        {allocationRows().map(({ regime, weights }) => (
          <li key={regime} aria-current={current === regime ? 'true' : undefined} data-current={current === regime ? 'true' : undefined}
            className="allocation-regime">
            <div className="allocation-heading">
              <h3 className="allocation-regime-name">{t(`judgment.clock.${regime}`)}</h3>
              {current === regime && <span className="allocation-pill allocation-current">{a('current')}</span>}
            </div>
            <dl className="allocation-assets">
              {ASSETS.map(asset => <div key={asset} className="allocation-asset">
                <dt className="allocation-asset-label">{a(`assets.${asset}`)}</dt>
                <dd className="allocation-ratio">{weights[asset]}%</dd>
              </div>)}
            </dl>
            <p className="allocation-note">{a(`tilt.${regime}`)}</p>
          </li>
        ))}
      </ul>
      <p className="allocation-note">{a('source')}</p>
      <p className="allocation-version">{ALLOCATION_TEMPLATE_VERSION}</p>
    </section>
  );
}
