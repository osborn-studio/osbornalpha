'use client';

// Research OS — Memo Workspace（Phase 1 本地专用工具）。
// 分段编辑 + 引用侧栏 + axiom 面板 + markdown 导出（尾注免责声明）。
// i18n 豁免：本模块为单用户本地研究工具，文案暂用 zh 硬编码，不进 G 系 i18n 管辖。

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { AxiomCheckResult, EvidenceItem, InvestmentMemo, SourceDocument } from '@/lib/research/types';
import { RESEARCH_DISCLAIMER } from '@/lib/research/types';

interface MemoResponse {
  memo: InvestmentMemo;
  sources: SourceDocument[];
}

function EvidenceBlock({ label, items, sources, onOpenSource }: {
  label: string;
  items: EvidenceItem[];
  sources: SourceDocument[];
  onOpenSource: (id: string) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium">{label}</h3>
      <ul className="mt-1 space-y-1">
        {items.map((ev, i) => (
          <li key={i} className="rounded border p-2 text-sm">
            {ev.claim}
            {ev.low_confidence && (
              <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">LOW_CONFIDENCE 无来源</span>
            )}
            <span className="ml-2">
              {ev.source_document_ids.map((id) => (
                <button
                  key={id}
                  onClick={() => onOpenSource(id)}
                  className="mr-1 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 hover:bg-blue-100"
                  title={sources.find((s) => s.id === id)?.title ?? id}
                >
                  引用 {id.slice(0, 8)}
                </button>
              ))}
            </span>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-gray-500">（无）</li>}
      </ul>
    </div>
  );
}

function ListEditor({ label, field, values, onSave }: {
  label: string;
  field: string;
  values: string[];
  onSave: (field: string, value: string[]) => Promise<void>;
}) {
  const [text, setText] = useState(values.join('\n'));
  useEffect(() => { setText(values.join('\n')); }, [values]);
  return (
    <div>
      <h3 className="text-sm font-medium">{label}</h3>
      <textarea
        className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
        rows={Math.max(2, values.length + 1)}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const next = text.split('\n').map((s) => s.trim()).filter(Boolean);
          if (JSON.stringify(next) !== JSON.stringify(values)) void onSave(field, next);
        }}
      />
      <p className="text-xs text-gray-400">每行一条，失焦保存</p>
    </div>
  );
}

export default function ResearchMemoPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<MemoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSource, setOpenSource] = useState<SourceDocument | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/research/memos/${params.id}`);
    if (!res.ok) {
      setError(res.status === 501 ? 'Research OS 未启用（本地专用）' : `加载失败：${res.status}`);
      return;
    }
    setData(await res.json());
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  async function save(field: string, value: unknown) {
    const res = await fetch(`/api/research/memos/${params.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    const out = await res.json().catch(() => ({}));
    setNotice(res.ok ? `已保存 ${field}` : `保存失败：${out?.error?.message ?? res.status}`);
    if (res.ok) await load();
  }

  async function review() {
    const res = await fetch(`/api/research/memos/${params.id}/review`, { method: 'POST' });
    const out = await res.json().catch(() => ({}));
    if (res.status === 422) {
      setNotice('审批被 axiom 阻断：先清零 BLOCK 项');
    } else if (res.ok) {
      setNotice('已通过审批 → REVIEWED');
    } else {
      setNotice(`审批失败：${out?.error?.message ?? res.status}`);
    }
    await load();
  }

  if (error) return <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">{error}</div>;
  if (!data) return <p className="p-6 text-sm text-gray-500">加载中…</p>;

  const { memo, sources } = data;
  const blocked = memo.axiom_check_results.some((r) => r.severity === 'BLOCK' && !r.passed);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <header className="rounded-lg border p-4">
          <input
            className="w-full rounded border px-2 py-1.5 text-lg font-semibold"
            defaultValue={memo.title}
            onBlur={(e) => { if (e.target.value !== memo.title) void save('title', e.target.value); }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-gray-100 px-2 py-0.5">{memo.status}</span>
            <label>
              置信度
              <select
                className="ml-1 rounded border px-1 py-0.5"
                value={memo.confidence}
                onChange={(e) => void save('confidence', e.target.value)}
              >
                <option>LOW</option><option>MEDIUM</option><option>HIGH</option>
              </select>
            </label>
            <a
              className="rounded bg-black px-3 py-1 text-white"
              href={`/api/research/memos/${memo.id}?format=markdown`}
            >
              导出 Markdown
            </a>
            <button
              onClick={review}
              disabled={memo.status === 'REVIEWED'}
              className="rounded border px-3 py-1 disabled:opacity-50"
              title={blocked ? 'BLOCK 未清零，将被 422 拒绝' : ''}
            >
              {memo.status === 'REVIEWED' ? '已 REVIEWED' : '提交审批'}
            </button>
          </div>
          {notice && <p className="mt-2 text-xs text-gray-600">{notice}</p>}
        </header>

        <section className="space-y-4 rounded-lg border p-4">
          <div>
            <h3 className="text-sm font-medium">1. 一句话结论</h3>
            <textarea
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
              rows={2}
              defaultValue={memo.one_line_conclusion}
              onBlur={(e) => { if (e.target.value !== memo.one_line_conclusion) void save('one_line_conclusion', e.target.value); }}
            />
          </div>
          <div>
            <h3 className="text-sm font-medium">2. 核心 Thesis</h3>
            <textarea
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
              rows={3}
              defaultValue={memo.thesis}
              onBlur={(e) => { if (e.target.value !== memo.thesis) void save('thesis', e.target.value); }}
            />
          </div>
          <EvidenceBlock
            label="3. 支持证据"
            items={memo.supporting_evidence}
            sources={sources}
            onOpenSource={(id) => setOpenSource(sources.find((s) => s.id === id) ?? null)}
          />
          <EvidenceBlock
            label="4. 反方观点"
            items={memo.counter_arguments}
            sources={sources}
            onOpenSource={(id) => setOpenSource(sources.find((s) => s.id === id) ?? null)}
          />
          <ListEditor label="5. 关键变量" field="key_variables" values={memo.key_variables} onSave={save} />
          <ListEditor label="6. 失效条件" field="invalidation_conditions" values={memo.invalidation_conditions} onSave={save} />
          <ListEditor label="7. 需要继续验证的问题" field="open_questions" values={memo.open_questions} onSave={save} />
          <ListEditor label="8. 相关公司/产业链影响" field="related_impacts" values={memo.related_impacts} onSave={save} />
        </section>

        <footer className="rounded-lg border bg-gray-50 p-3 text-xs text-gray-500">
          免责声明：{RESEARCH_DISCLAIMER}
        </footer>
      </div>

      <aside className="space-y-4">
        <section className="rounded-lg border p-3">
          <h2 className="text-sm font-medium">Axiom 检查</h2>
          <ul className="mt-2 space-y-1">
            {memo.axiom_check_results.map((r: AxiomCheckResult) => (
              <li key={r.axiom_code} className="text-xs">
                <span className={r.passed ? 'text-green-700' : r.severity === 'BLOCK' ? 'text-red-700' : 'text-amber-700'}>
                  {r.passed ? '✅' : r.severity === 'BLOCK' ? '⛔' : '⚠️'} {r.axiom_code}
                </span>{' '}
                {r.message}
              </li>
            ))}
            {memo.axiom_check_results.length === 0 && <li className="text-xs text-gray-500">未运行</li>}
          </ul>
        </section>

        <section className="rounded-lg border p-3">
          <h2 className="text-sm font-medium">引用来源（{sources.length}）</h2>
          <ul className="mt-2 space-y-1">
            {sources.map((s) => (
              <li key={s.id}>
                <button className="text-left text-xs underline" onClick={() => setOpenSource(s)}>
                  {s.title}
                </button>
              </li>
            ))}
            {sources.length === 0 && <li className="text-xs text-gray-500">无引用</li>}
          </ul>
          {openSource && (
            <div className="mt-3 rounded border bg-gray-50 p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{openSource.title}</span>
                <button className="text-xs text-gray-500" onClick={() => setOpenSource(null)}>关闭</button>
              </div>
              <p className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-gray-600">
                {openSource.raw_text.slice(0, 2000)}
                {openSource.raw_text.length > 2000 && '…'}
              </p>
            </div>
          )}
        </section>

        <section className="rounded-lg border p-3 text-xs text-gray-500">
          <h2 className="text-sm font-medium text-gray-700">Provenance</h2>
          <p className="mt-1">model: {memo.provenance.model ?? 'n/a'}</p>
          <p className="break-all">prompt_sha256: {memo.provenance.prompt_sha256 ?? 'n/a'}</p>
          <p>generated_at: {memo.provenance.generated_at ?? 'n/a'}</p>
          <p>sources: {memo.provenance.source_document_ids?.length ?? 0}</p>
          <p>edits: {memo.provenance.edits?.length ?? 0}</p>
        </section>
      </aside>
    </div>
  );
}
