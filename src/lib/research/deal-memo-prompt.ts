/**
 * Deal-memo (一级市场兼容 IC memo) prompt assembly + draft validation.
 * Pure functions — TDD'd, no IO. Additive to the §4.4 thesis memo engine; the
 * thesis path (memo-prompt.ts) is untouched.
 *
 * The primary-market valuation system is the core of a deal memo: the schema,
 * prompt, and validator MUST structurally carry all 8 valuation fields even
 * when empty. The LLM is asked for the eight-section 上会 framework + a
 * recommendation (verdict) + the structured `valuation` object as strict JSON.
 * Secondary-market comps are a CHECK only — the prompt says so explicitly and
 * the type keeps them in public_market_crosscheck.
 *
 * Doctrine ported (read-only) from osborn-skill-catalog research/ic-memo
 * (SKILL.md + references/section-framework.md).
 * Spec: docs/research-os/2026-07-06-ic-memo-deal-variant-spec.md
 */

import { createHash } from 'node:crypto';
import type {
  DealComp,
  DealExitPath,
  DealMemoDraft,
  DealRecommendation,
  DealSection,
  DealSensitivityItem,
  DealValuation,
  DealValuationRisk,
  DealVerdict,
  SourceDocument,
} from './types';
import { buildSourceCorpus } from './memo-prompt';

export interface DealMemoPrompt {
  system: string;
  user: string;
  prompt_sha256: string;
  source_document_ids: string[];
}

export interface BuildDealMemoPromptOpts {
  target: string;
  deal_context?: string;
  sources?: SourceDocument[];
  budgetChars?: number;
  perSourceChars?: number;
}

/** The eight-section 上会 framework (section-framework.md), id + title + brief. */
export const DEAL_SECTION_FRAMEWORK: ReadonlyArray<{ id: string; title: string; brief: string }> = [
  { id: 'overview', title: '项目概述与交易标的', brief: '交易标的、类型（股权/资产/控股/参股）、各方、交易动机与战略意图、本次上会决策的核心诉求。' },
  { id: 'structure', title: '交易结构与条款', brief: '对价、进入估值口径（P/E、EV-EBITDA、P/S）、支付方式（现金/换股/分期/对赌）、股权比例、交割与先决条件、关键保护性条款。' },
  { id: 'industry', title: '行业与市场分析', brief: '市场规模、增速、生命周期、竞争格局、政策、3-5 年展望；判断行业景气如何支撑或约束本交易。' },
  { id: 'target', title: '标的公司分析', brief: '核心业务与模式、护城河、产品/客户/供应商、管理层与治理、历史沿革与股权结构。' },
  { id: 'financials', title: '财务表现与估值', brief: '近三年营收/利润/利润率/现金流/杠杆、增长质量与财务风险；可比公司/可比交易的估值区间及本交易合理性检验。' },
  { id: 'highlights', title: '投资亮点与协同', brief: '投资逻辑与亮点、与现有/组合业务的战略协同（业务/渠道/技术/客户/成本），量化协同估计。' },
  { id: 'risks', title: '风险因素与缓释措施', brief: '重大风险（周期/经营/财务/法律/整合/估值/退出），每条含敞口与缓释或条款保护。' },
  { id: 'recommendation', title: '投资建议、回报测算与退出路径', brief: '明确判断（投/不投/有条件投）、回报测算（IRR/MOIC/回收期）含情景敏感性、退出路径（IPO/并购转让/回购/分红）及时间窗——本段是 memo 的灵魂。' },
];

/**
 * The deal-memo output schema string, injected into the prompt. Carries the 8
 * narrative sections + recommendation + the 8-field primary-market valuation
 * object VERBATIM. Do not fork/copy — single source of truth for prompt + docs.
 */
