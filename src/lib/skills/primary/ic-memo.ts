// Deterministic 8-section investment-committee (IC) memo outline generator.
// Ported semantics (not code) from osborn-studio-skill-hub
// skills/research/ic-memo/scripts/ic-memo-outline.mjs — offline, zero deps.

export interface OutlineSection {
  idx: number;
  title: string;
  brief: string;
  queries: string[];
}

export interface Outline {
  title: string;
  subtitle: string;
  notices: string[];
  sections: OutlineSection[];
}

const MAX_TARGET = 100;
const MAX_DEAL_CONTEXT = 2000;

export function icMemoOutline(target: string, dealContext?: string): Outline {
  const t = (target ?? '').trim();
  if (!t) throw new Error('target required');
  if (t.length > MAX_TARGET) throw new Error(`target must be <= ${MAX_TARGET} chars`);

  const ctxRaw = (dealContext ?? '').trim();
  if (ctxRaw.length > MAX_DEAL_CONTEXT) throw new Error(`dealContext must be <= ${MAX_DEAL_CONTEXT} chars`);

  const ctx = ctxRaw ? `\n已知交易背景/条款（以此为准，结合公开信息补充）：${ctxRaw}` : '';

  const sections: OutlineSection[] = [
    {
      idx: 1,
      title: '项目概述与交易标的',
      brief: `概述「${t}」本次投资项目的基本情况：交易标的、交易类型（股权/资产/控股/参股）、交易双方、交易动因与战略意图，以及本次上会决策的核心诉求。${ctx}`,
      queries: [`${t} 项目 概述 交易标的`, `${t} 股权 收购 投资 背景`],
    },
    {
      idx: 2,
      title: '交易结构与条款（对价/估值/支付方式/股权比例）',
      brief: `详述「${t}」的交易结构与核心条款：交易对价、标的估值（市盈率/EV-EBITDA/市销率等口径）、支付方式（现金/换股/分期/对赌）、收购或投资的股权比例、交割安排与先决条件、关键保护性条款。${ctx}`,
      queries: [`${t} 交易对价 估值`, `${t} 股权比例 支付方式`, `${t} 交易结构 条款 对赌`],
    },
    {
      idx: 3,
      title: '行业与市场分析',
      brief: `分析「${t}」所处行业的市场规模、增速、生命周期阶段、竞争格局、政策环境与未来 3-5 年前景，判断行业景气度对本次投资的支撑或制约。${ctx}`,
      queries: [`${t} 所在行业 市场规模 增速 前景`, `${t} 行业 竞争格局 政策`],
    },
    {
      idx: 4,
      title: '标的公司分析（业务/竞争力/管理层）',
      brief: `分析标的公司「${t}」的主营业务与商业模式、核心竞争力与壁垒、主要产品/客户/供应商、管理团队背景与公司治理结构、历史沿革与股权结构。${ctx}`,
      queries: [`${t} 主营业务 商业模式 竞争力`, `${t} 管理层 团队 股权结构`, `${t} 客户 供应商 产品`],
    },
    {
      idx: 5,
      title: '财务表现与估值（含可比）',
      brief: `梳理标的公司「${t}」近 3 年财务表现（收入/利润/毛利率/现金流/资产负债），分析增长质量与财务风险；结合可比公司/可比交易给出估值区间与本次交易估值的合理性判断。${ctx}`,
      queries: [`${t} 营收 利润 毛利率 现金流`, `${t} 估值 可比公司 可比交易`, `${t} 财务 资产负债`],
    },
    {
      idx: 6,
      title: '投资亮点与协同',
      brief: `提炼本次投资「${t}」的核心亮点与投资逻辑，分析与现有业务/被投组合的战略协同（业务/渠道/技术/客户/成本协同）及协同价值的量化测算。${ctx}`,
      queries: [`${t} 投资亮点 投资逻辑`, `${t} 协同效应 战略价值`],
    },
    {
      idx: 7,
      title: '风险因素与缓释措施',
      brief: `识别本次投资「${t}」的主要风险（行业周期/经营/财务/法律合规/整合/估值/退出风险等），逐项给出风险敞口与对应的缓释措施及条款安排。${ctx}`,
      queries: [`${t} 风险 经营 财务 合规`, `${t} 投资风险 缓释 整合`],
    },
    {
      idx: 8,
      title: '投资建议、回报测算与退出路径',
      brief: `给出对「${t}」本次投资的明确建议（投/不投/有条件投），测算预期回报（IRR/MOIC/回收期）与多情景敏感性，并规划退出路径（IPO/并购转让/回购/分红）与时间窗口。${ctx}`,
      queries: [`${t} 投资回报 IRR 退出`, `${t} 退出路径 IPO 并购 回购`],
    },
  ];

  return {
    title: `投资上会报告 · ${t}`,
    subtitle: '8 段标准上会框架',
    notices: ['AI 生成的上会材料初稿，关键数据/估值请人工复核后用于投委会决策。'],
    sections,
  };
}

// Shared renderer for all primary-market outline generators.
export function outlineToMarkdown(o: Outline): string {
  const lines: string[] = [];
  lines.push(`# ${o.title}`);
  lines.push(`> ${o.subtitle}`);
  for (const n of o.notices) lines.push(`> ⚠️ ${n}`);
  lines.push('');
  for (const s of o.sections) {
    lines.push(`## ${s.idx}. ${s.title}`);
    lines.push('');
    lines.push(s.brief);
    lines.push('');
    lines.push('**检索问题清单：**');
    for (const q of s.queries) lines.push(`- ${q}`);
    lines.push('');
    lines.push('_（待填：结合外部检索结果补充本节内容）_');
    lines.push('');
  }
  return lines.join('\n');
}
