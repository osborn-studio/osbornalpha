/**
 * Multi-stock radar digest — composes a single Telegram-friendly summary
 * across the watchlist. Sister of `radar.ts` (per-stock morning note);
 * this one's job is the daily push that lands in your phone at 08:00 CST.
 *
 * Strategy:
 *   - Group cards by radar_level (🔴 关注 / 🟡 留意 / ⚪️ 平静)
 *   - Show full detail for 🔴 + 🟡 only (the actionable ones)
 *   - Collapse ⚪️ into a one-line ticker list (still surfaces "no news today")
 *   - Always end with disclaimer
 *
 * Two render targets:
 *   - Markdown (Telegram default parseMode='Markdown')
 *   - HTML (email body via Resend)
 */

import { buildRadar, type RadarPayload, type RadarLevel } from './radar';
import { buildDigestTakes, isDigestTakesEnabled, type DigestTake } from './digest-takes';

const DISCLAIMER = '本简报仅作决策辅助，不构成投资建议';

export interface RadarDigest {
  date: string;                // ISO yyyy-mm-dd (Beijing)
  generated_at: string;        // full ISO
  totals: Record<RadarLevel, number>;
  by_level: Record<RadarLevel, RadarPayload[]>;
  errors: Array<{ ticker: string; error: string }>;
  /** Per-actionable-stock LLM 1-sentence take (empty when LLM_DIGEST_TAKE not 'on') */
  takes: DigestTake[];
  total_llm_cost_usd: number;
  markdown: string;            // for Telegram
  html: string;                // for email
  subject: string;             // email subject line
  // The full sorted ticker list (high → low score), useful for cron logs
  order: string[];
}

function bjDateISO(): string {
  const now = new Date();
  const bj = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return bj.toISOString().slice(0, 10);
}

function emojiFor(level: RadarLevel): string {
  return level === 'red' ? '🔴' : level === 'yellow' ? '🟡' : '⚪️';
}

function labelFor(level: RadarLevel): string {
  return level === 'red' ? '关注' : level === 'yellow' ? '留意' : '平静';
}

