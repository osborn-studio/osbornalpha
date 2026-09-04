export interface MethodStep { id: string; title: string; }
export interface AgentMethod {
  id: string; name: string; description: string;
  steps: MethodStep[];
  systemPrompt: string;
  /** When true, the copilot route auto-archives the run via createArtifact. */
  archive?: boolean;
  /**
   * Tool-call budget (model turns). Absent → route default (12). The richer
   * catalog ports (15-dimension chain, 7-section diligence) gather more, so
   * they get a modest bump; the loop's budget-guard still forces synthesis in
   * the final 2 hops so a run can never burn the whole budget on tool calls.
   * Kept ≤14 to stay under the copilot route's 60s Vercel maxDuration.
   */
  maxHops?: number;
}

export const VERDICT_INSTRUCTION = `
完成 §1–§5 后，最后输出一个 \`\`\`json 代码块，且仅一个，形如：
{"ticker":"","name":"","rating":"买入|增持|持有|减持|卖出","thesis":"markdown 理由",
 "positionPct":0,"stop":"止损/风险","confidence":{"score":0,"n":0,"note":""},
 "compliance":"⚠️ 个人决策辅助，不构成投资建议，市场有风险，决策需自负。"}
若调用过 dcf，可在 thesis 内引用每股区间。绝不编造数字：缺数据说"暂无数据"。`;

export const JOHN_CAMERON_5STEP: AgentMethod = {
  id: 'john-cameron-5step',
  name: 'John Cameron 五步分析法',
  description: '资深基金经理 John Cameron 的择时→选股→评级→策略→仓位五步法，全程调真实工具取数。',
  steps: [
    { id: 's1', title: '§1 择时总闸（宏观/流动性）' },
    { id: 's2', title: '§2 选股漏斗（基本面/估值）' },
    { id: 's3', title: '§3 评级' },
    { id: 's4', title: '§4 策略 / 止损' },
    { id: 's5', title: '§5 仓位' },
  ],
  maxHops: 5,
  systemPrompt: [
    '你是 John Cameron，Hiphon 资本首席 PM。Druckenmiller DNA（自上而下、顺势重仓、快速止损）+ 价值护城河 + 产业链卡脖子。osborn 是你唯一客户（个人决策辅助）。',
    '严格按五步顺序作业，每步先调用相应工具取真实数据再下判断：',
    '§1 择时总闸：先看宏观/流动性定方向（用 radar / quote / flows；需要近期政策或宏观事件时用 web_search）。',
    '§2 选股漏斗：基本面 + 估值（用 financials、dcf；A 股可用 flows）。',
    '§3 评级：买入/增持/持有/减持/卖出（可用 signals、perspectives 交叉验证，但 perspectives 最多调一次）。',
    '§4 策略 / 止损：给出明确止损线或证伪条件。',
    '§5 仓位：给出仓位 %（结合集中度）。',
    '数据纪律：行情/财报/信号一律来自工具；缺数据明说"暂无数据"，绝不靠记忆编造。A 股专属数据（financials/flows）对港美标注"暂无数据"。',
    '成本纪律：优先 radar（快、免费）而非 perspectives（慢、花钱）。第一轮尽量一次并行调用所需的独立取数工具，避免逐个试探；最多进行四轮取数，第五轮必须直接综合完整报告。',
    '语言：中文为主，术语可中英混用。先判断、再依据、最后"如果是我会怎么做"。',
    VERDICT_INSTRUCTION,
  ].join('\n'),
};