export const DEAL_MEMO_SCHEMA = `{
  "title": string,                                   // 投资上会报告 · <标的>
  "sections": [                                       // 恰好 8 段，顺序固定（见 system 框架）
    {
      "id": string,                                  // overview|structure|industry|target|financials|highlights|risks|recommendation
      "title": string,                               // 段标题
      "body_md": string,                             // 段正文（markdown）
      "tags": {                                      // 事实/假设/推断分级（合规红线）
        "facts": string[],                           // 有来源支撑的事实（材料内）
        "assumptions": string[],                     // 假设
        "inferences": string[]                       // 推断
      }
    }
  ],
  "recommendation": {
    "verdict": "invest" | "pass" | "conditional",    // 投 / 不投 / 有条件投
    "conditions": string[],                          // 有条件投时的条件（可空数组）
    "rationale": string                              // 判断理由
  },
  "valuation": {                                      // 一级市场估值体系——八字段结构必须齐（值可空/待核实）
    "valuation_basis": string[],                     // DCF / 可比公司 / 可比交易 / 资产法 / SOTP / 收入倍数 / EBITDA 倍数 …
    "entry_valuation": {                             // 进入估值（全部可空）
      "pre_money": number | null, "post_money": number | null,
      "ev": number | null, "equity_value": number | null,
      "per_share": number | null, "transaction_value": number | null,
      "currency": string | null
    },
    "ownership_and_dilution": {                      // 持股与稀释（换股/增资影响）
      "stake_pct": number | null, "dilution": string | null, "swap_or_raise_note": string | null
    },
    "return_profile": {                              // 回报画像
      "irr": number | null, "moic": number | null, "payback": string | null,
      "scenarios": { "base": string | null, "upside": string | null, "downside": string | null }
    },
    "exit_assumptions": {                            // 退出假设
      "paths": [ { "type": "IPO"|"并购转让"|"回购"|"二级转让"|string, "window": string | null } ]
    },
    "sensitivity": [ { "variable": string, "effect": string } ],     // 收入增长/利润率/退出倍数/折现率/终值倍数 …
    "valuation_risks": [ { "risk": string, "mitigant": string } ],
    "public_market_crosscheck": {                    // 二级市场交叉验证——校验非主轴，不得覆盖一级逻辑
      "applicable": boolean,
      "comps": [ { "ticker": string | null, "name": string | null, "multiple": string | null } ],
      "note": string | null
    }
  }
}`;

function buildSystemPrompt(): string {
  const frameworkLines = DEAL_SECTION_FRAMEWORK.map(
    (s, i) => `${i + 1}. ${s.title}（id="${s.id}"）——${s.brief}`,
  ).join('\n');

  return `你是一名严谨的一级市场（PE/并购/融资/Pre-IPO）投资研究员。你的任务是基于给定条款与研究材料，生成一份**投资委员会上会报告（deal memo）草稿**。这是一份带明确判断（verdict）的推荐文档，不是中性简报。

八段标准上会框架（顺序固定，必须全部输出）：
${frameworkLines}

一级市场估值体系（本报告核心，必须逐字段结构化承载，能填则填、无依据置 null 或在段落中标"待核实"）：
- valuation_basis：估值依据（DCF / 可比公司 / 可比交易 / 资产法 / SOTP / 收入倍数 / EBITDA 倍数 …）。
- entry_valuation：进入估值——pre_money / post_money / ev / equity_value / per_share / transaction_value / currency。
- ownership_and_dilution：持股比例 stake_pct、稀释 dilution、换股或增资影响 swap_or_raise_note。
- return_profile：IRR / MOIC / 回收期 payback / 情景（base/upside/downside）。
- exit_assumptions：退出路径 paths（IPO/并购转让/回购/二级转让）及各自时间窗 window——**退出倍数与退出路径是一级市场估值主轴**。
- sensitivity：敏感性（收入增长/利润率/退出倍数/折现率/终值倍数对回报的影响）。
- valuation_risks：估值风险 → 缓释。
- public_market_crosscheck：若标的为上市公司或有可比上市公司，用二级市场做**交叉验证 crosscheck**。

硬性规则：
1. 尊重给定条款：deal_context 是**权威**的交易条款，公开研究只做补充，不得改写给定条款。
2. 引用材料带来源：material claim 应能追溯到提供的材料；无材料支撑的判断进 assumptions/inferences 或段落"待核实"，不得伪装成事实。
3. fact/assumption/inference 分级：每段 tags 分别列出事实、假设、推断。
4. **一级市场优先，二级市场仅交叉验证**：pre_money/post_money、稀释、退出倍数才是估值主轴；public_market_crosscheck 只做校验，**不覆盖**一级市场估值逻辑。
5. 估值不手算：不要在本报告内手算 DCF/复杂 IRR——引用 DCF/可比公司/可比交易口径并留结构位，数值人工复核。
6. 第 8 段是 memo 的灵魂：必须给出明确 verdict（invest/pass/conditional）+ 回报测算（IRR/MOIC/回收期或情景）+ 至少一条退出路径。
7. 人工门：本报告为 **AI 初稿**，关键数据/估值须人工复核后方可用于投委会决策。
8. 禁止收益承诺话术（必涨/保证/稳赚/无风险等）。
9. 输出严格 JSON（不要 markdown code fence），schema 如下：
${DEAL_MEMO_SCHEMA}`;
}

