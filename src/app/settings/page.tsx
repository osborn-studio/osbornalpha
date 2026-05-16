'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { Disclaimer } from '@/components/Disclaimer';

export default function SettingsPage() {
  const { show } = useToast();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [tgChatId, setTgChatId] = useState('');
  const [emailNotif, setEmailNotif] = useState(true);
  const [briefTime, setBriefTime] = useState('08:30');

  useEffect(() => {
    setLanguage((localStorage.getItem('lang') as 'zh' | 'en') || 'zh');
    setTgChatId(localStorage.getItem('tg-chat-id') || '');
    setEmailNotif(localStorage.getItem('email-notif') !== 'false');
    setBriefTime(localStorage.getItem('brief-time') || '08:30');
    if (isSupabaseConfigured()) {
      const sb = getBrowserSupabase();
      sb.auth.getUser().then(({ data: { user: u } }) => {
        if (u) setUser({ id: u.id, email: u.email });
      });
    }
  }, []);

  function save() {
    localStorage.setItem('lang', language);
    localStorage.setItem('tg-chat-id', tgChatId);
    localStorage.setItem('email-notif', String(emailNotif));
    localStorage.setItem('brief-time', briefTime);
    show('✓ 设置已保存到本地');
    // TODO: persist to Supabase if authed
  }

  async function logout() {
    if (!isSupabaseConfigured()) return;
    const sb = getBrowserSupabase();
    await sb.auth.signOut();
    setUser(null);
    show('✓ 已登出');
  }

  return (
    <>
      <h1 className="mb-3 text-xl font-bold">⚙️ 设置</h1>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">👤 账号</div>
        {user ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{user.email}</div>
              <div className="text-[11px] text-text-dim">User ID: {user.id.slice(0, 8)}...</div>
            </div>
            <button onClick={logout} className="rounded border border-border bg-transparent px-3 py-1.5 text-xs">
              登出
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="text-sm">
              访客模式 — 数据存浏览器本地
              {!isSupabaseConfigured() && <div className="mt-1 text-[11px] text-warn">⚠️ Supabase 未配置，无法登录</div>}
            </div>
            {isSupabaseConfigured() && (
              <Link href="/login" className="rounded bg-accent-dim px-3 py-1.5 text-xs text-white">
                登录 / 注册
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">🌐 语言</div>
        <div className="flex gap-2">
          <button
            onClick={() => setLanguage('zh')}
            className={`rounded px-4 py-1.5 text-sm ${language === 'zh' ? 'bg-accent-dim text-white' : 'bg-bg-card text-text-dim'}`}
          >
            🇨🇳 中文
          </button>
          <button
            onClick={() => setLanguage('en')}
            className={`rounded px-4 py-1.5 text-sm ${language === 'en' ? 'bg-accent-dim text-white' : 'bg-bg-card text-text-dim'}`}
          >
            🇺🇸 English (stub)
          </button>
        </div>
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={emailNotif} onChange={(e) => setEmailNotif(e.target.checked)} />
          每日邮件推送（待 v0.6 接入 Resend）
        </label>
      </div>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">⏰ 简报时间</div>
        <div className="flex items-center gap-2">
          <input type="time" value={briefTime} onChange={(e) => setBriefTime(e.target.value)} className="w-32" />
          <span className="text-xs text-text-dim">CST (Asia/Shanghai)</span>
        </div>
      </div>

      <button onClick={save} className="mb-4 w-full rounded-lg bg-accent-dim py-3 text-sm font-semibold text-white">
        💾 保存所有设置
      </button>

      <Disclaimer />
    </>
  );
}
