import { inferCoreMarket } from '../../src/lib/securities/ticker.ts';
import { currencyCodeOfMarket } from '../../src/lib/utils.ts';
import { parseRegistration } from './registrations.mjs';

const actions = {buy:'买入', add:'加仓', hold:'持有', pass:'观望', trim:'减仓', sell:'卖出'};
const actionByLabel = Object.fromEntries(Object.entries(actions).map(([key,value]) => [value,key]));
const keys = new Set([
  'analyst','ticker','market','action','reference_price','confidence','rationale','target_price','stop_loss',
  'horizon','thesis_ref','recommended_at','simulation',
]);
const aliases = {
  分析师:'analyst', 标的:'ticker', 代码:'ticker', 市场:'market', 动作:'action', 建议:'action',
  参考价:'reference_price', 置信度:'confidence', 理由:'rationale', 目标价:'target_price', 止损价:'stop_loss',
  期限:'horizon', 研究关联:'thesis_ref', 建议时间:'recommended_at', 数量:'quantity', 模拟成交价:'price', 手续费:'fee',
};
const currency = {港元:'HKD',港币:'HKD',人民币:'CNY',元:'CNY',美元:'USD',美金:'USD'};
const simulationKeys = new Set(['price','quantity','fee']);
const humanExample = '请按此格式提交：建议｜分析师：张三｜01810.HK｜加仓｜1000股｜模拟成交价：40.20港元｜理由：填写你的理由。仅登记建议时可省略数量和成交价。';
export const proposalCommand = /^\/?(?:建议|提案)(?:\s|[|｜]|$)/;

function invalid(message = humanExample) {
  throw Object.assign(new Error(message), {status:400});
}

