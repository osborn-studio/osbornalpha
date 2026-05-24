/**
 * 1-sentence "AI 委员会" take per actionable stock, embedded in the
 * daily-radar digest. Sister of /api/perspectives which runs the full
 * 9-persona committee — this one is the cheap consensus line for the
 * morning push.
 *
 * Cost model (DeepSeek chat):
 *   ~350 input tokens + ~50 output tokens per call
 *   ≈ $0.00015 per call
 *   2 actionables/day × 30 = 60 calls/mo = ~$0.009/mo
 *   Even at 10/day → $0.045/mo (well under budget)
 *
 * Env gate: LLM_DIGEST_TAKE must equal "on" — opt-in to avoid surprise
 * cost even at this tiny scale.
 */

import { chat, isLLMConfigured } from '@/lib/data/sources/llm';
import type { RadarPayload } from './radar';

export interface DigestTake {
  ticker: string;
  take: string;          // 1-sentence consensus
  est_cost_usd: number;
  model: string;
  error?: string;
}

export function isDigestTakesEnabled(): boolean {
  return process.env.LLM_DIGEST_TAKE === 'on' && isLLMConfigured();
}

const SYSTEM_PROMPT = `你是 Stock Monitor 雷达系统的「投资委员会主席」。
任务: 基于给定的单只 A 股 / 港股 / 美股的当日信号,
写**一句**不超过 40 字的中文 take, 风格类似华尔街晨会主管。

规则:
- **只输出一句话**, 不要分点, 不要"总结:"
- 严禁"建议买入/卖出/必涨/明天会涨", 改用"信号偏多/偏空/中性/留意"
- 把最重要的 1-2 个信号挑出来, 提出可观察的下一步动作
- 末尾不带句号也可以, 像 Twitter 推文
- 不要重复用户已经看到的数字; 增加判断, 不增加事实

示例:
- "北上连续 30 天买入 + 财报 T-7, 信号偏多, 关注公告窗口的 volatility"
- "3 连板叠加业绩预增 80%+, 短线情绪饱和, 注意获利盘"
- "信号矩阵中性偏弱, 维持观察, 等待北上回流确认"`;

function buildUserMessage(r: RadarPayload): string {
  const lines: string[] = [];
  lines.push(`股票: ${r.name} (${r.ticker})  当前价 ${r.sections.price.currency}${r.sections.price.value} (${r.sections.price.change_pct?.toFixed(2)}%)`);
  lines.push(`雷达级别: ${r.radar_level === 'red' ? '🔴 关注' : '🟡 留意'}  评分: ${r.score >= 0 ? '+' : ''}${r.score}`);
  lines.push(`Top Call (composer 自动): ${r.headline}`);
  lines.push('');
  lines.push('已识别信号:');
  for (const t of r.triggers) {
    lines.push(`- ${t.desc}  (权重 ${t.weight > 0 ? '+' : ''}${t.weight})`);
  }
  if (r.sections.calendar?.next_earnings_days != null && r.sections.calendar.next_earnings_days <= 14) {
    lines.push(`下个财报: T-${r.sections.calendar.next_earnings_days}`);
  }
  if (r.sections.fundamentals.roe !== null) {
    lines.push(`ROE ${r.sections.fundamentals.roe.toFixed(1)}%  毛利 ${r.sections.fundamentals.gross_margin?.toFixed(1) ?? '-'}%`);
  }
  lines.push('');
  lines.push('请只输出 1 句话 (≤40 字) 的 take:');
  return lines.join('\n');
}

/**
 * Run takes in parallel across all actionable (🔴 + 🟡) stocks.
 * Failures are caught per-stock and surfaced as { error } so a single
 * timeout doesn't block the cron from sending the digest.
 */
export async function buildDigestTakes(actionables: RadarPayload[]): Promise<DigestTake[]> {
  if (!isDigestTakesEnabled()) return [];
  if (actionables.length === 0) return [];

  const results = await Promise.allSettled(
    actionables.map(async (r): Promise<DigestTake> => {
      try {
        const resp = await chat({
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildUserMessage(r) }],
          max_tokens: 120,
          temperature: 0.55,
          timeoutMs: 20_000,
        });
        const text = resp.content.trim()
          .replace(/^["'""]+|["'""]+$/g, '')
          .replace(/\n.*$/s, '')           // first line only
          .slice(0, 80);                    // hard cap
        return {
          ticker: r.ticker,
          take: text,
          est_cost_usd: resp.est_cost_usd,
          model: resp.model,
        };
      } catch (e: any) {
        return {
          ticker: r.ticker,
          take: '',
          est_cost_usd: 0,
          model: 'none',
          error: e?.message || String(e),
        };
      }
    }),
  );

  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { ticker: actionables[i]?.ticker || 'unknown', take: '', est_cost_usd: 0, model: 'none', error: 'rejected' }
  );
}
