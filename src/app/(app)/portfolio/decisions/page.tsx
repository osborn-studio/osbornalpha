'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Panel, Button, Tag } from '@/components/ui';
import { formatPrice } from '@/lib/utils';
import type { Decision, DecisionStatus } from '@/lib/supabase/database.types';

function SubNav({ current }: { current: 'cockpit' | 'decisions' | 'positions' | 'review' }) {
  const items: Array<{ key: typeof current; href: string; label: string }> = [
    { key: 'cockpit', href: '/portfolio', label: '驾驶舱' },
    { key: 'decisions', href: '/portfolio/decisions', label: '决策日志' },
    { key: 'positions', href: '/portfolio/positions', label: '持仓明细' },
    { key: 'review', href: '/portfolio/review', label: '复盘' },
  ];
  return (
    <nav className="flex items-center gap-3 text-sm">
      {items.map((item, i) => (
        <span key={item.key} className="flex items-center gap-3">
          {i > 0 && <span className="text-[var(--text-dim)]">·</span>}
          <Link
            href={item.href}
            className={item.key === current ? 'font-medium text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}
          >
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}

const ACTION_LABEL: Record<Decision['action'], string> = {
  buy: '买入', sell: '卖出', trim: '减仓', add: '加仓', hold: '持有', pass: '观望',
};

const STATUS_LABEL: Record<DecisionStatus, string> = {
  open: '待执行', executed: '已执行', expired: '已过期', cancelled: '已取消',
};

const STATUS_TONE: Record<DecisionStatus, 'accent' | 'up' | 'neutral' | 'down'> = {
  open: 'accent', executed: 'up', expired: 'neutral', cancelled: 'down',
};

const FILTERS: Array<{ key: DecisionStatus | 'all'; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'open', label: 'open' },
  { key: 'executed', label: 'executed' },
  { key: 'expired', label: 'expired' },
  { key: 'cancelled', label: 'cancelled' },
];

export default function DecisionsPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DecisionStatus | 'all'>('all');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/decisions');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `http ${res.status}`);
      setDecisions(json.decisions ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  const filtered = useMemo(
    () => (filter === 'all' ? decisions : decisions.filter((d) => d.status === filter)),
    [decisions, filter],
  );

  const cancel = async (id: string) => {
    setCancellingId(id);
    try {
      const res = await fetch(`/api/decisions/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `http ${res.status}`);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <SubNav current="decisions" />

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? 'primary' : 'secondary'}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-dim)]">加载中…</p>
      ) : error ? (
        <p className="text-sm text-[var(--down)]">{error}</p>
      ) : filtered.length === 0 ? (
        <Panel>
          <p className="text-sm text-[var(--text-dim)]">暂无决策记录</p>
        </Panel>
      ) : (
        <Panel title={`决策日志 · ${filtered.length}`}>
          <table className="num w-full text-left text-xs">
            <thead>
              <tr className="text-[var(--text-dim)]">
                <th className="pb-1 font-normal">日期</th>
                <th className="pb-1 font-normal">标的</th>
                <th className="pb-1 font-normal">动作</th>
                <th className="pb-1 font-normal">理由</th>
                <th className="pb-1 font-normal">信心</th>
                <th className="pb-1 font-normal">目标价</th>
                <th className="pb-1 font-normal">止损</th>
                <th className="pb-1 font-normal">状态</th>
                <th className="pb-1 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-t border-[var(--border)]">
                  <td className="py-1">{d.decided_at.slice(0, 10)}</td>
                  <td className="py-1"><Link href={`/stock/${encodeURIComponent(d.ticker)}`} className="text-accent hover:underline">{d.ticker}</Link></td>
                  <td className="py-1">{ACTION_LABEL[d.action]}</td>
                  <td className="max-w-[240px] truncate py-1 text-left" title={d.thesis ?? undefined}>{d.thesis ?? '--'}</td>
                  <td className="py-1">{d.confidence ?? '--'}</td>
                  <td className="py-1">{d.target_price !== null ? formatPrice(d.target_price) : '--'}</td>
                  <td className="py-1">{d.stop_loss !== null ? formatPrice(d.stop_loss) : '--'}</td>
                  <td className="py-1"><Tag tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Tag></td>
                  <td className="py-1">
                    {d.status === 'open' && (
                      <Button size="sm" variant="danger" disabled={cancellingId === d.id} onClick={() => cancel(d.id)}>
                        取消
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
