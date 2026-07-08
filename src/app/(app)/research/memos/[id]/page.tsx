'use client';

// Research OS — Memo Workspace（Phase 1 本地专用工具）。
// 分段编辑 + 引用侧栏 + axiom 面板 + markdown 导出（尾注免责声明）。
// i18n 豁免：本模块为单用户本地研究工具，文案暂用 zh 硬编码，不进 G 系 i18n 管辖。

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type {
  AxiomCheckResult,
  DealSection,
  DealValuation,
  EvidenceItem,
  InvestmentMemo,
  SourceDocument,
} from '@/lib/research/types';
import { RESEARCH_DISCLAIMER } from '@/lib/research/types';

interface MemoResponse {
  memo: InvestmentMemo;
  sources: SourceDocument[];
}

// --- Deal-memo (memo_type='deal') read view. Empty fields render as
// 待核实/未提供, never hidden — the primary-market valuation structure is always
// visible. Secondary-market comps are labelled 仅交叉验证 · 不覆盖一级逻辑. ---

const DEAL_VERDICT: Record<string, { label: string; cls: string }> = {
  invest: { label: '投', cls: 'bg-green-100 text-green-800' },
  conditional: { label: '有条件投', cls: 'bg-amber-100 text-amber-800' },
  pass: { label: '不投', cls: 'bg-red-100 text-red-800' },
};

function na(v: unknown): string {
  return v == null || v === '' ? '待核实' : String(v);
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex justify-between gap-2 border-b py-1 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className={value == null || value === '' ? 'text-gray-400' : 'font-medium'}>
        {value == null || value === '' ? '待核实' : String(value)}
      </span>
    </div>
  );
}

function DealSectionBlock({ section, index }: { section: DealSection; index: number }) {
  const tag = (label: string, items: string[], cls: string) =>
    items.length > 0 && (
      <div className="mt-1 flex flex-wrap gap-1">
        {items.map((t, i) => (
          <span key={i} className={`rounded px-1.5 py-0.5 text-xs ${cls}`}>{label}：{t}</span>
        ))}
      </div>
    );
  return (
    <div className="rounded border p-3">
      <h3 className="text-sm font-semibold">{index + 1}. {section.title}</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{section.body_md || '（待补充）'}</p>
      {tag('事实', section.tags.facts, 'bg-green-50 text-green-700')}
      {tag('假设', section.tags.assumptions, 'bg-amber-50 text-amber-700')}
      {tag('推断', section.tags.inferences, 'bg-blue-50 text-blue-700')}
    </div>
  );
}

