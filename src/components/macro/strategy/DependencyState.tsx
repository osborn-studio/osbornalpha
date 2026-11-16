'use client';
// Dependency and empty states (spec §9.1, §11; canvas "依赖未就绪 / 复盘列表"): foundation not wired, judgment layer
// unavailable, no published snapshot, not found, load failure. Never renders placeholder data.
import { Button, Panel } from '@/components/ui';
import { useStrategyT } from './use-strategy-t';

export type DependencyKind = 'loading' | 'foundation' | 'judgments_unavailable' | 'no_snapshot' | 'not_found' | 'error';

export function DependencyState({ kind, code, onRetry }: { kind: DependencyKind; code?: string; onRetry?: () => void }) {
  const { t } = useStrategyT();
  if (kind === 'loading') return <div role="status" className="text-xs text-text-dim">{t('dependency.loading')}</div>;
  const title = kind === 'foundation' ? t('dependency.foundationTitle')
    : kind === 'judgments_unavailable' ? t('dependency.judgmentsUnavailable')
    : kind === 'no_snapshot' ? t('dependency.noSnapshot')
    : kind === 'not_found' ? t('dependency.notFound')
    : t('dependency.loadFailed', { code: code ?? 'unknown' });
  const body = kind === 'foundation' ? t('dependency.foundationBody')
    : kind === 'judgments_unavailable' ? t('dependency.judgmentsUnavailableBody')
    : null;
  return (
    <Panel role="status" className="space-y-2">
      <div className="text-sm font-semibold">{title}</div>
      {body ? <p className="text-xs text-text-dim">{body}</p> : null}
      {onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>{t('dependency.retry')}</Button> : null}
    </Panel>
  );
}
