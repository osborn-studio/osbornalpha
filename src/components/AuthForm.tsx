'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { getAnonymousAnalyticsId, trackEvent } from '@/lib/analytics/client';
import { authCallbackUrl } from '@/lib/analytics/auth-funnel';
import { useEmailRequestCooldown } from '@/lib/hooks/useEmailRequestCooldown';
import { stableAuthErrorCode } from '@/lib/auth/errors';
import { configuredOAuthProviders, type OAuthProvider } from '@/lib/auth/providers';

type Mode = 'login' | 'register';

export function AuthForm({ mode }: { mode: Mode }) {
  const { show } = useToast();
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const signupCooldown = useEmailRequestCooldown('signup');

  const enabledProviders = configuredOAuthProviders(process.env.NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS);
  const allProviderOptions: { id: OAuthProvider; label: string; icon: string }[] = [
    { id: 'google', label: t('form.providerGoogle'), icon: 'G' },
    { id: 'github', label: t('form.providerGithub'), icon: '⌨' },
    { id: 'apple', label: t('form.providerApple'), icon: '' },
  ];
  const providerOptions = allProviderOptions.filter((provider) => enabledProviders.includes(provider.id));

  const configured = isSupabaseConfigured();
  const isLogin = mode === 'login';

  async function submitEmail() {
    if (!configured) return show(t('form.supabaseNotConfigured'));
    if (password.length < 8) return show(tErrors('auth.passwordTooShort'));
    if (!isLogin && signupCooldown.active) {
      return show(t('form.emailCooldown', { seconds: signupCooldown.remainingSeconds }));
    }
    setBusy(true);
    trackEvent(isLogin ? 'login_submitted' : 'signup_submitted', { provider: 'email' });
    const sb = getBrowserSupabase();
    if (isLogin) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        const errorCode = stableAuthErrorCode(error);
        trackEvent('login_failed', { provider: 'email', error_code: errorCode });
        if (errorCode === 'email_not_confirmed') {
          setConfirmationEmail(email);
          return;
        }
        return show(errorCode === 'network_error' ? tErrors('network') : tErrors('auth.loginFailed'));
      }
      trackEvent('login_succeeded', { provider: 'email' });
      show(t('toasts.loginSuccess'));
      window.location.href = '/today';
    } else {
      const { error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: authCallbackUrl(window.location.origin, getAnonymousAnalyticsId()) },
      });
      setBusy(false);
      if (error) {
        const errorCode = stableAuthErrorCode(error);
        trackEvent('signup_failed', { provider: 'email', error_code: errorCode });
        return show(errorCode === 'network_error' ? tErrors('network') : tErrors('auth.registerFailed'));
      }
      trackEvent('signup_email_sent', { provider: 'email' });
      signupCooldown.startCooldown();
      setConfirmationEmail(email);
      show(t('toasts.confirmEmailSent'));
    }
  }

  async function resendConfirmation() {
    if (!confirmationEmail || signupCooldown.active || busy) return;
    setBusy(true);
    trackEvent('confirmation_resend_submitted', { provider: 'email' });
    const sb = getBrowserSupabase();
    const { error } = await sb.auth.resend({
      type: 'signup',
      email: confirmationEmail,
      options: { emailRedirectTo: authCallbackUrl(window.location.origin, getAnonymousAnalyticsId()) },
    });
    setBusy(false);
    if (error) {
      const errorCode = stableAuthErrorCode(error);
      trackEvent('confirmation_resend_failed', { provider: 'email', error_code: errorCode });
      return show(errorCode === 'network_error' ? tErrors('network') : tErrors('auth.sendFailed'));
    }
    signupCooldown.startCooldown();
    trackEvent('confirmation_resend_sent', { provider: 'email' });
    show(t('toasts.confirmEmailSent'));
  }

  async function oauth(provider: OAuthProvider) {
    if (!configured) return show(t('form.supabaseNotConfigured'));
    trackEvent(isLogin ? 'login_submitted' : 'signup_submitted', { provider });
    const sb = getBrowserSupabase();
    const { error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      const errorCode = stableAuthErrorCode(error);
      trackEvent(isLogin ? 'login_failed' : 'signup_failed', { provider, error_code: errorCode });
      show(errorCode === 'network_error' ? tErrors('network') : tErrors('generic'));
    }
  }

  if (confirmationEmail) {
    return (
      <div className="rounded-md bg-up/10 p-3 text-sm">
        {isLogin ? t('form.emailNotConfirmedHeading') : t('form.registeredHeading')} <strong>{confirmationEmail}</strong>
        <br />
        <span className="text-xs text-text-dim">
          {isLogin ? t('form.emailNotConfirmedHint') : t('form.registeredHint')}
        </span>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={resendConfirmation}
            disabled={busy || signupCooldown.active}
            className="text-accent-dim disabled:opacity-50"
          >
            {busy
              ? t('form.processing')
              : signupCooldown.active
                ? t('form.emailCooldown', { seconds: signupCooldown.remainingSeconds })
                : t('form.resendConfirmation')}
          </button>
          <button type="button" onClick={() => setConfirmationEmail(null)} className="text-text-dim">
            {t('form.changeEmail')}
          </button>
          {!isLogin && <Link href="/login" className="text-accent-dim">{t('form.backToLogin')}</Link>}
        </div>
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

      {providerOptions.length > 0 && (
        <>
          <div className="mb-3 flex gap-2">
            {providerOptions.map((p) => (
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
        </>
      )}

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

      <button onClick={submitEmail} disabled={!email || !password || busy || !configured || (!isLogin && signupCooldown.active)}
        className="w-full rounded-lg bg-accent-dim py-3 text-sm font-semibold text-white disabled:opacity-50">
        {busy
          ? t('form.processing')
          : !isLogin && signupCooldown.active
            ? t('form.emailCooldown', { seconds: signupCooldown.remainingSeconds })
            : isLogin ? t('form.loginButton') : t('form.registerButton')}
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
