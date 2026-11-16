'use client';

// Inputs drawer (spec §9.5, canvas boards 2 and 7 "M-Drawer"): a modal dialog — right-hand drawer from 640px, bottom sheet
// below — with two tabs: frozen inputs (+ the registered value, shown only here) and the settlement timeline. Public cards
// load GET /api/judgments/[id] for the full settlement history and the claim; private cards use the card alone.
import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { JudgmentDetailResponse } from './api-types';
import { SettlementTimeline } from './SettlementTimeline';
import { LINK, inputRows, minute, registeredValue, segmentClass, type AnyCard } from './view-model';

export type DrawerTab = 'inputs' | 'timeline';

export function InputsDrawer({ card, initialTab = 'inputs', onClose }: { card: AnyCard; initialTab?: DrawerTab; onClose: () => void }) {
  const t = useTranslations('judgments');
  const locale = useLocale() === 'en' ? 'en' : 'zh';
  const [tab, setTab] = useState<DrawerTab>(initialTab);
  const [detail, setDetail] = useState<JudgmentDetailResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const tabId = useId();
  const isPrivate = card.source === 'recommendation';

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    closeRef.current?.focus();
    return () => { dialog?.close(); trigger?.focus(); };
  }, []);

  useEffect(() => {
    setDetail(null); setFailed(false);
    if (isPrivate) return;
    let alive = true;
    fetch(`/api/judgments/${encodeURIComponent(card.judgment_id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<JudgmentDetailResponse>) : Promise.reject(new Error(`http ${r.status}`))))
      .then((j) => { if (alive) setDetail(j); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [card.judgment_id, isPrivate]);

  const tabKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 'inputs' : e.key === 'End' ? 'timeline' : tab === 'inputs' ? 'timeline' : 'inputs';
    setTab(next); document.getElementById(`${tabId}-${next}`)?.focus();
  };
  const rows = inputRows(card);
  const registered = registeredValue(card, detail?.judgment ?? null);
  const th = 'px-2 py-1 font-normal';
  return (
    <dialog ref={dialogRef} aria-modal="true" aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); onClose(); }} className="fixed inset-0 m-0 ml-auto mt-auto open:flex max-h-[85dvh] w-full max-w-none flex-col overflow-hidden rounded-t-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] backdrop:bg-black/50 sm:mt-0 sm:h-[100dvh] sm:max-h-none sm:w-[600px] sm:rounded-none">
        <header className="flex items-start gap-3 border-b border-[var(--border)] p-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold">{card.display.headline[locale]}</h2>
            <p className="num mt-1 text-[11px] text-[var(--text-dim)]">{card.methodology.id}@{card.methodology.version} · {card.judgment_id.slice(0, 8)}… · {t('ui.drawer.registeredAt', { at: minute(card.registered_at) })}</p>
          </div>
          <button type="button" ref={closeRef} aria-label={t('ui.drawer.close')} className="rounded p-1 text-[var(--text-dim)] hover:text-[var(--text)]" onClick={onClose}>✕</button>
        </header>
        <div role="tablist" aria-label={t('ui.drawer.tabs')} className="flex gap-1 border-b border-[var(--border)] px-4 text-sm">
          <button type="button" role="tab" id={`${tabId}-inputs`} tabIndex={tab === 'inputs' ? 0 : -1} onKeyDown={tabKey} aria-selected={tab === 'inputs'} aria-controls={`${tabId}-inputs-panel`} className={`px-3 py-2 ${segmentClass(tab === 'inputs')}`} onClick={() => setTab('inputs')}>{t('ui.card.inputs', { count: rows.length })}</button>
          <button type="button" role="tab" id={`${tabId}-timeline`} tabIndex={tab === 'timeline' ? 0 : -1} onKeyDown={tabKey} aria-selected={tab === 'timeline'} aria-controls={`${tabId}-timeline-panel`} className={`px-3 py-2 ${segmentClass(tab === 'timeline')}`} onClick={() => setTab('timeline')}>{t('ui.card.timeline')}</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {failed && <p role="status" className="mb-3 text-xs text-[var(--text-muted)]">{t('ui.drawer.detailUnavailable')}</p>}
          {tab === 'inputs' ? (
            <div role="tabpanel" id={`${tabId}-inputs-panel`} aria-labelledby={`${tabId}-inputs`} className="space-y-4">
              <p className="text-xs text-[var(--text-dim)]">{t('ui.drawer.frozenNote')}</p>
              {rows.length === 0 ? (
                <p className="text-sm text-[var(--text-dim)]">{t('ui.drawer.noInputs')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-xs">
                    <caption className="sr-only">{t('ui.drawer.caption')}</caption>
                    <thead>
                      <tr className="text-[var(--text-dim)]">
                        <th scope="col" className={th}>{t('ui.drawer.columns.kind')}</th>
                        <th scope="col" className={th}>{t('ui.drawer.columns.ref')}</th>
                        <th scope="col" className={th}>{t('ui.drawer.columns.availableAt')}</th>
                        <th scope="col" className={th}>{t('ui.drawer.columns.origin')}</th>
                        <th scope="col" className={th}><span className="sr-only">{t('ui.drawer.columns.source')}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.key} className="border-t border-[var(--border)]">
                          <td className="px-2 py-1 text-[var(--text-dim)]">{t(`ui.inputKind.${r.kind}`)}</td>
                          <td className="num break-all px-2 py-1">{r.ref}</td>
                          <td className="num px-2 py-1 text-[var(--text-dim)]">{r.date}</td>
                          <td className="px-2 py-1">{r.origin}</td>
                          <td className="px-2 py-1">{r.href ? <a className={LINK} href={r.href}>{t('ui.drawer.source')}</a> : <span className="text-[var(--text-muted)]">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {registered?.type === 'p' && (
                <div className="rounded-md border border-[var(--border)] p-3">
                  <div className="text-[11px] text-[var(--text-dim)]">{t('ui.drawer.registeredValue')}</div>
                  <div className="num mt-1 text-sm">p = {registered.text}</div>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">{t('ui.drawer.registeredNote')}</p>
                </div>
              )}
              {registered?.type === 'scores' && (
                <div className="rounded-md border border-[var(--border)] p-3">
                  <div className="text-[11px] text-[var(--text-dim)]">{t('ui.drawer.scores')}</div>
                  <table className="num mt-1 text-xs">
                    <caption className="sr-only">{t('ui.drawer.scores')}</caption>
                    <tbody>
                      {registered.rows.map((r) => (
                        <tr key={r.cls}><th scope="row" className="pr-3 text-left font-normal text-[var(--text-dim)]">{t.has(`ui.classes.${r.cls}`) ? t(`ui.classes.${r.cls}`) : r.cls}</th><td className="text-right">{r.score}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">{t('ui.drawer.scoresNote')}</p>
                </div>
              )}
            </div>
          ) : (
            <div role="tabpanel" id={`${tabId}-timeline-panel`} aria-labelledby={`${tabId}-timeline`}>
              <SettlementTimeline card={card} settlements={detail?.settlements} />
            </div>
          )}
        </div>
    </dialog>
  );
}
