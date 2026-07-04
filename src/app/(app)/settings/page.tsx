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
    show('✓ 设置已保存到本地');
  }

  return (
    <>
      <h1 className="mb-3 text-xl font-bold">⚙️ 设置</h1>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">👤 账号</div>
        <AccountSettings />
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">📊 今日用量</div>
        <UsageToday />
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">⭐ 升级 Pro</div>
        <UpgradeCard />
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">🤖 AI 模型</div>
        <LlmSettings />
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">🌐 语言</div>
        <div className="flex gap-2">
          <button
            onClick={() => selectLanguage('zh')}
            className={`rounded px-4 py-1.5 text-sm ${language === 'zh' ? 'bg-accent-dim text-white' : 'bg-bg-card text-text-dim'}`}
          >
            🇨🇳 中文
          </button>
          <button
            onClick={() => selectLanguage('en')}
            className={`rounded px-4 py-1.5 text-sm ${language === 'en' ? 'bg-accent-dim text-white' : 'bg-bg-card text-text-dim'}`}
          >
            🇺🇸 English
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
        <div className="mb-3 text-sm font-semibold text-text-dim">📬 推送渠道</div>
        <div className="mb-3">
          <label className="mb-1 block text-xs text-text-dim">Telegram Chat ID</label>
          <input
            type="text"
            value={tgChatId}
            onChange={(e) => setTgChatId(e.target.value)}
            placeholder="例如 123456789（从 @userinfobot 获取）"
            className="w-full"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={async () => {
                try {
                  show('⏳ 测试发送中...');
                  const resp = await fetch('/api/brief/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      chatId: tgChatId || undefined,
                      text: '🧪 *Sentinel 测试消息*\n\n如果你看到这条消息，说明 Telegram 推送配置成功！\n\nhttps://stock-monitor-nu.vercel.app/',
                    }),
                  });
                  const data = await resp.json();
                  if (data.ok) show(`✅ 测试消息已发送（msg_id ${data.message_id}）`);
                  else show(`✗ ${data.error || '发送失败'}`);
                } catch (e: any) {
                  show(`✗ ${e?.message || '发送失败'}`);
                }
              }}
              className="rounded bg-accent-dim px-3 py-1.5 text-xs text-white"
            >
              ✉️ 发测试消息
            </button>
            <button
              onClick={async () => {
                try {
                  show('⏳ 生成并发送今日简报中（约 10-20s）...');
                  const resp = await fetch('/api/brief/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      chatId: tgChatId || undefined,
                      topN: 5,
                    }),
                  });
                  const data = await resp.json();
                  if (data.sent) show(`✅ 已发送 ${data.chunks_sent} 条消息`);
                  else show(`✗ ${data.error || data.reason || '失败'}`);
                } catch (e: any) {
                  show(`✗ ${e?.message || '失败'}`);
                }
              }}
              className="rounded bg-bg-card border border-border px-3 py-1.5 text-xs text-text-dim"
            >
              🚀 立即生成并推送
            </button>
          </div>
          <div className="mt-2 text-[10px] text-text-muted">
            提示：① 找 @BotFather 创建 bot 拿 token  ②  和 bot 说 hi  ③  从 @userinfobot 拿 chat_id  ④ 在 Vercel env 加 TELEGRAM_BOT_TOKEN
          </div>
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <label className="mb-1 block text-xs text-text-dim">📧 Email 收件人</label>
          <input
            type="email"
            placeholder="you@example.com（不填则用 EMAIL_TO env）"
            id="email-to-input"
            className="w-full"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={async () => {
                const to = (document.getElementById('email-to-input') as HTMLInputElement)?.value || undefined;
                try {
                  show('⏳ 发送测试邮件中...');
                  const resp = await fetch('/api/brief/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      to,
                      channels: ['email'],
                      subject: 'Sentinel · 邮件测试',
                      text: '🧪 Sentinel email 测试\n\n如果你看到这封邮件，说明 Resend 推送配置成功！\n\nhttps://stock-monitor-nu.vercel.app/',
                    }),
                  });
                  const data = await resp.json();
                  if (data.channels?.email?.ok) show(`✅ 邮件已发送 (id ${data.channels.email.id?.slice(0, 8)}...)`);
                  else show(`✗ ${data.channels?.email?.error || data.channels?.email?.skipped || '发送失败'}`);
                } catch (e: any) {
                  show(`✗ ${e?.message || '发送失败'}`);
                }
              }}
              className="rounded bg-accent-dim px-3 py-1.5 text-xs text-white"
            >
              ✉️ 发邮件测试
            </button>
            <button
              onClick={async () => {
                const to = (document.getElementById('email-to-input') as HTMLInputElement)?.value || undefined;
                try {
                  show('⏳ 生成并发邮件简报中（约 20-30s）...');
                  const resp = await fetch('/api/brief/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      to,
                      channels: ['email'],
                      topN: 5,
                    }),
                  });
                  const data = await resp.json();
                  if (data.channels?.email?.ok) {
                    show(`✅ 简报邮件已发送（主题：${data.brief_meta?.subject?.slice(0, 30)}...）`);
                  } else show(`✗ ${data.channels?.email?.error || data.channels?.email?.skipped || '失败'}`);
                } catch (e: any) {
                  show(`✗ ${e?.message || '失败'}`);
                }
              }}
              className="rounded bg-bg-card border border-border px-3 py-1.5 text-xs text-text-dim"
            >
              🚀 立即生成 brief 并发邮件
            </button>
          </div>
          <div className="mt-2 text-[10px] text-text-muted">
            提示：① 注册 <a href="https://resend.com" target="_blank" className="text-accent">resend.com</a>（免费 100 邮件/日）② 拿 API key ③ vercel env add RESEND_API_KEY + EMAIL_TO + EMAIL_FROM
            <br />④ 沙箱测试可用 EMAIL_FROM=onboarding@resend.dev（接收方必须是 Resend 账号邮箱）
          </div>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={emailNotif} onChange={(e) => setEmailNotif(e.target.checked)} />
          启用每日邮件推送（与 Telegram 并行）
        </label>
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">{t('brief.heading')}</div>
        <div className="text-sm">{t('brief.schedule')}</div>
        <div className="mt-1 text-xs text-text-dim">{t('brief.localEquiv', { time: briefLocalTime })}</div>
      </div>

      <button onClick={save} className="mb-4 w-full rounded-lg bg-accent-dim py-3 text-sm font-semibold text-white">
        💾 保存所有设置
      </button>

      <Disclaimer />
    </>
  );
}
