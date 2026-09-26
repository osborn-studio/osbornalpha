'use client';

// WP-A11 — 研究设置向导：阶段 0 的两项人工任务（12–15 家公司、8–12 条 thesis）的固定入口。
// 草稿存 localStorage（仅续填便利）；权威数据在 research_entity_keys / research_theses。

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ScopedCompany } from '@/lib/research/entity-keys/scope';
import type { Thesis } from '@/lib/research/types';
import { clearPendingActivation, clearPendingCreate, DRAFT_KEY, markCreatePending, markThesisCreated, parseDraft, resetCompanyDraft, serializeDraft, type SetupDraft } from '@/lib/research/setup/draft';
import { findCreatedThesis, saveOutcomeMessage } from '@/lib/research/setup/theses';
import { setupProgress } from '@/lib/research/setup/progress';
import { EMPTY_THESIS_DRAFT } from '@/lib/research/setup/theses';
import { companiesFromResponse } from '@/lib/research/setup/roster';
import { CompaniesFlow } from './companies-flow';
import { ThesisFlow } from './thesis-flow';

const EMPTY_DRAFT: SetupDraft = { version: 1, thesis: { ...EMPTY_THESIS_DRAFT }, thesisStep: 0, companies: {}, companyStep: 0 };

function readDraft(): SetupDraft {
  try { return parseDraft(window.localStorage.getItem(DRAFT_KEY)) ?? EMPTY_DRAFT; } catch { return EMPTY_DRAFT; }
}
function writeDraft(d: SetupDraft) {
  try { window.localStorage.setItem(DRAFT_KEY, serializeDraft(d)); } catch { /* private mode: drafts are a convenience only */ }
}

