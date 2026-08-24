// Deterministic per-name investor/LP tracking outline generator.
// Ported semantics (not code) from osborn-studio-skill-hub
// skills/research/investor-lp-tracking/{scripts/investor-tracking-outline.mjs,
// references/tracking-plan.md} — offline, zero deps.

import type { Outline } from './ic-memo';

const MAX_NAMES = 20;
const DEFAULT_WINDOW = '近一个月';
const MAX_WINDOW = 50;

export function lpTrackingOutline(names: string[], windowLabel?: string): Outline {
  const cleaned = (names ?? []).map((n) => (n ?? '').trim()).filter(Boolean);
  if (cleaned.length === 0) throw new Error('names required');
  const capped = cleaned.slice(0, MAX_NAMES);

  const rawWindow = (windowLabel ?? '').trim();
  const window = (rawWindow ? rawWindow : DEFAULT_WINDOW).slice(0, MAX_WINDOW);

  const sections = capped.map((name, i) => ({
    idx: i + 1,
    title: name,
    brief:
      `追踪「${name}」${window}的最新动态，按以下五类动向逐条列出并标注时间与来源：\n` +
      `1. 新增投资 / 出资（新主导或参与的交易、新增 LP 出资）\n` +
      `2. 市场拓展（新赛道/新地域/新办公室/策略扩张）\n` +
      `3. 撤资 / 退出（IPO 退出、老股转让、并购退出、减持）\n` +
      `4. 投资成果（已实现回报、估值上调、组合公司里程碑）\n` +
      `5. 对外表态 / 战略变化（专访、公开信、会议发言）\n` +
      `未找到动向的类别需明确注明「未检索到动态」，不代表无活动。`,
    queries: [`${name} ${window} 投资 动态`, `${name} 出资 LP 新闻`, `${name} 退出 募资`],
  }));

  return {
    title: '投资人 & LP 动向追踪',
    subtitle: `${capped.length} 个对象 · ${window}`,
    notices: [],
    sections,
  };
}
