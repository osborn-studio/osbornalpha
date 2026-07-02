'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Panel } from '@/components/ui';
import { Disclaimer } from '@/components/Disclaimer';

interface Artifact {
  id: string;
  skill_id: string;
  ticker: string | null;
  title: string;
  created_at: string;
}

const CARDS = [
  { icon: '🧰', title: '技能库', desc: 'Copilot 的分析方法 + 工具清单。', href: '/skills' },
  { icon: '🧪', title: '回测实验室', desc: '批量回测股票池信号命中率与前瞻收益。', href: '/backtest' },
  { icon: '🧮', title: 'DCF 工作台', desc: '独立的现金流折现估值台，搜索个股即可用。', href: '/tools/dcf' },
  { icon: '🏛️', title: '一级市场', desc: 'IC Memo / PE Portfolio / LP 追踪 大纲生成器。', href: '/tools/primary' },
] as const;

export default function ToolsPage() {
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/artifacts?limit=8')
      .then((r) => r.json())
      .then((body) => { if (!cancelled) setArtifacts(body.artifacts ?? []); })
      .catch((e) => { if (!cancelled) setErr(String(e)); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <h1 className="mb-1 text-xl font-bold">🧰 工具</h1>
      <p className="mb-4 text-sm text-text-dim">技能库、回测、估值工作台与一级市场研究入口。</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="card-base block transition-colors hover:bg-bg-card">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-lg">{c.icon}</span>{c.title}
            </div>
            <div className="mt-1 text-xs text-text-muted">{c.desc}</div>
            <div className="mt-2 text-xs font-semibold text-accent">进入 →</div>
          </Link>
        ))}
      </div>

      <Panel title="📁 最近工具产出" className="mt-4">
        {err && <div className="text-xs text-down">加载失败：{err}</div>}
        {!err && artifacts === null && <div className="text-xs text-text-muted">加载中…</div>}
        {!err && artifacts !== null && artifacts.length === 0 && (
          <div className="text-xs text-text-muted">还没有产出。使用上面的入口运行一次分析后，报告会自动归档在这里。</div>
        )}
        {artifacts && artifacts.length > 0 && (
          <div className="space-y-1">
            {artifacts.map((a) => (
              <div key={a.id} className="grid grid-cols-[auto_auto_1fr] items-center gap-3 rounded-md bg-bg-card px-3 py-2">
                <span className="font-mono text-[11px] text-text-dim">{a.created_at.slice(0, 10)}</span>
                <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-dim">
                  {a.skill_id}{a.ticker ? ` · ${a.ticker}` : ''}
                </span>
                <span className="truncate text-sm">{a.title}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Disclaimer />
    </>
  );
}