const SYSTEM_PROMPT = buildSystemPrompt();

/**
 * Assemble the deal-memo generation prompt. Sources (e.g. diligence briefs
 * stored in the brain) are injected newest-first and truncated against the
 * char budget, reusing the thesis memo's buildSourceCorpus.
 */
export function buildDealMemoPrompt(opts: BuildDealMemoPromptOpts): DealMemoPrompt {
  const sources = opts.sources ?? [];
  const { manifest, corpus, source_document_ids } = buildSourceCorpus(
    sources,
    opts.budgetChars ?? 24_000,
    opts.perSourceChars ?? 8_000,
  );

  const dealContextBlock = opts.deal_context?.trim()
    ? opts.deal_context.trim()
    : '（未提供交易条款——凡涉及对价/估值/结构的判断一律标"待核实"，进 assumptions）';

  const user = `交易标的（target）：${opts.target}

交易条款（deal_context，权威，公开研究只补充不改写）：
${dealContextBlock}

可引用的研究材料清单（含尽调简报等）：
${manifest || '（无可用材料——凡材料外断言一律进 assumptions/inferences 或标"待核实"）'}

材料原文：
${corpus || '（无）'}

请按 system 指定的八段框架 + recommendation + 一级市场估值八字段，输出严格 JSON deal memo。`;

  const prompt_sha256 = createHash('sha256').update(SYSTEM_PROMPT + user, 'utf8').digest('hex');
  return { system: SYSTEM_PROMPT, user, prompt_sha256, source_document_ids };
}

// ---------------------------------------------------------------------------
// Validation / structural backfill

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim());
}

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** A fully-structured empty valuation — every one of the 8 fields present. */
export function emptyDealValuation(): DealValuation {
  return {
    valuation_basis: [],
    entry_valuation: {
      pre_money: null, post_money: null, ev: null, equity_value: null,
      per_share: null, transaction_value: null, currency: null,
    },
    ownership_and_dilution: { stake_pct: null, dilution: null, swap_or_raise_note: null },
    return_profile: { irr: null, moic: null, payback: null, scenarios: { base: null, upside: null, downside: null } },
    exit_assumptions: { paths: [] },
    sensitivity: [],
    valuation_risks: [],
    public_market_crosscheck: { applicable: false, comps: [], note: null },
  };
}

function normalizeSection(raw: unknown, fallback: { id: string; title: string }): DealSection {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const tagsRaw = (o.tags && typeof o.tags === 'object' ? o.tags : {}) as Record<string, unknown>;
  return {
    id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : fallback.id,
    title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : fallback.title,
    body_md: typeof o.body_md === 'string' ? o.body_md : '',
    tags: {
      facts: asStringArray(tagsRaw.facts),
      assumptions: asStringArray(tagsRaw.assumptions),
      inferences: asStringArray(tagsRaw.inferences),
    },
  };
}

/** Force exactly the 8 framework sections, matching supplied ones by id then position. */
function normalizeSections(raw: unknown): DealSection[] {
  const supplied = Array.isArray(raw) ? raw : [];
  const byId = new Map<string, unknown>();
  for (const s of supplied) {
    const id = s && typeof s === 'object' ? (s as any).id : undefined;
    if (typeof id === 'string' && !byId.has(id)) byId.set(id, s);
  }
  return DEAL_SECTION_FRAMEWORK.map((fw, i) => {
    const match = byId.get(fw.id) ?? supplied[i];
    return normalizeSection(match, { id: fw.id, title: fw.title });
  });
}

function normalizeExitPaths(raw: unknown): DealExitPath[] {
  if (!Array.isArray(raw)) return [];
  const out: DealExitPath[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const type = strOrNull((p as any).type);
    if (!type) continue;
    out.push({ type, window: strOrNull((p as any).window) });
  }
  return out;
}

