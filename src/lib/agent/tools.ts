import { callApi } from './data-client';
import { createDecision, getPortfolio, listDecisions } from '@/lib/portfolio/store';
import { parseDecisionInput } from '@/lib/portfolio/validate';
import { classifyMarket } from '@/lib/utils';
import { createArtifact } from '@/lib/portfolio/artifacts-store';

export interface ToolCtx { origin: string; }
export interface AgentTool {
  name: string;
  description: string;
  category: '行情' | '研究' | '估值' | '资金';
  inputSchema: Record<string, unknown>;
  aShareOnly?: boolean;
  handler: (args: any, ctx: ToolCtx) => Promise<unknown>;
}

const tickerSchema = {
  type: 'object',
  properties: { ticker: { type: 'string', description: '如 00700.HK / 600519.SH / NVDA' } },
  required: ['ticker'],
} as const;

const enc = encodeURIComponent;

export const TOOLS: AgentTool[] = [
  { name: 'search', category: '行情',
    description: '按名称或代码解析股票 → ticker。当 ticker 不确定时先调用。',
    inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
    handler: (a, c) => callApi(c.origin, `/api/search?q=${enc(a.q)}`) },
  { name: 'quote', category: '行情',
    description: '实时行情：价格、涨跌幅、PE/PB。A/HK/US。',
    inputSchema: tickerSchema,
    handler: (a, c) => callApi(c.origin, `/api/quote/${enc(a.ticker)}`) },
  { name: 'radar', category: '研究',
    description: '个股雷达（行情+资金+信号，无 LLM，最快）。优先用它而非 perspectives。A/HK/US。',
    inputSchema: tickerSchema,
    handler: (a, c) => callApi(c.origin, `/api/radar/${enc(a.ticker)}`) },
  { name: 'signals', category: '研究',
    description: '技术信号 + 回测命中率：triggers[]、bias、hit_rate_5d。A/HK/US。',
    inputSchema: tickerSchema,
    handler: (a, c) => callApi(c.origin, `/api/signals/${enc(a.ticker)}`) },
  { name: 'financials', category: '研究', aShareOnly: true,
    description: '5 年财务：ROE/利润率/现金流/负债。仅 A 股。',
    inputSchema: tickerSchema,
    handler: (a, c) => callApi(c.origin, `/api/financials/${enc(a.ticker)}`) },
  { name: 'flows', category: '资金', aShareOnly: true,
    description: '资金流：北向持股、涨跌停。仅 A 股。',
    inputSchema: tickerSchema,
    handler: (a, c) => callApi(c.origin, `/api/flows/${enc(a.ticker)}`) },
  { name: 'perspectives', category: '研究',
    description: 'AI 9 视角（股神镜头）。慢 + 花 token，只在需要多空辩论时调用一次。A/HK/US。',
    inputSchema: tickerSchema,
    handler: (a, c) => callApi(c.origin, `/api/perspectives/${enc(a.ticker)}`) },
  { name: 'holders', category: '研究', aShareOnly: true,
    description: '股东 / 机构持仓变动。仅 A 股。',
    inputSchema: tickerSchema,
    handler: (a, c) => callApi(c.origin, `/api/holders/${enc(a.ticker)}`) },
  { name: 'calendar', category: '研究', aShareOnly: true,
    description: '事件日历：财报日、分红、解禁等。仅 A 股。',
    inputSchema: tickerSchema,
    handler: (a, c) => callApi(c.origin, `/api/calendar/${enc(a.ticker)}`) },
  { name: 'kline', category: '行情',
    description: 'K 线历史（价格序列），用于技术面/趋势判断。A/HK/US。',
    inputSchema: tickerSchema,
    handler: (a, c) => callApi(c.origin, `/api/kline/${enc(a.ticker)}`) },
  { name: 'dcf', category: '估值',
    description: '组合式 DCF 估值：4 个现金流变体 + 每股区间 + 敏感性。可传 overrides 调假设。',
    inputSchema: {
      type: 'object',
      properties: { ticker: { type: 'string' }, overrides: { type: 'object', description: '可选假设覆盖：wacc/terminalG/forecastYears…' } },
      required: ['ticker'],
    },
    handler: (a, c) => callApi(c.origin, `/api/dcf/${enc(a.ticker)}`, {
      method: 'POST', body: JSON.stringify({ overrides: a.overrides ?? {} }) }) },
  { name: 'record_decision', category: '研究',
    description: '把一次买卖判断写入决策记录，用于归因复盘。须先向用户口头确认再调用——不要在用户未明确同意前记录。',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: '如 00700.HK / 600519.SH / NVDA' },
        action: { type: 'string', enum: ['buy', 'sell', 'trim', 'add', 'hold', 'pass'] },
        thesis: { type: 'string', description: '决策理由' },
        confidence: { type: 'number', description: '置信度 0-100' },
        target_price: { type: 'number' },
        stop_loss: { type: 'number' },
      },
      required: ['ticker', 'action', 'thesis'],
    },
    handler: async (a) => {
      const parsed = parseDecisionInput({
        ticker: a.ticker,
        market: classifyMarket(a.ticker),
        action: a.action,
        thesis: a.thesis,
        confidence: a.confidence,
        target_price: a.target_price,
        stop_loss: a.stop_loss,
        source_type: 'copilot',
      });
      if (!parsed.ok) return { error: parsed.error };
      const decision = await createDecision(parsed.value);
      return { ok: true, decision_id: decision.id, summary: `${decision.ticker} ${decision.action} 已记录` };
    } },
  { name: 'get_portfolio', category: '研究',
    description: '查看当前持仓与未平仓决策，用于判断集中度/是否已持仓。',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const [{ positions, totals }, openDecisions] = await Promise.all([
        getPortfolio(),
        listDecisions({ status: 'open' }),
      ]);
      return {
        positions: positions.map((p) => ({ ticker: p.ticker, shares: p.shares, avg_cost: p.avg_cost, realized_pnl: p.realized_pnl })),
        open_decisions: openDecisions.map((d) => ({ ticker: d.ticker, action: d.action, target_price: d.target_price, stop_loss: d.stop_loss, confidence: d.confidence })),
        totals,
      };
    } },
  { name: 'save_artifact', category: '研究',
    description: '把一份完成的长报告（如深度研究）存档，供后续在「我的研究档案」查阅。长报告完成后调用存档。',
    inputSchema: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: '产出该报告的方法/技能 id' },
        title: { type: 'string' },
        content_md: { type: 'string', description: '报告正文（markdown）' },
        ticker: { type: 'string' },
      },
      required: ['skill_id', 'title', 'content_md'],
    },
    handler: async (a) => {
      const artifact = await createArtifact({
        skill_id: a.skill_id, title: a.title, content_md: a.content_md, ticker: a.ticker ?? null,
      });
      return { ok: true, artifact_id: artifact.id };
    } },
];

export const TOOLS_BY_NAME: Record<string, AgentTool> = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

/** Anthropic tool-use schema array. */
export const TOOL_DEFS = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

/** OpenAI function-calling schema array (for the openai-compat toolChat path). */
export const OPENAI_TOOL_DEFS = TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema }));
