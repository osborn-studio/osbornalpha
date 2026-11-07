// src/components/company/ConceptPopover.tsx
'use client';
// Concept notes popover from a row header (plan 2026-11-06 Task 12; spec §5.3; canvas Drawer C).
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { GridRow } from '@/lib/company/types';

export function ConceptPopover({ row, mappingGen, label, onClose }: { row: GridRow; mappingGen: number; label: string; onClose: () => void }) {
  const t = useTranslations('company.drawer');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label={t('conceptTitle')}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onClose(); }}
      className="absolute left-2 top-full z-30 mt-1 w-[300px] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs shadow-[var(--shadow)] focus:outline-none">
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--accent)]">{t('conceptTitle')}</div>
      <div className="mt-1 text-sm font-semibold">{label} <span className="num text-[var(--text-dim)]">{row.concept}</span></div>
      <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-2 gap-y-1">
        <dt className="text-[var(--text-dim)]">{t('sourceConcepts')}</dt><dd className="num break-all">{row.sourceConcepts.join(', ') || '—'}</dd>
        <dt className="text-[var(--text-dim)]">{t('mappingGen')}</dt><dd className="num">{mappingGen}</dd>
        <dt className="text-[var(--text-dim)]">{t('notes')}</dt><dd>{row.notes ?? t('noNotes')}</dd>
      </dl>
    </div>
  );
}