function normalizeSensitivity(raw: unknown): DealSensitivityItem[] {
  if (!Array.isArray(raw)) return [];
  const out: DealSensitivityItem[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const variable = strOrNull((s as any).variable);
    const effect = strOrNull((s as any).effect);
    if (variable && effect) out.push({ variable, effect });
  }
  return out;
}

function normalizeRisks(raw: unknown): DealValuationRisk[] {
  if (!Array.isArray(raw)) return [];
  const out: DealValuationRisk[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const risk = strOrNull((r as any).risk);
    const mitigant = strOrNull((r as any).mitigant);
    if (risk) out.push({ risk, mitigant: mitigant ?? '' });
  }
  return out;
}

function normalizeComps(raw: unknown): DealComp[] {
  if (!Array.isArray(raw)) return [];
  const out: DealComp[] = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    out.push({
      ticker: strOrNull((c as any).ticker),
      name: strOrNull((c as any).name),
      multiple: strOrNull((c as any).multiple),
    });
  }
  return out;
}

/** Structurally backfill all 8 valuation fields, preserving supplied values. */
function normalizeValuation(raw: unknown): DealValuation {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const ev = (o.entry_valuation && typeof o.entry_valuation === 'object' ? o.entry_valuation : {}) as Record<string, unknown>;
  const od = (o.ownership_and_dilution && typeof o.ownership_and_dilution === 'object' ? o.ownership_and_dilution : {}) as Record<string, unknown>;
  const rp = (o.return_profile && typeof o.return_profile === 'object' ? o.return_profile : {}) as Record<string, unknown>;
  const sc = (rp.scenarios && typeof rp.scenarios === 'object' ? rp.scenarios : {}) as Record<string, unknown>;
  const ea = (o.exit_assumptions && typeof o.exit_assumptions === 'object' ? o.exit_assumptions : {}) as Record<string, unknown>;
  const pm = (o.public_market_crosscheck && typeof o.public_market_crosscheck === 'object' ? o.public_market_crosscheck : {}) as Record<string, unknown>;

  return {
    valuation_basis: asStringArray(o.valuation_basis),
    entry_valuation: {
      pre_money: numOrNull(ev.pre_money),
      post_money: numOrNull(ev.post_money),
      ev: numOrNull(ev.ev),
      equity_value: numOrNull(ev.equity_value),
      per_share: numOrNull(ev.per_share),
      transaction_value: numOrNull(ev.transaction_value),
      currency: strOrNull(ev.currency),
    },
    ownership_and_dilution: {
      stake_pct: numOrNull(od.stake_pct),
      dilution: strOrNull(od.dilution),
      swap_or_raise_note: strOrNull(od.swap_or_raise_note),
    },
    return_profile: {
      irr: numOrNull(rp.irr),
      moic: numOrNull(rp.moic),
      payback: strOrNull(rp.payback),
      scenarios: {
        base: strOrNull(sc.base),
        upside: strOrNull(sc.upside),
        downside: strOrNull(sc.downside),
      },
    },
    exit_assumptions: { paths: normalizeExitPaths(ea.paths) },
    sensitivity: normalizeSensitivity(o.sensitivity),
    valuation_risks: normalizeRisks(o.valuation_risks),
    public_market_crosscheck: {
      applicable: pm.applicable === true,
      comps: normalizeComps(pm.comps),
      note: strOrNull(pm.note),
    },
  };
}

const VERDICTS: readonly DealVerdict[] = ['invest', 'pass', 'conditional'] as const;

function normalizeRecommendation(raw: unknown): DealRecommendation {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const verdict: DealVerdict = VERDICTS.includes(o.verdict as DealVerdict)
    ? (o.verdict as DealVerdict)
    : 'conditional';
  return {
    verdict,
    conditions: asStringArray(o.conditions),
    rationale: typeof o.rationale === 'string' ? o.rationale.trim() : '',
  };
}

/**
 * Normalize raw LLM JSON into a DealMemoDraft: forces the 8 sections, validates
 * the verdict enum (illegal → conditional), and structurally backfills all 8
 * valuation fields (values may be null; the structure is never absent).
 */
export function validateDealMemoDraft(raw: unknown): DealMemoDraft {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : '投资上会报告（草稿）',
    sections: normalizeSections(o.sections),
    recommendation: normalizeRecommendation(o.recommendation),
    valuation: normalizeValuation(o.valuation),
  };
}
