/**
 * WP-A11 研究设置向导 — 题目定义。每题一屏：题目、灰色提示、一个范例。
 * 纯数据，页面只渲染；测试保证每题三要素齐全。
 * i18n 豁免：单用户本地研究工具，文案 zh 硬编码（与 thesis-form 一致）。
 */

export interface Question<Id extends string = string> {
  id: Id;
  prompt: string;
  hint: string;
  example: string;
}

export type CompanyQuestionId = 'select' | 'rationale' | 'keys' | 'names' | 'new_company' | 'review';
export type ThesisQuestionId =
  | 'title' | 'body' | 'opportunity_type' | 'companies' | 'pillars' | 'invalidation' | 'metrics_catalysts' | 'horizon';

export const COMPANY_QUESTIONS: readonly Question<CompanyQuestionId>[] = [
  { id: 'select', prompt: '从候选里勾选要进名单的公司（目标 12–15 家）',
    hint: '候选来自总纲 §13 的 21 家，已按 A 股 / 港股 / 美股分组；勾选后每家会再问一句理由。候选外的公司用底部的「添加候选外公司」。',
    example: '恒生电子、同花顺、Palantir…' },
  { id: 'rationale', prompt: '这家公司为什么进名单？',
    hint: '一句话（≤200 字）说清它与「金融证券 AI 应用」主题的关系：受益方式、份额或数据可得性。这句话会写进实体元数据，Wiki 公司页会引用。',
    example: '金融 IT 龙头，券商 AI 投顾前台改造直接受益，公告与财报披露充分。' },
  { id: 'keys', prompt: '你已经知道的实体键（都可以留空）',
    hint: 'LEI 20 位、统一社会信用代码 18 位、巨潮 orgId、SEC CIK。留空即标为缺失，稍后由 scripts/entity-keys 脚本从 GLEIF / SEC 补齐；填了会标注来源为你本人录入。',
    example: 'LEI 3003003LS77D1DRDDE25' },
  { id: 'names', prompt: '名称或别名需要纠正吗？（可选）',
    hint: '中文名、英文名、常用简称各占一行；留空表示沿用现有记录。采集器用这些名字做实体对齐。',
    example: '恒生电子\nHundsun Technologies\nHundsun' },
  { id: 'new_company', prompt: '添加候选外公司',
    hint: '需要中文名、英文名、主市场与主证券代码；上市日期不知道可留空（将记为今天并标注来源为你本人录入）。',
    example: '金证股份 / Kingdom Technology / A / 600446.SH / 2003-12-16' },
  { id: 'review', prompt: '确认名单',
    hint: '表格列出名称、市场、代码、缺失键与理由。目标 12–15 家，超出或不足只提醒不阻止。确认后写入权威表，entity_table_version 随之变化。',
    example: '13 家 · 2 家缺 CIK' },
];

export const THESIS_QUESTIONS: readonly Question<ThesisQuestionId>[] = [
  { id: 'title', prompt: '用一句话写出论点（≤120 字）',
    hint: '主语是公司或子行业，谓语是一个可被证实或证伪的变化，带时间范围。不要写「看好」「有潜力」这类无法判定的词。',
    example: '券商 IT 预算向 AI 投顾迁移，恒生电子 2026 下半年新签订单加速。' },
  { id: 'body', prompt: '核心逻辑：为什么会这样？',
    hint: '两到五句：驱动因素 → 传导路径 → 谁受益。写你相信的因果，不写结论重复。',
    example: '监管放开投顾试点后，头部券商把 IT 预算从合规系统转向 AI 投顾前台；恒生电子在券商核心系统份额最高，先拿到改造订单。' },
  { id: 'opportunity_type', prompt: '这是哪类机会？',
    hint: 'B · 业绩/事件驱动：有明确的财报或事件节点；C · 结构性变化：行业规则或需求结构改变，兑现更慢；其他。',
    example: 'C · 结构性变化' },
  { id: 'companies', prompt: '关联哪些名单内公司？（至少 1 家）',
    hint: '只列这条论点直接指向的公司；fan-out 会对每条公开材料 × 这里的公司做判断，关联越多噪音越大。',
    example: '恒生电子' },
  { id: 'pillars', prompt: '支柱：论点成立必须同时成立的 2–4 条陈述',
    hint: '每条三个小框：可验证的陈述 / 用什么数据判定 / 何时能看到（可选日期 YYYY-MM-DD）。判定方式必须是能查到的公开数据或公告。',
    example: '2026H2 新签订单同比 > 20% / 半年报订单披露 / 2026-09-30' },
  { id: 'invalidation', prompt: '失效条件：什么发生了这条论点就作废？（1–3 条）',
    hint: '句式「如果 ____ 发生，本 thesis 失效」。必须是可观察的事件或数据，不能是「市场不认可」。没有失效条件的 thesis 不允许存在。',
    example: '如果 2026 年内监管暂停 AI 投顾试点，本 thesis 失效。' },
  { id: 'metrics_catalysts', prompt: '观察指标（≥1）与催化剂（0–3 条）',
    hint: '观察指标是每周要看的数字或事件；催化剂是可能推动论点兑现的事件，写事件与预计日期。',
    example: '指标：新签订单同比；催化剂：证监会投顾试点扩容 / 2026-11-30' },
  { id: 'horizon', prompt: '观察窗口与下次复核',
    hint: '窗口默认 4 / 13 / 26 周（四臂 observation 按此结算）；下次复核默认 4 周后。',
    example: '4,13,26 · 2026-10-25' },
];
