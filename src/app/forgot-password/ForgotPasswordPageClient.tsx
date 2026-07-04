'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { Disclaimer } from '@/components/Disclaimer';

export default function ForgotPasswordPageClient() {
  const { show } = useToast();
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!isSupabaseConfigured()) return show(t('form.supabaseNotConfigured'));
    setBusy(true);
    const sb = getBrowserSupabase();
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return show(`✗ ${error.message}`);
    setSent(true);
    show(t('forgotPassword.sentToast'));
  }

  return (
    <>
      <div className="card-base">
        <h1 className="mb-1 text-2xl font-bold">{t('forgotPassword.heading')}</h1>
        <p className="mb-4 text-sm text-text-dim">{t('forgotPassword.subheading')}</p>

        {sent ? (
          <div className="rounded-md bg-up/10 p-3 text-sm">
            {t('forgotPassword.sentHeading')} <strong>{email}</strong>
            <br /><span className="text-xs text-text-dim">{t('forgotPassword.sentHint')}</span>
          </div>
        ) : (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-text-dim">{t('form.emailLabel')}</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={t('form.emailPlaceholder')} className="w-full"
                onKeyDown={(e) => e.key === 'Enter' && send()} />
            </div>
            <button onClick={send} disabled={!email || busy || !isSupabaseConfigured()}
              className="w-full rounded-lg bg-accent-dim py-3 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? t('forgotPassword.sending') : t('forgotPassword.sendButton')}
            </button>
          </>
        )}

        <div className="mt-4 text-center text-xs text-text-dim">
          <Link href="/login" className="text-accent-dim">{t('forgotPassword.backToLogin')}</Link>
        </div>
      </div>
      <Disclaimer />
    </>
  );
}
