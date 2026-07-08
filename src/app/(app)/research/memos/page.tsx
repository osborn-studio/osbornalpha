'use client';

// Research OS — Memos 列表页（Phase 1 本地专用工具）。
// i18n 豁免：本模块为单用户本地研究工具，文案暂用 zh 硬编码，不进 G 系 i18n 管辖。

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { InvestmentMemo } from '@/lib/research/types';

export default function ResearchMemosPage() {
  const router = useRouter();
  const [memos, setMemos] = useState<InvestmentMemo[]>([]);
  const [disabled, setDisabled] = useState(false);
  const [tab, setTab] = useState<'thesis' | 'deal'>('thesis');

  // Deal-memo creation form state.
  const [target, setTarget] = useState('');
  const [dealContext, setDealContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/research/memos');
      if (res.status === 401 || res.status === 403) { setDisabled(true); return; }
      const data = await res.json().catch(() => ({ memos: [] }));
      setMemos(data.memos ?? []);
    })();
  }, []);

  async function generateDeal() {
    if (!target.trim()) { setNotice('请填写交易标的（target）'); return; }
    setBusy(true);
    setNotice('生成中…（LLM 首稿，请稍候）');
    try {
      const res = await fetch('/api/research/memos/generate-deal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: target.trim(), deal_context: dealContext.trim() || undefined }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.status === 201 && out.memo) {
        const gateMsg = out.gate && !out.gate.ok
          ? `（deal 门未齐：${(out.gate.missing ?? []).join('、')}——草稿已存，请人工补全）`
          : '';
        setNotice(`已生成 deal memo 草稿 ${gateMsg}`);
        router.push(`/research/memos/${out.memo.id}`);
      } else if (res.status === 502) {
        setNotice(`LLM 未配置或调用失败：${out?.error?.message ?? '未知错误'}`);
      } else {
        setNotice(`生成失败：${out?.error?.message ?? res.status}`);
      }
    } finally {
      setBusy(false);
    }
  }

  if (disabled) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
        Research OS 该模块暂未开放——需以 admin 角色登录后访问（个人云工具规格）。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Memos（{memos.length}）</h1>

      {/* 新建区：论点 memo | 上会 deal memo */}
      <div className="rounded-lg border">
        <div className="flex border-b text-sm">
          <button
            className={`px-4 py-2 ${tab === 'thesis' ? 'border-b-2 border-black font-medium' : 'text-gray-500'}`}
            onClick={() => setTab('thesis')}
          >
            论点 memo
          </button>
          <button
            className={`px-4 py-2 ${tab === 'deal' ? 'border-b-2 border-black font-medium' : 'text-gray-500'}`}
            onClick={() => setTab('deal')}
          >
            📋 上会 deal memo
          </button>
        </div>

        {tab === 'thesis' ? (
          <p className="p-4 text-sm text-gray-500">
            从 <Link href="/research/companies" className="underline">公司档案页</Link> 点「生成投资 Memo」创建二级市场论点 memo。
          </p>
        ) : (
          <div className="space-y-3 p-4">
            <p className="text-xs text-gray-500">
              一级市场兼容的投委会上会报告（PE / 并购 / 融资 / Pre-IPO）。填交易标的与已知条款，生成 8 段叙事 + 一级市场估值体系 + 投/不投判断的 AI 初稿。
            </p>
            <div>
              <label className="text-sm font-medium">交易标的（target）</label>
              <input
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                placeholder="例：某半导体设备商 60% 股权收购"
                value={target}
                maxLength={100}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">交易条款（deal_context，可选，≤2000 字，权威）</label>
              <textarea
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                rows={4}
                placeholder="对价 / 估值 / 结构 / 支付方式 / 对赌 / 先决条件…（给定条款优先于公开研究）"
                value={dealContext}
                maxLength={2000}
                onChange={(e) => setDealContext(e.target.value)}
              />
            </div>
            <button
              className="rounded bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50"
              onClick={generateDeal}
              disabled={busy}
            >
              {busy ? '生成中…' : '生成上会 deal memo'}
            </button>
            {notice && <p className="text-xs text-gray-600">{notice}</p>}
          </div>
        )}
      </div>

      <ul className="divide-y rounded-lg border">
        {memos.map((m) => (
          <li key={m.id} className="p-3 text-sm">
            <Link href={`/research/memos/${m.id}`} className="font-medium underline">{m.title}</Link>
            {m.memo_type === 'deal' && (
              <span className="ml-2 rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800">📋 上会</span>
            )}
            <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs">{m.status}</span>
            {m.memo_type !== 'deal' && (
              <span className="ml-1 rounded bg-gray-100 px-2 py-0.5 text-xs">conf {m.confidence}</span>
            )}
            <div className="mt-1 text-xs text-gray-500">
              {m.created_at} · {m.memo_type === 'deal'
                ? (m.deal_context || '（无交易条款）')
                : m.one_line_conclusion}
            </div>
          </li>
        ))}
        {memos.length === 0 && <li className="p-3 text-sm text-gray-500">暂无 memo</li>}
      </ul>
    </div>
  );
}
