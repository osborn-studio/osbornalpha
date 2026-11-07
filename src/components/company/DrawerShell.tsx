// src/components/company/DrawerShell.tsx
'use client';
// Accessible drawer shell (plan 2026-11-06 Task 12; spec §5.9, §14; canvas Drawer / M-Drawer): modal
// dialog, focus on open, Tab trapped, Esc / backdrop close; full-screen bottom sheet under 640px,
// right drawer above. Focus return to the opener is handled by DrawerHost.
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

export function DrawerShell({ label, kicker, title, onClose, children }: {
  label: string; kicker: string; title: React.ReactNode; onClose: () => void; children: React.ReactNode;
}) {
  const t = useTranslations('company.drawer');
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeBtn.current?.focus(); }, []);
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab' || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end" onKeyDown={onKeyDown}>
      <div aria-hidden className="absolute inset-0 bg-[color-mix(in_srgb,var(--bg)_70%,transparent)]" onClick={onClose} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        className="relative flex h-[100dvh] w-full flex-col overflow-y-auto focus:outline-none border-[var(--border)] bg-[var(--bg-elevated)] sm:h-full sm:w-[min(760px,100vw)] sm:border-l">
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-[var(--text-muted)] sm:hidden" />
        <div className="flex items-start gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--accent)]">{kicker}</div>
            <div className="mt-1 text-sm font-semibold">{title}</div>
          </div>
          <button ref={closeBtn} type="button" onClick={onClose} aria-label={t('close')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-dim)] hover:bg-[var(--accent-wash)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="flex flex-col gap-4 p-4">{children}</div>
      </div>
    </div>
  );
}
