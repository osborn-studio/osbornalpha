// CatalogCoverage — 目录覆盖 (spec §3.2): verified / catalog as counts (never percentages), not-verified items with
// their reasons, and collection status per dataset (spec §4.5 collection freshness).
import { Panel } from '@/components/ui';
import type { MacroT } from './use-macro-t';
import type { CollectionView, CoverageView } from './view-model';

export function CatalogCoverage({ coverage, collection, t, onMethodology }: { coverage: CoverageView; collection: CollectionView[]; t: MacroT; onMethodology?: () => void }) {
  return (
    <Panel title={t('coverage.title')}>
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-text-dim">{t('coverage.verified')}</span>
        <span className="font-mono text-2xl font-semibold tabular-nums">{coverage.verified}</span>
        <span className="text-xs text-text-dim">/ {t('coverage.catalog')}</span>
        <span className="font-mono text-2xl font-semibold tabular-nums text-text-dim">{coverage.total}</span>
        {onMethodology && (
          <button type="button" onClick={onMethodology} className="ml-auto text-[11px] text-accent">{t('coverage.methodLink')}</button>
        )}
      </div>
      <div className="mt-3 text-[10px] uppercase tracking-wider text-text-dim">{t('coverage.notVerified')}</div>
      {coverage.notVerified.length === 0 ? (
        <div className="mt-1 text-xs text-text-dim">{t('coverage.none')}</div>
      ) : (
        <ul className="mt-1 space-y-1 text-xs">
          {coverage.notVerified.map((n) => (
            <li key={n.seriesId} className="flex gap-2">
              <span className="min-w-[120px]">{n.name}</span>
              <span className="text-text-dim">{t(`status.${n.status}`)}{n.reason ? `：${n.reason}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 text-[10px] uppercase tracking-wider text-text-dim">{t('coverage.collectionTitle')}</div>
      <table className="mt-1 w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] text-text-dim">
            <th className="py-1 font-medium">{t('coverage.dataset')}</th>
            <th className="py-1 font-medium">{t('coverage.state')}</th>
            <th className="py-1 font-medium">{t('coverage.lastOk')}</th>
          </tr>
        </thead>
        <tbody>
          {collection.map((c) => (
            <tr key={c.dataset} className="border-t border-border">
              <td className="py-1 font-mono">{c.dataset}</td>
              <td className={`py-1 ${c.status === 'error' || c.status === 'stale' ? 'text-warn' : c.status === 'missing' ? 'text-text-dim' : ''}`}>{t(`collection.${c.status}`)}</td>
              <td className="py-1 font-mono tabular-nums text-text-dim">{c.lastOk}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
