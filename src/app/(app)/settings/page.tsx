'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Disclaimer } from '@/components/Disclaimer';
import { AccountSettings } from '@/components/AccountSettings';
import { LlmSettings } from '@/components/LlmSettings';
import { AdminManualDeliveryControls } from '@/components/ManualDeliveryControls';
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
  const router = useRouter();
  const t = useTranslations('settings');
  const currentLocale = useLocale() as AppLocale;
  const [language, setLanguage] = useState<AppLocale>(currentLocale);
  const [timezone, setTimezone] = useState(''); // '' = auto (follow browser)

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

      <AdminManualDeliveryControls />

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">{t('brief.heading')}</div>
        <div className="text-sm">{t('brief.schedule')}</div>
        <div className="mt-1 text-xs text-text-dim">{t('brief.localEquiv', { time: briefLocalTime })}</div>
      </div>

      <Disclaimer />
    </>
  );
}
