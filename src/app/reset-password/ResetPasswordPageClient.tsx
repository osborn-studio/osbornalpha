'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { Disclaimer } from '@/components/Disclaimer';

// User arrives here from the reset email link. Supabase establishes a recovery
// session automatically from the URL fragment, so updateUser({password}) works.
export default function ResetPasswordPageClient() {
  const { show } = useToast();
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function save() {
    if (!isSupabaseConfigured()) return show(t('form.supabaseNotConfigured'));
    if (password.length < 8) return show(tErrors('auth.passwordTooShort'));
    if (password !== confirm) return show(tErrors('auth.passwordMismatch'));
    setBusy(true);
    const sb = getBrowserSupabase();
    const { error } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (error) return show(`✗ ${error.message}${t('resetPassword.expiredSuffix')}`);
    setDone(true);
    show(t('resetPassword.updatedToast'));
  }

  return (
    <>
      <div className="card-base">
        <h1 className="mb-1 text-2xl font-bold">{t('resetPassword.heading')}</h1>
        {done ? (
          <div className="rounded-md bg-up/10 p-3 text-sm">
            {t('resetPassword.doneHeading')}<div className="mt-3"><Link href="/login" className="text-accent-dim">{t('resetPassword.doneLink')}</Link></div>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-text-dim">{t('resetPassword.subheading')}</p>
            <div className="mb-2">
              <label className="mb-1 block text-xs text-text-dim">{t('resetPassword.newPasswordLabel')}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full" autoComplete="new-password" />
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-text-dim">{t('resetPassword.confirmPasswordLabel')}</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className="w-full" autoComplete="new-password"
                onKeyDown={(e) => e.key === 'Enter' && save()} />
            </div>
            <button onClick={save} disabled={!password || !confirm || busy || !isSupabaseConfigured()}
              className="w-full rounded-lg bg-accent-dim py-3 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? t('resetPassword.saving') : t('resetPassword.saveButton')}
            </button>
          </>
        )}
      </div>
      <Disclaimer />
    </>
  );
}
