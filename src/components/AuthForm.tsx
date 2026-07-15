'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { trackEvent } from '@/lib/analytics/client';

type Mode = 'login' | 'register';
type Provider = 'google' | 'github' | 'apple';

export function AuthForm({ mode }: { mode: Mode }) {
  const { show } = useToast();
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);

  const PROVIDERS: { id: Provider; label: string; icon: string }[] = [
    { id: 'google', label: t('form.providerGoogle'), icon: 'G' },
    { id: 'github', label: t('form.providerGithub'), icon: '⌨' },
    { id: 'apple', label: t('form.providerApple'), icon: '' },
  ];

  const configured = isSupabaseConfigured();
  const isLogin = mode === 'login';

  async function submitEmail() {
    if (!configured) return show(t('form.supabaseNotConfigured'));
    if (password.length < 8) return show(tErrors('auth.passwordTooShort'));
    setBusy(true);
    trackEvent(isLogin ? 'login_submitted' : 'signup_submitted', { provider: 'email' });
    const sb = getBrowserSupabase();
    if (isLogin) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        trackEvent('login_failed', { provider: 'email', error: error.message });
        return show(`✗ ${error.message}`);
      }
      trackEvent('login_succeeded', { provider: 'email' });
      show(t('toasts.loginSuccess'));
      window.location.href = '/today';
    } else {
      const { error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setBusy(false);
      if (error) {
        trackEvent('signup_failed', { provider: 'email', error: error.message });
        return show(`✗ ${error.message}`);
      }
      trackEvent('signup_email_sent', { provider: 'email' });
      setRegistered(true);
      show(t('toasts.confirmEmailSent'));
    }
  }

  async function oauth(provider: Provider) {
    if (!configured) return show(t('form.supabaseNotConfigured'));
    trackEvent(isLogin ? 'login_submitted' : 'signup_submitted', { provider });
    const sb = getBrowserSupabase();
    const { error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      trackEvent(isLogin ? 'login_failed' : 'signup_failed', { provider, error: error.message });
      show(`✗ ${error.message}`);
    }
  }

  if (registered) {
    return (
      <div className="rounded-md bg-up/10 p-3 text-sm">
        {t('form.registeredHeading')} <strong>{email}</strong>
        <br />
        <span className="text-xs text-text-dim">{t('form.registeredHint')}</span>
        <div className="mt-3"><Link href="/login" className="text-accent-dim">{t('form.backToLogin')}</Link></div>
      </div>
    );
  }

  return (
    <>
      {!configured && (
        <div className="mb-3 rounded-md bg-warn/10 p-3 text-sm text-warn">
          ⚠️ {t('form.supabaseNotConfigured')}
        </div>
      )}

      <div className="mb-3 flex gap-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => oauth(p.id)}
            disabled={!configured}
            className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-bg-elev disabled:opacity-50"
          >
            {p.icon ? `${p.icon} ` : ''}{p.label}
          </button>
        ))}
      </div>

      <div className="my-3 flex items-center gap-3 text-xs text-text-dim">
        <span className="h-px flex-1 bg-border" />{t('form.orEmail')}<span className="h-px flex-1 bg-border" />
      </div>

      <div className="mb-2">
        <label className="mb-1 block text-xs text-text-dim">{t('form.emailLabel')}</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder={t('form.emailPlaceholder')} className="w-full" autoComplete="email" />
      </div>
      <div className="mb-3">
        <label className="mb-1 block text-xs text-text-dim">{t('form.passwordLabel')}</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder={t('form.passwordPlaceholder')} className="w-full"
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          onKeyDown={(e) => e.key === 'Enter' && submitEmail()} />
      </div>

      <button onClick={submitEmail} disabled={!email || !password || busy || !configured}
        className="w-full rounded-lg bg-accent-dim py-3 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? t('form.processing') : isLogin ? t('form.loginButton') : t('form.registerButton')}
      </button>

      <div className="mt-4 flex justify-between text-xs text-text-dim">
        {isLogin ? (
          <>
            <Link href="/register" className="text-accent-dim">{t('form.registerLink')}</Link>
            <Link href="/forgot-password">{t('form.forgotLink')}</Link>
          </>
        ) : (
          <Link href="/login" className="text-accent-dim">{t('form.loginLink')}</Link>
        )}
      </div>
    </>
  );
}