/** One-card Telegram-Markdown block — used in the actionable section. */
function renderCardMarkdown(r: RadarPayload, take?: DigestTake): string {
  const { ticker, name, headline, score } = r;
  const price = r.sections.price.value;
  const pct = r.sections.price.change_pct;
  const priceLine = price !== null && pct !== null
    ? `${r.sections.price.currency}${price.toFixed(2)} ${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`
    : '—';

  const lines: string[] = [];
  lines.push(`${emojiFor(r.radar_level)} *${name}* (${ticker})  ·  ${priceLine}  ·  score ${score > 0 ? '+' : ''}${score}`);
  lines.push(`   ↳ ${headline}`);

  // Top triggers (max 3) as sub-bullets
  const tops = r.triggers
    .filter((t) => t.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
  for (const t of tops) {
    lines.push(`   • ${t.desc}`);
  }

  // AI 委员会 take (only when LLM_DIGEST_TAKE=on)
  if (take && take.take && !take.error) {
    lines.push(`   _🤖 AI: ${take.take}_`);
  }
  return lines.join('\n');
}

/** One-card HTML block — for email. */
function renderCardHtml(r: RadarPayload, take?: DigestTake): string {
  const { ticker, name, headline, score } = r;
  const price = r.sections.price.value;
  const pct = r.sections.price.change_pct;
  const priceColor = pct === null ? '#888' : pct > 0 ? '#d33' : pct < 0 ? '#3a3' : '#888';
  const priceLine = price !== null && pct !== null
    ? `${r.sections.price.currency}${price.toFixed(2)} <span style="color:${priceColor}">${pct > 0 ? '+' : ''}${pct.toFixed(2)}%</span>`
    : '<span style="color:#888">—</span>';
  const levelEmoji = emojiFor(r.radar_level);

  const tops = r.triggers
    .filter((t) => t.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  const takeBlock = take && take.take && !take.error
    ? `<div style="margin-top:6px;padding:6px 10px;background:#eef5ff;border-radius:4px;font-size:12px;color:#234"><span style="color:#888">🤖 AI:</span> ${escapeHtml(take.take)}</div>`
    : '';

  return `
<div style="border-left:3px solid ${r.radar_level === 'red' ? '#d33' : '#e8a93e'};padding:8px 12px;margin:8px 0;background:#fafafa">
  <div style="font-size:14px"><strong>${levelEmoji} ${escapeHtml(name)}</strong> <span style="color:#666">(${ticker})</span> · ${priceLine} · <span style="color:#888">score ${score > 0 ? '+' : ''}${score}</span></div>
  <div style="font-size:13px;color:#444;margin-top:4px">↳ ${escapeHtml(headline)}</div>
  ${tops.length > 0 ? '<ul style="margin:4px 0 0 0;padding-left:20px;font-size:12px;color:#555">' + tops.map((t) => `<li>${escapeHtml(t.desc)}</li>`).join('') + '</ul>' : ''}
  ${takeBlock}
</div>`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build the digest by fanning out buildRadar() across the watchlist.
 * Resilient: per-ticker failures are caught and listed in `errors`.
 *
 * If LLM_DIGEST_TAKE=on, also fans out a 1-sentence LLM committee take
 * across actionable (🔴/🟡) stocks. Failures are non-fatal — the digest
 * still ships, just without takes for the failed ones.
 */
export async function buildRadarDigest(tickers: string[]): Promise<RadarDigest> {
  const date = bjDateISO();
  const results = await Promise.allSettled(tickers.map((t) => buildRadar(t)));

  const radars: RadarPayload[] = [];
  const errors: Array<{ ticker: string; error: string }> = [];
  results.forEach((r, i) => {
    const t = tickers[i] || 'unknown';
    if (r.status === 'fulfilled') {
      radars.push(r.value);
    } else {
      errors.push({ ticker: t, error: (r.reason as any)?.message || String(r.reason) });
    }
  });

  // Sort by score desc within each level
  radars.sort((a, b) => b.score - a.score);

  const by_level: Record<RadarLevel, RadarPayload[]> = { red: [], yellow: [], white: [] };
  for (const r of radars) by_level[r.radar_level].push(r);

  const totals: Record<RadarLevel, number> = {
    red: by_level.red.length,
    yellow: by_level.yellow.length,
    white: by_level.white.length,
  };

  // LLM committee takes for actionables (no-op when env off / no provider)
  const actionables = [...by_level.red, ...by_level.yellow];
  const takes = isDigestTakesEnabled() ? await buildDigestTakes(actionables) : [];
  const takesByTicker = new Map(takes.map((t) => [t.ticker, t]));
  const total_llm_cost_usd = takes.reduce((s, t) => s + (t.est_cost_usd || 0), 0);

  // ── Markdown (Telegram) ────────────────────────────────────────────
  const md: string[] = [];
  md.push(`*🌅 每股雷达* · ${date}`);
  md.push(`关注 ${totals.red} · 留意 ${totals.yellow} · 平静 ${totals.white}${errors.length > 0 ? ` · ⚠ ${errors.length} 拉取失败` : ''}`);
  md.push('');

  if (totals.red > 0) {
    md.push(`*🔴 关注 (${totals.red})*`);
    md.push('━━━━━━━━━━━━━━━━━━');
    for (const r of by_level.red) {
      md.push(renderCardMarkdown(r, takesByTicker.get(r.ticker)));
      md.push('');
    }
  }
  if (totals.yellow > 0) {
    md.push(`*🟡 留意 (${totals.yellow})*`);
    md.push('━━━━━━━━━━━━━━━━━━');
    for (const r of by_level.yellow) {
      md.push(renderCardMarkdown(r, takesByTicker.get(r.ticker)));
      md.push('');
    }
  }
  if (totals.white > 0) {
    md.push(`*⚪️ 平静 (${totals.white})*`);
    md.push(by_level.white.map((r) => `${r.name} (${r.ticker})`).join(' · '));
    md.push('');
  }
  if (totals.red === 0 && totals.yellow === 0) {
    md.push('_今日股票池整体平静，维持持仓。_');
    md.push('');
  }
  md.push(`_${DISCLAIMER}_`);

  // ── HTML (email) ───────────────────────────────────────────────────
  const html: string[] = [];
  html.push(`<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:16px">`);
  html.push(`<h2 style="margin:0 0 4px 0">🌅 每股雷达 · ${date}</h2>`);
  html.push(`<p style="color:#666;font-size:13px;margin:0 0 16px 0">关注 ${totals.red} · 留意 ${totals.yellow} · 平静 ${totals.white}${errors.length > 0 ? ` · <span style="color:#d33">⚠ ${errors.length} 拉取失败</span>` : ''}</p>`);

  if (totals.red > 0) {
    html.push(`<h3 style="margin:16px 0 4px 0">🔴 关注 (${totals.red})</h3>`);
    for (const r of by_level.red) html.push(renderCardHtml(r, takesByTicker.get(r.ticker)));
  }
  if (totals.yellow > 0) {
    html.push(`<h3 style="margin:16px 0 4px 0">🟡 留意 (${totals.yellow})</h3>`);
    for (const r of by_level.yellow) html.push(renderCardHtml(r, takesByTicker.get(r.ticker)));
  }
  if (totals.white > 0) {
    html.push(`<h3 style="margin:16px 0 4px 0;color:#888">⚪️ 平静 (${totals.white})</h3>`);
    html.push(`<p style="color:#888;font-size:13px;margin:4px 0">${by_level.white.map((r) => `${escapeHtml(r.name)} (${r.ticker})`).join(' · ')}</p>`);
  }
  if (totals.red === 0 && totals.yellow === 0) {
    html.push(`<p style="color:#888;font-style:italic;margin:16px 0">今日股票池整体平静，维持持仓。</p>`);
  }
  html.push(`<hr style="border:0;border-top:1px solid #eee;margin:24px 0 8px 0">`);
  html.push(`<p style="color:#999;font-size:11px;font-style:italic;margin:0">${DISCLAIMER}</p>`);
  html.push(`</div>`);

  // ── Subject line ───────────────────────────────────────────────────
  const subjectBits = [`🌅 雷达 ${date}`];
  if (totals.red > 0) subjectBits.push(`🔴${totals.red}`);
  if (totals.yellow > 0) subjectBits.push(`🟡${totals.yellow}`);
  if (totals.red === 0 && totals.yellow === 0) subjectBits.push('平静');
  const subject = subjectBits.join(' · ');

  return {
    date,
    generated_at: new Date().toISOString(),
    totals,
    by_level,
    errors,
    takes,
    total_llm_cost_usd,
    markdown: md.join('\n'),
    html: html.join('\n'),
    subject,
    order: radars.map((r) => r.ticker),
  };
}
