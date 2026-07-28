'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AuthForm } from '@/components/AuthForm';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { Disclaimer } from '@/components/Disclaimer';

export default function LoginPageClient() {
  const { show } = useToast();
  const t = useTranslations('auth');
  const [showMagic, setShowMagic] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  async function sendMagicLink() {
    if (!isSupabaseConfigured()) return show(t('form.supabaseNotConfigured'));
    const sb = getBrowserSupabase();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) return show(`✗ ${error.message}`);
    setSent(true);
    show(t('login.magicLinkSentToast'));
  }

  return (
    <>
      <div className="card-base">
        <h1 className="mb-1 text-2xl font-bold">{t('login.heading')}</h1>
        <p className="mb-4 text-sm text-text-dim">{t('login.subheading')}</p>

        <AuthForm mode="login" />

        <div className="mt-5 border-t border-border pt-3 text-center text-xs text-text-dim">
          {!showMagic ? (
            <button onClick={() => setShowMagic(true)}>{t('login.magicLinkPrompt')}</button>
          ) : sent ? (
            <span className="text-up">{t('login.magicLinkSent', { email })}</span>
          ) : (
            <div className="flex gap-2">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={t('form.emailPlaceholder')} className="flex-1" />
              <button onClick={sendMagicLink} disabled={!email}
                className="rounded-lg bg-bg-elev px-3 py-2">{t('login.magicLinkSend')}</button>
            </div>
          )}
        </div>
      </div>
      <Disclaimer />
    </>
  );
}
