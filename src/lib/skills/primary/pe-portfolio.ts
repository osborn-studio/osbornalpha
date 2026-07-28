// Deterministic 3-section PE fund portfolio outline generator.
// Ported semantics (not code) from osborn-studio-skill-hub
// skills/research/pe-portfolio/scripts/pe-portfolio-outline.mjs — offline, zero deps.

import type { Outline } from './ic-memo';

const MAX_FUND = 100;

export function pePortfolioOutline(fund: string): Outline {
  const f = (fund ?? '').trim();
  if (!f) throw new Error('fund required');
  if (f.length > MAX_FUND) throw new Error(`fund must be <= ${MAX_FUND} chars`);

  const sections = [
    {
      idx: 1,
      title: '基金与组合概览',
      brief: `介绍「${f}」的基本情况、投资策略与重点行业，并概述其已知投资组合（Portfolio）的整体规模与分布。`,
      queries: [`${f} 投资组合 portfolio`, `${f} 投资策略 重点行业`],
    },
    {
      idx: 2,
      title: '主要被投/收购项目明细',
      brief: `逐个列出「${f}」主要投资或收购的企业（Portfolio 公司），每个给出：投资/收购时间、背景、交易价格或估值、标的公司的财务表现与经营近况。`,
      queries: [`${f} 投资 企业 列表`, `${f} 收购 估值 交易`, `${f} 被投企业 财务`],
    },
    {
      idx: 3,
      title: '近期动态与退出',
      brief: `检索「${f}」近期的新增投资、增资、退出（IPO/并购退出）、市场拓展与投资成果。`,
      queries: [`${f} 近期 投资 退出`, `${f} IPO 退出 回报`],
    },
  ];

  return {
    title: `私募基金 Portfolio · ${f}`,
    subtitle: '组合概览 + 项目明细 + 近期动态',
    notices: [],
    sections,
  };
}