function amount(raw, units = '') {
  const pattern = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(${units})?$`, 'i');
  const match = pattern.exec(raw);
  if (!match || !Number.isFinite(Number(match[1]))) invalid('数字格式无法确认，请检查数量、成交价、费用或置信度。');
  return {number:Number(match[1]), unit:match[2] || null};
}

function fromHuman(text) {
  const parts = text.split(/[|｜]/).map(part => part.trim());
  if (!parts.length || parts.some(part => !part)) invalid();
  const input = Object.create(null);
  const seen = new Set();
  const set = (key, value) => {
    if (!key || seen.has(key)) invalid('建议中有无法识别或重复的字段。' + humanExample);
    seen.add(key);
    input[key] = value;
  };
  for (const part of parts) {
    const pair = /^([a-z_]+|[\u4e00-\u9fff]+)\s*[：:]\s*([\s\S]+)$/i.exec(part);
    if (pair) {
      const label = pair[1].toLowerCase();
      const key = Object.hasOwn(aliases,label) ? aliases[label] : label;
      if (!keys.has(key) && !simulationKeys.has(key)) invalid();
      set(key,pair[2].trim());
    } else if (Object.hasOwn(actionByLabel,part) || Object.hasOwn(actions,part.toLowerCase())) {
      set('action',part);
    } else if (/^\d+(?:\.\d+)?\s*股$/.test(part)) {
      set('quantity',part);
    } else if (/^[a-z0-9.-]{1,20}$/i.test(part)) {
      set('ticker',part);
    } else invalid();
  }
  const market = input.market?.toUpperCase() || (input.ticker ? inferCoreMarket(input.ticker) : null);
  if (!['A','HK','US'].includes(market)) invalid('请填写可识别的市场和标的，例如 01810.HK、600519.SH 或 NVDA。');
  const tickerMarket = input.ticker && inferCoreMarket(input.ticker);
  // Qualified Chinese or Hong Kong tickers must match an explicitly supplied market.
  if (input.market && /\.(?:HK|SH|SZ|BJ)$/i.test(input.ticker ?? '') && tickerMarket !== market) {
    invalid('标的代码与市场不一致。');
  }
  const {price, quantity, fee, ...recommendation} = input;
  const unitPattern = 'HKD|USD|CNY|港元|港币|人民币|美元|美金|元';
  const money = value => {
    if (value == null) return undefined;
    const parsed = amount(value,unitPattern);
    if (parsed.unit) {
      const code = Object.hasOwn(currency,parsed.unit) ? currency[parsed.unit] : parsed.unit.toUpperCase();
      if (code !== currencyCodeOfMarket(market)) invalid('金额币种与标的市场不一致。');
    }
    return parsed.number;
  };
  const simulation = price == null && quantity == null && fee == null ? null :
    {price:money(price), quantity:quantity == null ? undefined : amount(quantity,'股').number, fee:money(fee)};
  if (recommendation.horizon === '5日') recommendation.horizon = '5d';
  if (recommendation.horizon === '10日') recommendation.horizon = '10d';
  return {...recommendation, market, simulation,
    action:actionByLabel[recommendation.action] ?? recommendation.action?.toLowerCase(),
    confidence:recommendation.confidence == null ? undefined : amount(recommendation.confidence,'%').number,
    reference_price:money(recommendation.reference_price), target_price:money(recommendation.target_price),
    stop_loss:money(recommendation.stop_loss),
  };
}

export function readProposal(role, analystName, command, receivedAt, analystAliases = []) {
  const body = command.replace(/^\/?(?:建议|提案)\s*[|｜]?\s*/, '');
  const value = fromHuman(body);
  if (!value.rationale?.trim()) invalid();

  const {analyst, simulation:request = null, ...input} = value;
  if (analyst != null && ![analystName,role,...analystAliases].includes(analyst)) {
    invalid('提案署名与此飞书成员绑定的分析师不一致。');
  }
  if (input.horizon != null && !['5d','10d','short','mid','long'].includes(input.horizon)) {
    invalid('建议期限须为 5d、10d、short、mid 或 long。');
  }
  const parsed = parseRegistration(role, {...input,recommended_at:input.recommended_at ?? receivedAt});
  if (parsed.recommended_at > receivedAt) invalid('建议时间不得晚于飞书消息发送时间。');
  const {analyst_id:analystId,role:ignoredRole,source_type:sourceType,...recommendation} = parsed;
  if (request === null) return {recommendation, simulation:null};
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      Object.keys(request).some(key => !simulationKeys.has(key)) ||
      !Number.isFinite(request.price) || request.price <= 0 ||
      !Number.isFinite(request.quantity) || request.quantity <= 0 ||
      (request.fee != null && (!Number.isFinite(request.fee) || request.fee < 0))) {
    invalid('模拟成交需要正数价格和数量，手续费可选且不得为负。');
  }
  const direction = ['buy','add'].includes(recommendation.action) ? 'buy' :
    ['sell','trim'].includes(recommendation.action) ? 'sell' : null;
  if (!direction) invalid('持有和观望提案不能附带模拟成交。');
  return {recommendation,simulation:{direction,price:request.price,quantity:request.quantity,fee:request.fee ?? 0}};
}

export function summary({recommendation:rec,simulation}, id, analystName, accountId) {
  const trade = simulation && `${simulation.direction === 'buy' ? '买入' : '卖出'} ${simulation.quantity} 股 × ${simulation.price} ${currencyCodeOfMarket(rec.market)}，手续费 ${simulation.fee}`;
  const details = {reference_price:'参考价',target_price:'目标价',stop_loss:'止损价',confidence:'置信度',horizon:'期限',thesis_ref:'研究关联'};
  return [
    `待确认提案 ${id}`,
    `分析师 ${analystName}`,
    `${rec.ticker} · ${rec.market} · ${actions[rec.action]}`,
    `建议时间 ${rec.recommended_at}`,
    ...Object.entries(details).filter(([key]) => rec[key] != null).map(([key,label]) => `${label} ${rec[key]}`),
    `建议理由 ${rec.rationale}`,
    trade ? `正式系统模拟成交申请 ${trade}` : '仅登记建议',
    accountId ? `正式模拟账户尾号 ${accountId.slice(-6)}` : '尚未绑定正式模拟账户。确认后可登记 Demo 建议。',
    '已授权的审批人请直接回复这条摘要「同意」。',
  ].join('\n');
}