function ValuationCard({ v }: { v: DealValuation }) {
  const ev = v.entry_valuation;
  const rp = v.return_profile;
  const sc = rp.scenarios ?? {};
  return (
    <section className="space-y-4 rounded-lg border-2 border-indigo-200 bg-indigo-50/30 p-4">
      <h2 className="text-sm font-semibold text-indigo-900">一级市场估值体系（一等露出）</h2>

      <div>
        <h4 className="text-xs font-medium text-gray-500">估值依据</h4>
        <div className="mt-1 flex flex-wrap gap-1">
          {v.valuation_basis.length
            ? v.valuation_basis.map((b, i) => (
                <span key={i} className="rounded bg-white px-2 py-0.5 text-xs">{b}</span>
              ))
            : <span className="text-xs text-gray-400">待核实</span>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded bg-white p-2 text-xs">
          <h4 className="mb-1 font-medium">进入估值</h4>
          <Field label="pre-money" value={ev.pre_money} />
          <Field label="post-money" value={ev.post_money} />
          <Field label="EV" value={ev.ev} />
          <Field label="equity value" value={ev.equity_value} />
          <Field label="per share" value={ev.per_share} />
          <Field label="交易对价" value={ev.transaction_value} />
          <Field label="币种" value={ev.currency} />
        </div>

        <div className="rounded bg-white p-2 text-xs">
          <h4 className="mb-1 font-medium">持股与稀释</h4>
          <Field label="持股比例 %" value={v.ownership_and_dilution.stake_pct} />
          <Field label="稀释" value={v.ownership_and_dilution.dilution} />
          <Field label="换股/增资影响" value={v.ownership_and_dilution.swap_or_raise_note} />
        </div>

        <div className="rounded bg-white p-2 text-xs">
          <h4 className="mb-1 font-medium">回报画像</h4>
          <Field label="IRR" value={rp.irr} />
          <Field label="MOIC" value={rp.moic} />
          <Field label="回收期" value={rp.payback} />
          <Field label="情景 · base" value={sc.base} />
          <Field label="情景 · upside" value={sc.upside} />
          <Field label="情景 · downside" value={sc.downside} />
        </div>

        <div className="rounded bg-white p-2 text-xs">
          <h4 className="mb-1 font-medium">退出假设</h4>
          {v.exit_assumptions.paths.length
            ? v.exit_assumptions.paths.map((p, i) => (
                <Field key={i} label={p.type} value={p.window ?? '待核实'} />
              ))
            : <p className="text-gray-400">待核实</p>}
        </div>
      </div>

      <div className="rounded bg-white p-2 text-xs">
        <h4 className="mb-1 font-medium">敏感性</h4>
        {v.sensitivity.length
          ? v.sensitivity.map((s, i) => <Field key={i} label={s.variable} value={s.effect} />)
          : <p className="text-gray-400">待核实</p>}
      </div>

      <div className="rounded bg-white p-2 text-xs">
        <h4 className="mb-1 font-medium">估值风险 → 缓释</h4>
        {v.valuation_risks.length
          ? v.valuation_risks.map((r, i) => (
              <div key={i} className="border-b py-1 last:border-0">
                <span className="font-medium">{r.risk}</span> → {na(r.mitigant)}
              </div>
            ))
          : <p className="text-gray-400">待核实</p>}
      </div>

      <div className="rounded bg-white p-2 text-xs">
        <h4 className="mb-1 font-medium">
          二级市场交叉验证
          <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">仅交叉验证 · 不覆盖一级逻辑</span>
        </h4>
        <Field label="是否适用" value={v.public_market_crosscheck.applicable ? '是' : '否'} />
        {v.public_market_crosscheck.comps.length
          ? v.public_market_crosscheck.comps.map((c, i) => (
              <Field key={i} label={na(c.name ?? c.ticker)} value={c.multiple} />
            ))
          : <Field label="可比" value={null} />}
        <Field label="备注" value={v.public_market_crosscheck.note} />
      </div>
    </section>
  );
}

function DealMemoView({ memo }: { memo: InvestmentMemo }) {
  const sections = memo.sections ?? [];
  const rec = memo.recommendation ?? { verdict: 'conditional', conditions: [], rationale: '' };
  const valuation = memo.valuation;
  const verdict = DEAL_VERDICT[rec.verdict] ?? { label: rec.verdict, cls: 'bg-gray-100 text-gray-700' };

  return (
    <div className="space-y-5">
      <header className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">{memo.title}</h1>
          <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-800">📋 上会 deal memo</span>
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{memo.status}</span>
          <a className="ml-auto rounded bg-black px-3 py-1 text-xs text-white" href={`/api/research/memos/${memo.id}?format=markdown`}>
            导出 Markdown
          </a>
        </div>
        {memo.deal_context && (
          <p className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-600">
            <span className="font-medium">交易条款（权威）：</span>{memo.deal_context}
          </p>
        )}
      </header>

      {/* Recommendation card — Section 8 is the soul of the memo. */}
      <section className="rounded-lg border-2 border-gray-200 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">投资建议</h2>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${verdict.cls}`}>{verdict.label}</span>
        </div>
        <p className="mt-2 text-sm text-gray-700">{rec.rationale || '待核实'}</p>
        {rec.conditions.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-600">
            {rec.conditions.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        )}
      </section>

      {valuation && <ValuationCard v={valuation} />}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">八段叙事</h2>
        {sections.map((s, i) => <DealSectionBlock key={s.id ?? i} section={s} index={i} />)}
        {sections.length === 0 && <p className="text-sm text-gray-500">（无段落）</p>}
      </section>

      <footer className="rounded-lg border bg-gray-50 p-3 text-xs text-gray-500">
        AI 初稿，关键数据/估值人工复核后用于投委会决策。免责声明：{RESEARCH_DISCLAIMER}
      </footer>
    </div>
  );
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
      setError(res.status === 401 || res.status === 403 ? 'Research OS 该模块暂未开放（需 admin 登录）' : `加载失败：${res.status}`);
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
  // Deal memos get a dedicated read view (8 sections + recommendation + the
  // primary-market valuation card); the thesis editor below is untouched.
  if (memo.memo_type === 'deal') return <DealMemoView memo={memo} />;

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
