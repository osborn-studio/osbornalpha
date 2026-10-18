'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Panel } from '@/components/ui';
import { createProfile } from '@/lib/hooks/useAnalyst';
import type { AnalystKind } from '@/lib/supabase/database.types';

const inputCls = 'w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm';

export function ProfileForm({ onCreated }: { onCreated: () => void }) {
  const t = useTranslations('analyst');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AnalystKind>('human');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      await createProfile({ display_name: name, kind, note: note || undefined });
      setName(''); setNote(''); setKind('human');
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <Panel title={t('profileForm.title')}>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-0.5">{t('profileForm.displayName')}
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} w-40`} maxLength={60} />
        </label>
        <label className="flex flex-col gap-0.5">{t('profileForm.kind')}
          <select value={kind} onChange={(e) => setKind(e.target.value as AnalystKind)} className={`${inputCls} w-28`}>
            <option value="human">{t('kind.human')}</option>
            <option value="agent">{t('kind.agent')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5">{t('profileForm.note')}
          <input value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} w-56`} />
        </label>
        <Button size="sm" onClick={submit} disabled={busy || !name.trim()}>{busy ? t('profileForm.submitting') : t('profileForm.submit')}</Button>
      </div>
      {err && <p className="mt-1 text-xs text-[var(--down)]">{err}</p>}
    </Panel>
  );
}
