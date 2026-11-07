// src/components/company/ConceptPopover.tsx
'use client';
// Concept notes popover from a row header (plan 2026-11-06 Task 12; spec §5.3; canvas Drawer C). Rendered in a
// portal (the grid's scroll container and sticky cells must not clip it); closes on Esc, outside press,
// focus leaving, scroll or resize. A press on the anchor is NOT an outside press, so the header button's own
// toggle decides (closing then reopening on the same click was the previous bug).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import type { GridRow } from '@/lib/company/types';

export function ConceptPopover({ row, mappingGen, label, anchor, onClose }: { row: GridRow; mappingGen: number; label: string; anchor: HTMLElement | null; onClose: () => void }) {
  const t = useTranslations('company.drawer');
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 316)), top: r.bottom + 4 });
  }, [anchor]);
  useEffect(() => { if (pos) ref.current?.focus(); }, [pos]);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      const n = e.target as Node;
      if (ref.current?.contains(n) || anchor?.contains(n)) return;
      onClose();
    };
    const away = () => onClose();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', away);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('scroll', away, true); window.removeEventListener('resize', away); };
  }, [anchor, onClose]);
  if (!pos || typeof document === 'undefined') return null;
  return createPortal(
    <div ref={ref} tabIndex={-1} role="dialog" aria-label={t('conceptTitle')} style={{ left: pos.left, top: pos.top }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      onBlur={(e) => { const n = e.relatedTarget as Node | null; if (n && !e.currentTarget.contains(n) && !anchor?.contains(n)) onClose(); }}
      className="fixed z-30 w-[300px] max-w-[calc(100vw-16px)] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs shadow-[var(--shadow)] focus:outline-none">
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--accent)]">{t('conceptTitle')}</div>
      <div className="mt-1 text-sm font-semibold">{label} <span className="num text-[var(--text-dim)]">{row.concept}</span></div>
      <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-2 gap-y-1">
        <dt className="text-[var(--text-dim)]">{t('sourceConcepts')}</dt><dd className="num break-all">{row.sourceConcepts.join(', ') || '—'}</dd>
        <dt className="text-[var(--text-dim)]">{t('mappingGen')}</dt><dd className="num">{mappingGen}</dd>
        <dt className="text-[var(--text-dim)]">{t('notes')}</dt><dd>{row.notes ?? t('noNotes')}</dd>
      </dl>
    </div>,
    document.body,
  );
}
