'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import { Disclaimer } from '@/components/Disclaimer';
import { AccountSettings } from '@/components/AccountSettings';
import { LlmSettings } from '@/components/LlmSettings';
import { UsageToday } from '@/components/UsageToday';
import { UpgradeCard } from '@/components/UpgradeCard';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import type { AppLocale } from '@/lib/i18n/locale';

// Fixed timezone choices (IANA ids are shown untranslated; '' = auto).
const TIMEZONE_OPTIONS = [
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Taipei',
  'Asia/Tokyo',
  'Asia/Seoul',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'UTC',
];

export default function SettingsPage() {
  const { show } = useToast();
  const router = useRouter();
  const t = useTranslations('settings');
  const currentLocale = useLocale() as AppLocale;
  const [language, setLanguage] = useState<AppLocale>(currentLocale);
  const [timezone, setTimezone] = useState(''); // '' = auto (follow browser)
  const [tgChatId, setTgChatId] = useState('');
  const [emailNotif, setEmailNotif] = useState(true);

  useEffect(() => {
    setTgChatId(localStorage.getItem('tg-chat-id') || '');
    setEmailNotif(localStorage.getItem('email-notif') !== 'false');
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const sb = getBrowserSupabase();
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await sb.from('user_preferences')
        .select('timezone').eq('user_id', user.id).maybeSingle();
      const v = (data as any)?.timezone;
      if (v !== undefined && v !== null) setTimezone(v);
    });
  }, []);

  async function selectLanguage(l: AppLocale) {
    setLanguage(l);
    document.cookie = `NEXT_LOCALE=${l};path=/;max-age=31536000`;
    if (isSupabaseConfigured()) {
      const sb = getBrowserSupabase();
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        await (sb as any).from('user_preferences').upsert(
          { user_id: user.id, language: l },
          { onConflict: 'user_id' }
        );
      }
    }
    router.refresh();
  }

  async function selectTimezone(v: string) {
    setTimezone(v);
    if (isSupabaseConfigured()) {
      const sb = getBrowserSupabase();
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        await (sb as any).from('user_preferences').upsert(
          { user_id: user.id, timezone: v }, // '' = auto
          { onConflict: 'user_id' }
        );
      }
    }
    router.refresh();
  }

  // Brief cron fires at 00:30 UTC (= 08:30 Beijing); show the equivalent in
  // the user's display timezone (override if set, else browser default).
  const briefUtc = new Date();
  briefUtc.setUTCHours(0, 30, 0, 0);
  const briefLocalTime = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone || undefined,
    hour: '2-digit',
    minute: '2-digit',
  }).format(briefUtc);

  function save() {
    localStorage.setItem('tg-chat-id', tgChatId);
    localStorage.setItem('email-notif', String(emailNotif));
    show(t('saveToast'));
  }

  return (
    <>
      <h1 className="mb-3 text-xl font-bold">{t('title')}</h1>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">{t('account.heading')}</div>
        <AccountSettings />
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">{t('usage.heading')}</div>
        <UsageToday />
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">{t('upgrade.heading')}</div>
        <UpgradeCard />
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">{t('llm.heading')}</div>
        <LlmSettings />
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">{t('language.heading')}</div>
        <div className="flex gap-2">
          <button
            onClick={() => selectLanguage('zh')}
            className={`rounded px-4 py-1.5 text-sm ${language === 'zh' ? 'bg-accent-dim text-white' : 'bg-bg-card text-text-dim'}`}
          >
            {t('language.zh')}
          </button>
          <button
            onClick={() => selectLanguage('en')}
            className={`rounded px-4 py-1.5 text-sm ${language === 'en' ? 'bg-accent-dim text-white' : 'bg-bg-card text-text-dim'}`}
          >
            {t('language.en')}
          </button>
        </div>
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">{t('timezone.heading')}</div>
        <select
          value={timezone}
          onChange={(e) => selectTimezone(e.target.value)}
          className="w-full rounded border border-border bg-bg-card px-3 py-1.5 text-sm"
        >
          <option value="">{t('timezone.auto')}</option>
          {TIMEZONE_OPTIONS.map((z) => (
            <option key={z} value={z}>{z}</option>
          ))}
        </select>
        <div className="mt-2 text-[10px] text-text-muted">{t('timezone.hint')}</div>
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">{t('channels.heading')}</div>
        <div className="mb-3">
          <label className="mb-1 block text-xs text-text-dim">Telegram Chat ID</label>
          <input
            type="text"
            value={tgChatId}
            onChange={(e) => setTgChatId(e.target.value)}
            placeholder={t('channels.tgPlaceholder')}
            className="w-full"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={async () => {
                try {
                  show(t('channels.tgSending'));
                  const resp = await fetch('/api/brief/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      channels: ['telegram'],
                      text: t('channels.tgTestText'),
                    }),
                  });
                  const data = await resp.json();
                  if (data.ok) show(t('channels.tgTestSent', { id: data.message_id }));
                  else show(`✗ ${data.error || t('channels.sendFailed')}`);
                } catch (e: any) {
                  show(`✗ ${e?.message || t('channels.sendFailed')}`);
                }
              }}
              className="rounded bg-accent-dim px-3 py-1.5 text-xs text-white"
            >
              {t('channels.tgTestButton')}
            </button>
            <button
              onClick={async () => {
                try {
                  show(t('channels.tgBriefSending'));
                  const resp = await fetch('/api/brief/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      channels: ['telegram'],
                      topN: 5,
                    }),
                  });
                  const data = await resp.json();
                  if (data.sent) show(t('channels.tgBriefSent', { count: data.chunks_sent }));
                  else show(`✗ ${data.error || data.reason || t('channels.failed')}`);
                } catch (e: any) {
                  show(`✗ ${e?.message || t('channels.failed')}`);
                }
              }}
              className="rounded bg-bg-card border border-border px-3 py-1.5 text-xs text-text-dim"
            >
              {t('channels.tgBriefButton')}
            </button>
          </div>
          <div className="mt-2 text-[10px] text-text-muted">
            {t('channels.tgHint')}
          </div>
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <label className="mb-1 block text-xs text-text-dim">{t('channels.emailRecipientLabel')}</label>
          <input
            type="email"
            placeholder={t('channels.emailPlaceholder')}
            id="email-to-input"
            className="w-full"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={async () => {
                try {
                  show(t('channels.emailSending'));
                  const resp = await fetch('/api/brief/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      channels: ['email'],
                      subject: t('channels.emailTestSubject'),
                      text: t('channels.emailTestText'),
                    }),
                  });
                  const data = await resp.json();
                  if (data.channels?.email?.ok) show(t('channels.emailSent', { id: data.channels.email.id?.slice(0, 8) }));
                  else show(`✗ ${data.channels?.email?.error || data.channels?.email?.skipped || t('channels.sendFailed')}`);
                } catch (e: any) {
                  show(`✗ ${e?.message || t('channels.sendFailed')}`);
                }
              }}
              className="rounded bg-accent-dim px-3 py-1.5 text-xs text-white"
            >
              {t('channels.emailTestButton')}
            </button>
            <button
              onClick={async () => {
                try {
                  show(t('channels.emailBriefSending'));
                  const resp = await fetch('/api/brief/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      channels: ['email'],
                      topN: 5,
                    }),
                  });
                  const data = await resp.json();
                  if (data.channels?.email?.ok) {
                    show(t('channels.emailBriefSent', { subject: data.brief_meta?.subject?.slice(0, 30) }));
                  } else show(`✗ ${data.channels?.email?.error || data.channels?.email?.skipped || t('channels.failed')}`);
                } catch (e: any) {
                  show(`✗ ${e?.message || t('channels.failed')}`);
                }
              }}
              className="rounded bg-bg-card border border-border px-3 py-1.5 text-xs text-text-dim"
            >
              {t('channels.emailBriefButton')}
            </button>
          </div>
          <div className="mt-2 text-[10px] text-text-muted">
            {t.rich('channels.emailHint', {
              link: (chunks) => <a href="https://resend.com" target="_blank" className="text-accent">{chunks}</a>,
              br: () => <br />,
            })}
          </div>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={emailNotif} onChange={(e) => setEmailNotif(e.target.checked)} />
          {t('channels.emailNotifLabel')}
        </label>
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">{t('brief.heading')}</div>
        <div className="text-sm">{t('brief.schedule')}</div>
        <div className="mt-1 text-xs text-text-dim">{t('brief.localEquiv', { time: briefLocalTime })}</div>
      </div>

      <button onClick={save} className="mb-4 w-full rounded-lg bg-accent-dim py-3 text-sm font-semibold text-white">
        {t('saveButton')}
      </button>

      <Disclaimer />
    </>
  );
}