export default function ResearchSetupPage() {
  const [companies, setCompanies] = useState<ScopedCompany[] | null>(null);
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [disabled, setDisabled] = useState(false);
  const [flow, setFlow] = useState<'companies' | 'thesis' | null>(null);
  const [draft, setDraft] = useState<SetupDraft>(EMPTY_DRAFT);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Submission lock lives here: switching flows unmounts the child, which must not reset an in-flight write.
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    let res: Response;
    try { res = await fetch('/api/research/entity-keys'); } catch { setLoadError('名单加载失败，请重试'); return; }
    if (res.status === 401 || res.status === 403) { setDisabled(true); return; }
    // A failed or malformed load must not become an empty roster: removals are derived from this list.
    const parsed = companiesFromResponse<ScopedCompany>(res.ok, await res.json().catch(() => null));
    if ('error' in parsed) { setLoadError(parsed.error); return; }
    setLoadError(null);
    setCompanies(parsed.companies);
    const tRes = await fetch('/api/research/theses');
    const tData = await tRes.json().catch(() => ({ theses: [] }));
    setTheses(tData.theses ?? []);
  }, []);

  useEffect(() => { setDraft(readDraft()); void load(); }, [load]);
  // Functional updates: two callbacks in one tick (answers, then step) must not overwrite each other.
  const update = (patch: Partial<SetupDraft>) => setDraft((prev) => { const next = { ...prev, ...patch }; writeDraft(next); return next; });
  const reset = (fn: (prev: SetupDraft) => SetupDraft) => setDraft((prev) => { const next = fn(prev); writeDraft(next); return next; });

  /** Reconcile an unresolved create by its submission id: never creates, only looks up (then activates if asked). */
  async function reconcilePendingCreate() {
    const pending = draft.pendingCreate;
    if (!pending || busy) return;
    setBusy(true);
    try {
      const lookup = await fetch('/api/research/theses').then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!lookup?.theses) { setNotice('仍无法连接服务器，稍后再试「重新确认」'); return; }
      const found = findCreatedThesis(lookup.theses, pending.submissionId);
      if (!found) { reset(clearPendingCreate); setNotice('服务器未记录上一次提交，草稿已保留，可重新提交'); return; }
      reset((prev) => markThesisCreated(clearPendingCreate(prev), found));
      let activated: boolean | null = null, error: string | undefined;
      if (pending.activate) {
        try {
          const t = await fetch(`/api/research/theses/${found.id}/transition`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: 'ACTIVE', reason: 'setup wizard (reconciled)' }) });
          const tData = await t.json().catch(() => ({}));
          activated = t.ok; if (!t.ok) error = tData?.error?.message ?? String(t.status);
        } catch (e) { activated = false; error = e instanceof Error ? e.message : '网络错误'; }
      }
      if (activated !== false) reset(clearPendingActivation);
      setNotice(saveOutcomeMessage({ title: found.title, activate: pending.activate, activated, error }));
      await load();
    } finally { setBusy(false); }
  }

  async function activatePending() {
    const pending = draft.pendingActivation;
    if (!pending || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/research/theses/${pending.id}/transition`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: 'ACTIVE', reason: 'setup wizard (resumed)' }) });
      const data = await res.json().catch(() => ({}));
      // An already-active thesis answers 422 (illegal transition): the activation is done either way.
      if (res.ok || res.status === 422) { reset(clearPendingActivation); setNotice(res.ok ? `已激活：${pending.title}` : `「${pending.title}」已不是草稿，无需再激活`); await load(); }
      else setNotice(`激活失败：${data?.error?.message ?? res.status}`);
    } catch (e) { setNotice(`激活失败：${e instanceof Error ? e.message : '网络错误'}`); }
    finally { setBusy(false); }
  }

  if (disabled) {
    return <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">Research OS 该模块暂未开放——需以 admin 角色登录后访问（个人云工具规格）。</div>;
  }
  const progress = setupProgress({
    inScopeCompanies: (companies ?? []).filter((c) => c.in_scope).length,
    activeTheses: theses.filter((t) => ['ACTIVE', 'WATCH', 'AT_RISK'].includes(t.status)).length,
    draftTheses: theses.filter((t) => t.status === 'DRAFT').length,
  });
  const tone = (s: string) => (s === 'ok' ? 'text-green-700' : 'text-amber-700');

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">研究设置向导</h1>
        <Link href="/research" className="text-sm underline">返回 Research</Link>
      </div>
      <p className="text-sm text-gray-600">阶段 0 的两项输入。每题一屏，带提示与范例；随时可中断，草稿留在本浏览器，提交后写入权威表。</p>

      <div className="grid gap-3 md:grid-cols-2">
        <button type="button" disabled={busy} onClick={() => setFlow('companies')} className={`rounded-lg border p-4 text-left hover:bg-gray-50 ${flow === 'companies' ? 'border-black' : ''}`}>
          <div className="text-3xl font-semibold">{companies === null ? '…' : progress.companies.count}<span className="text-base text-gray-400"> / {progress.companies.min}–{progress.companies.max}</span></div>
          <div className="text-sm text-gray-500">公司名单（in_scope）</div>
          <div className={`text-xs ${tone(progress.companies.status)}`}>{progress.companies.status === 'ok' ? '在目标区间内' : progress.companies.status === 'below' ? '还不够，点此圈定' : '超出目标，可精简'}</div>
        </button>
        <button type="button" disabled={busy} onClick={() => setFlow('thesis')} className={`rounded-lg border p-4 text-left hover:bg-gray-50 ${flow === 'thesis' ? 'border-black' : ''}`}>
          <div className="text-3xl font-semibold">{progress.theses.count}<span className="text-base text-gray-400"> / {progress.theses.min}–{progress.theses.max}</span></div>
          <div className="text-sm text-gray-500">thesis（激活 {progress.theses.active} · 草稿 {progress.theses.draft}）</div>
          <div className={`text-xs ${tone(progress.theses.status)}`}>{progress.theses.status === 'ok' ? '在目标区间内' : progress.theses.status === 'below' ? '还不够，点此录入' : '超出目标，可合并'}</div>
        </button>
      </div>

      {notice && <p className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{notice}</p>}
      {draft.pendingCreate && !busy && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          上一次提交「{draft.pendingCreate.input.title}」的结果尚未确认（响应丢失）。
          <button type="button" className="ml-2 underline" onClick={() => void reconcilePendingCreate()}>重新确认</button>
        </p>
      )}
      {draft.pendingActivation && !busy && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          上次创建的 thesis「{draft.pendingActivation.title}」尚未确认激活。
          <button type="button" className="ml-2 underline" onClick={() => void activatePending()}>现在激活</button>
          <button type="button" className="ml-2 underline" onClick={() => reset(clearPendingActivation)}>保留为草稿</button>
        </p>
      )}
      {loadError && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
          {loadError} <button type="button" className="ml-2 underline" onClick={() => void load()}>重试</button>
        </p>
      )}

      {flow === 'companies' && companies && (
        <CompaniesFlow companies={companies} answers={draft.companies} step={draft.companyStep} busy={busy} setBusy={setBusy}
          onAnswersChange={(companies) => update({ companies })} onStepChange={(companyStep) => update({ companyStep })}
          onSaved={async (m) => { reset(resetCompanyDraft); setNotice(m); await load(); }} onRefresh={load} />
      )}
      {flow === 'thesis' && companies && (
        <ThesisFlow companies={companies} draft={draft.thesis} step={draft.thesisStep} busy={busy} setBusy={setBusy}
          onDraftChange={(thesis) => update({ thesis })} onStepChange={(thesisStep) => update({ thesisStep })}
          onPendingCreate={(pending) => reset((prev) => markCreatePending(prev, pending))}
          onCreateResolved={() => reset(clearPendingCreate)}
          hasPendingCreate={!!draft.pendingCreate}
          onCreated={(created) => reset((prev) => markThesisCreated(clearPendingCreate(prev), created))}
          onSaved={async (m) => { reset(clearPendingActivation); setNotice(m); await load(); }} />
      )}
      {flow === null && <p className="text-sm text-gray-500">点上面任一张卡开始。</p>}
    </div>
  );
}
