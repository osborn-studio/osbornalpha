'use client';

import { Panel, Tag } from '@/components/ui';
import { useSignals } from '@/lib/hooks/useSignals';
import type { Decision } from '@/lib/supabase/database.types';

export function SignalsRail({ ticker, openDecisions, onFocus }: {
  ticker: string | null;
  openDecisions: Decision[];
  onFocus: (t: string) => void;
}) {
  const { events, stats, loading } = useSignals(ticker);

  return (
    <div className="space-y-3">
      <Panel title={ticker ? `信号 · ${ticker}` : '信号'}>
        {loading && <p className="text-xs text-[var(--text-dim)]">加载中…</p>}
        {!loading && !events.length && <p className="text-xs text-[var(--text-dim)]">近期无信号</p>}
        <div className="space-y-1 text-xs">
          {events.slice(0, 6).map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="num shrink-0 text-[var(--text-dim)]">{e.date.slice(5)}</span>
              <span className="truncate">{e.triggers.map((t) => t.desc).join(' · ')}</span>
              <Tag tone={e.bias === 'bull' ? 'up' : e.bias === 'bear' ? 'down' : 'neutral'}>
                {e.bias === 'bull' ? '多' : e.bias === 'bear' ? '空' : '中'}
              </Tag>
            </div>
          ))}
        </div>
        {stats && (
          <p className="mt-2 border-t border-[var(--border)] pt-1.5 text-[10px] text-[var(--text-dim)]">
            5日胜率 {(stats.hit_rate_5d * 100).toFixed(0)}% · 均5日 {stats.avg_forward_5d_pct.toFixed(1)}%
          </p>
        )}
      </Panel>

      <Panel title={`未平决策 · ${openDecisions.length}`}>
        <div className="space-y-1 text-xs">
          {openDecisions.slice(0, 8).map((d) => (
            <button key={d.id} onClick={() => onFocus(d.ticker)}
              className="flex w-full items-center justify-between rounded px-1 py-0.5 text-left hover:bg-[var(--bg-card)]">
              <span className="num">{d.ticker}</span>
              <Tag tone={d.action === 'buy' || d.action === 'add' ? 'up' : d.action === 'sell' || d.action === 'trim' ? 'down' : 'neutral'}>
                {d.action}
              </Tag>
            </button>
          ))}
          {!openDecisions.length && <p className="text-[var(--text-dim)]">暂无未平决策</p>}
        </div>
      </Panel>

      <p className="text-center text-[10px] text-[var(--text-dim)]">🎩 按 ⌘K 呼出 Copilot 分析当前标的</p>
    </div>
  );
}
