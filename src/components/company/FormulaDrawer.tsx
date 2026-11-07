// src/components/company/FormulaDrawer.tsx
'use client';
// Formula drawer for derived cells (plan 2026-11-06 Task 12; spec §5.4, §5.6; canvas Drawer B).
import { useLocale, useTranslations } from 'next-intl';
import { catalogFor } from '@/lib/company/metric-catalog';
import { DrawerShell } from './DrawerShell';
import { formatValue, unitKindOfUnit } from './format';
import type { DrawerTarget } from './DrawerHost';

export function FormulaDrawer({ asOf, target, onClose, onOpenInput }: {
  asOf: string | null; target: Extract<DrawerTarget, { kind: 'formula' }>; onClose: () => void; onOpenInput: (factId: string) => void;
}) {
  const t = useTranslations('company.drawer');
  const tm = useTranslations('company.metrics.names');
  const tc = useTranslations('company.concepts');
  const locale = useLocale() === 'en' ? 'en' : 'zh';
  const { cell, metric } = target;
  const entry = catalogFor(cell.formulaVersion)?.[metric];
  const name = tm.has(metric) ? tm(metric) : metric;
  const value = formatValue(cell.value, cell.unit === 'pure' ? 'ratio' : unitKindOfUnit(cell.unit), target.scaleExp);
  const rows: [string, string][] = [
    [t('basis'), cell.basis], [t('inputUnit'), cell.inputUnit], [t('formulaVersion'), cell.formulaVersion],
    [t('rule'), cell.rule === 'a' ? t('ruleA') : cell.rule === 'b' ? t('ruleB') : '—'],
    [t('asOf'), asOf ?? t('asOfLatest')],
    [t('computedAt'), target.computedAtKind === 'live' ? t('computedLive') : `${target.computedAt ?? '—'} · ${t('computedMaterialized')}`],
    [t('basedOnRev'), target.basedOnRev === null ? '—' : String(target.basedOnRev)],
  ];
  return (
    <DrawerShell label={t('formulaTitle')} kicker={t('formulaTitle')} title={`${name} ${metric} · ${target.periodLabel}`} onClose={onClose}>
      <div className="num text-2xl font-medium">{value}</div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 text-sm">
        {entry ? (<>{entry[locale].formula}<div className="mt-1.5 text-xs text-[var(--text-dim)]">{entry[locale === 'zh' ? 'en' : 'zh'].formula}</div></>)
          : <span className="text-[var(--text-dim)]">{t('formulaMissing', { version: cell.formulaVersion })}</span>}
      </div>
      <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-[var(--text-dim)]">{k}</dt><dd className="num">{v}</dd></div>)}
      </dl>
      <div>
        <div className="mb-1 text-xs text-[var(--text-dim)]">{t('inputs')}</div>
        <table className="w-full text-xs"><tbody>
          {cell.inputs.map((i) => (
            <tr key={i.factId} className="border-t border-[var(--border)]">
              <td className="py-1.5">
                <button type="button" onClick={() => onOpenInput(i.factId)} className="text-left text-[var(--accent)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                  {tc.has(i.concept) ? tc(i.concept) : i.concept} <span className="num text-[var(--text-dim)]">{i.concept}</span>
                </button>
              </td>
              <td className="num text-[var(--text-dim)]">{i.availableDate}</td>
              <td className="num text-[var(--text-dim)]">{i.filingId.slice(0, 8)}</td>
            </tr>
          ))}
        </tbody></table>
        <p className="mt-1.5 text-[11px] text-[var(--text-dim)]">{t('inputsNote')}</p>
      </div>
    </DrawerShell>
  );
}
