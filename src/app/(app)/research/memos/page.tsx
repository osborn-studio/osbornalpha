'use client';

// Research OS — Memos 列表页（Phase 1 本地专用工具）。
// i18n 豁免：本模块为单用户本地研究工具，文案暂用 zh 硬编码，不进 G 系 i18n 管辖。

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { InvestmentMemo } from '@/lib/research/types';

export default function ResearchMemosPage() {
  const [memos, setMemos] = useState<InvestmentMemo[]>([]);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/research/memos');
      if (res.status === 501) { setDisabled(true); return; }
      const data = await res.json().catch(() => ({ memos: [] }));
      setMemos(data.memos ?? []);
    })();
  }, []);

  if (disabled) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
        Research OS 为本地专用模式，未启用。请在本地 .env.local 设置 RESEARCH_OS_ENABLED=1。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Memos（{memos.length}）</h1>
      <p className="text-sm text-gray-500">
        从 <Link href="/research/companies" className="underline">公司档案页</Link> 点「生成投资 Memo」创建新 memo。
      </p>
      <ul className="divide-y rounded-lg border">
        {memos.map((m) => (
          <li key={m.id} className="p-3 text-sm">
            <Link href={`/research/memos/${m.id}`} className="font-medium underline">{m.title}</Link>
            <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs">{m.status}</span>
            <span className="ml-1 rounded bg-gray-100 px-2 py-0.5 text-xs">conf {m.confidence}</span>
            <div className="mt-1 text-xs text-gray-500">{m.created_at} · {m.one_line_conclusion}</div>
          </li>
        ))}
        {memos.length === 0 && <li className="p-3 text-sm text-gray-500">暂无 memo</li>}
      </ul>
    </div>
  );
}
