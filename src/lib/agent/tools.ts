import { callApi } from './data-client';

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
  { name: 'dcf', category: '估值',
    description: '组合式 DCF 估值：4 个现金流变体 + 每股区间 + 敏感性。可传 overrides 调假设。',
    inputSchema: {
      type: 'object',
      properties: { ticker: { type: 'string' }, overrides: { type: 'object', description: '可选假设覆盖：wacc/terminalG/forecastYears…' } },
      required: ['ticker'],
    },
    handler: (a, c) => callApi(c.origin, `/api/dcf/${enc(a.ticker)}`, {
      method: 'POST', body: JSON.stringify({ overrides: a.overrides ?? {} }) }) },
];

export const TOOLS_BY_NAME: Record<string, AgentTool> = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

/** Anthropic tool-use schema array. */
export const TOOL_DEFS = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
