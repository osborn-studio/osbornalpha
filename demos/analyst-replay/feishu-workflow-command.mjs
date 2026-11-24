import { inferCoreMarket, normalizeSecurityTicker } from '../../src/lib/securities/ticker.ts';
import { currencyCodeOfMarket } from '../../src/lib/utils.ts';
import { parseRegistration } from './registrations.mjs';
import { beijingInputValue } from './public/beijing-time.mjs';
import { detectNaturalProposal, extractNatural, nonActionableSuggestion } from './feishu-natural.mjs';

const actions = {buy:'买入', add:'加仓', hold:'持有', pass:'观望', trim:'减仓', sell:'卖出'};
const actionByLabel = Object.fromEntries(Object.entries(actions).map(([key,value]) => [value,key]));
const priceLabels = {reference_price:'参考价',target_price:'目标价',stop_loss:'止损价',price:'模拟成交价'};
// The authenticated sender supplies analyst_id. A recognized ticker supplies the market.
const required = {ticker:'标的代码',action:'建议动作'};
const aliases = {
  分析师:'analyst', 标的:'ticker', 股票代码:'ticker', 代码:'ticker', 市场:'market', 动作:'action', 建议:'action',
  参考价:'reference_price', 参考价格:'reference_price', 信心:'confidence', 置信度:'confidence', 理由:'rationale',
  目标:'target_price', 目标价:'target_price', 止损:'stop_loss', 止损价:'stop_loss', 止损价格:'stop_loss',
  期限:'horizon', 研究关联:'thesis_ref', 关联研究:'thesis_ref', 建议时间:'recommended_at',
  数量:'quantity', 股数:'quantity', 模拟成交价:'price', 成交价:'price', 手续费:'fee',
};
const knownFields = new Set(Object.values(aliases));
const horizonLabels = {short:'短期',mid:'中期',long:'长期','5d':'5日','10d':'10日'};
const currencyNames = {港元:'HKD',港币:'HKD',人民币:'CNY',美元:'USD',美金:'USD'};
const amountPattern = /^(\d+(?:\.\d+)?)\s*(港元|港币|人民币|美元|美金|元|HKD|USD|CNY)?$/i;
const prefix = /^\/?(?:建议|提案)(?:\s+|[|｜]|$)/;
const adviceOnlyCommand = /^(仅登记建议|只登记建议|只记建议|取消模拟成交)[。！! ]*$/;
const numericAdvice = new Set(['reference_price','target_price','stop_loss','confidence']);
const actionEvidence = {
  buy:/买|购|建|开仓|做多/,
  add:/仓|加|增|配|上调|往上|提高|抬/,
  sell:/卖|清|退出|出掉|离场/,
  trim:/减|降|下调|往下|少配|收回/,
  hold:/持|留|维持|不动|照旧|原样/,
  pass:/观望|暂缓|再看|等待|等等|不参与|不操作|先不动/,
};

function invalid(message) {
  throw Object.assign(new Error(message), {status:400});
}

export function proposalIntent(text, directedToBot = false) {
  return (/^\/?(?:建议|提案)\s*[|｜]/.test(text) || /^\/?(?:建议|提案)$/.test(text)) ||
    detectNaturalProposal(text,{directedToBot});
}

export function canInterpretWithAily(text) {
  return !/[|｜]/.test(text) && !adviceOnlyCommand.test(text) && !nonActionableSuggestion(text.normalize('NFKC'));
}

function interpretedFields(text, interpretation, options) {
  const comparable = value => value.normalize('NFKC').trim();
  const source = comparable(text);
  const field = key => {
    const result = interpretation.fields[key];
    if (!result || typeof result.evidence !== 'string') return null;
    const evidence = comparable(result.evidence);
    return evidence && source.includes(evidence) ? {...result,evidence} : null;
  };
  // Local recognition remains authoritative for explicit symbols, trade amounts and currency.
  const extracted = extractNatural(text,options);
  const action = field('action');
  if (action && Object.hasOwn(actions,action.value)) {
    const literal = extractNatural(action.evidence,options).action;
    if (literal === action.value || (!literal && !extracted.action && actionEvidence[action.value].test(action.evidence))) {
      extracted.action = action.value;
    }
  }
  for (const key of ['rationale','thesis_ref']) {
    const result = field(key);
    if (!extracted[key] && typeof result?.value === 'string' && result.value.trim() &&
        result.evidence.includes(comparable(result.value))) extracted[key] = result.value;
  }
  const localTicker = extracted.ticker;
  const security = field('ticker');
  if (!localTicker && security && typeof security.value === 'string') {
    const verified = extractNatural(security.evidence,options);
    const market = verified.market;
    if (market && verified.ticker === normalizeSecurityTicker(security.value,market)) {
      extracted.ticker = verified.ticker;
      extracted.market = market;
    } else if (verified.securityName) extracted.securityName = verified.securityName;
  }
  for (const key of numericAdvice) {
    const result = field(key);
    if (extracted[key] != null || !Number.isFinite(result?.value)) continue;
    const verified = extractNatural(result.evidence,options);
    if (verified[key] === result.value) {
      extracted[key] = result.value;
      if (verified.currency && extracted.currency && verified.currency !== extracted.currency) invalid('金额币种不一致，请核对。');
      extracted.currency ??= verified.currency;
    }
  }
  return extracted;
}

function amountFields(key, text) {
  const match = amountPattern.exec(text);
  if (!match) invalid('请给出明确的' + (priceLabels[key] ?? '手续费') + '和币种。');
  const unit = match[2];
  return {[key]:Number(match[1]), ...(unit && unit !== '元' && {currency:currencyNames[unit] ?? unit.toUpperCase()})};
}

// Preserve the older pipe-delimited submissions, including numeric units and optional empty slots.
function structuredFields(command) {
  const fields = {};
  const add = (key,value) => {
    if (Object.hasOwn(fields,key)) {
      if (key === 'currency' && fields[key] === value) return;
      invalid(key === 'currency' ? '一条建议中出现了不同币种，请核对。' : '建议中有重复的字段，请明确保留哪一个值。');
    }
    fields[key] = value;
  };
  for (const part of command.replace(prefix,'').split(/[|｜]/).map(item => item.trim()).filter(Boolean)) {
    let key, value;
    const pair = /^([a-z_]+|[\p{Script=Han}]+)\s*[：:]\s*([\s\S]*)$/iu.exec(part);
    if (pair) {
      key = Object.hasOwn(aliases,pair[1]) ? aliases[pair[1]] : pair[1].toLowerCase();
      if (!knownFields.has(key)) invalid('无法识别字段「' + pair[1] + '」，请用日常表达描述这条建议。');
      value = pair[2].trim();
      if (!value) continue;
    } else if (Object.hasOwn(actionByLabel,part) || Object.hasOwn(actions,part.toLowerCase())) {
      key = 'action'; value = part;
    } else if (/^\d+(?:\.\d+)?\s*股$/.test(part)) {
      key = 'quantity'; value = part;
    } else if (/^[a-z\d.-]{1,20}$/i.test(part)) {
      key = 'ticker'; value = part;
    } else {
      // A message can mix labeled fields with conversational clauses.
      const extracted = extractNatural(part,{market:fields.market ?? (fields.ticker && inferCoreMarket(fields.ticker))});
      if (!Object.keys(extracted).length) invalid('无法确认「' + part + '」的含义，请写明希望登记的内容。');
      for (const [field,val] of Object.entries(extracted)) add(field,val);
      continue;
    }
    if (Object.hasOwn(priceLabels,key) || key === 'fee') {
      for (const [field,val] of Object.entries(amountFields(key,value))) add(field,val);
    } else if (key === 'quantity' || key === 'confidence') {
      const numeric = (key === 'quantity' ? /^(\d+(?:\.\d+)?)\s*股?$/ : /^(\d+)\s*%?$/).exec(value);
      if (!numeric) invalid(key === 'quantity' ? '请写明模拟成交股数。' : '信心须为 0 至 100 的整数。');
      add(key,Number(numeric[1]));
    } else if (key === 'action') {
      add(key,actionByLabel[value] ?? value.toLowerCase());
    } else if (key === 'horizon') {
      add(key,Object.keys(horizonLabels).find(k => horizonLabels[k] === value) ?? value);
    } else add(key,key === 'market' ? value.toUpperCase() : value);
  }
  return fields;
}

function missingFields(fields) {
  const missing = Object.keys(required).filter(key => fields[key] == null);
  if (['quantity','fee','price'].some(key => fields[key] != null)) {
    if (fields.price == null) missing.push('price');
    if (fields.quantity == null) missing.push('quantity');
  }
  return missing;
}

function validateFields(fields, signatures) {
  if (fields.analyst != null && !signatures.includes(fields.analyst)) invalid('提案署名与此飞书成员绑定的分析师不一致。');
  if (fields.action != null && !Object.hasOwn(actions,fields.action)) invalid('请明确建议动作，如买入、加仓、减仓、卖出、持有或观望。');
  if (fields.market != null && !['A','HK','US'].includes(fields.market)) invalid('请明确市场为 A 股、港股或美股。');
  if (fields.ticker != null) {
    const market = inferCoreMarket(fields.ticker);
    if (!market || (fields.market && fields.market !== market) || !normalizeSecurityTicker(fields.ticker,market)) {
      invalid('标的代码与市场不匹配，请写明交易所代码，例如 00700.HK。');
    }
    fields.market = market;
  }
  if (fields.currency && fields.market && fields.currency !== currencyCodeOfMarket(fields.market)) invalid('金额币种与标的市场不一致。');
  for (const [key,label] of Object.entries(priceLabels)) {
    if (fields[key] != null && (!Number.isFinite(fields[key]) || fields[key] <= 0)) invalid(label + '须为大于 0 的明确价格。');
  }
  if (fields.quantity != null && (!Number.isFinite(fields.quantity) || fields.quantity <= 0)) invalid('模拟成交股数须大于 0。');
  if (fields.fee != null && (!Number.isFinite(fields.fee) || fields.fee < 0)) invalid('手续费须为不小于 0 的金额。');
  if (fields.confidence != null && (!Number.isInteger(fields.confidence) || fields.confidence < 0 || fields.confidence > 100)) invalid('信心须为 0 至 100 的整数。');
  if (fields.horizon != null && !Object.hasOwn(horizonLabels,fields.horizon)) invalid('请明确建议期限，例如 5 日、10 日、短期、中期或长期。');
  if (['hold','pass'].includes(fields.action) && ['quantity','price','fee'].some(key => fields[key] != null)) invalid('持有和观望提案不能附带模拟成交。');
}

export function evaluateProposal(role, analystName, command, receivedAt, analystAliases = [], priorFields = {}, interpretation) {
  const text = command.trim();
  const adviceOnly = /(?:仅|只)(?:登记|记录|提交|录入|记|录)(?:分析)?建议|(?:不做|不录入|不登记|取消)(?:模拟)?成交/.test(text);
  const pending = missingFields(priorFields);
  let update;
  if (adviceOnlyCommand.test(text)) {
    update = {};
  } else if (pending.length === 1 && Object.hasOwn(priceLabels,pending[0]) && amountPattern.test(text)) {
    update = amountFields(pending[0],text);
  } else if (pending.length === 1 && pending[0] === 'quantity' && /^\d+(?:\.\d+)?\s*股?$/.test(text)) {
    update = {quantity:Number.parseFloat(text)};
  } else {
    const options = {market:priorFields.market,securityName:priorFields.securityName,receivedAt};
    update = /[|｜]/.test(text) ? structuredFields(text) : interpretation ?
      interpretedFields(text,interpretation,options) : extractNatural(text,options);
  }
  if (priorFields.currency && update.currency && priorFields.currency !== update.currency) invalid('补充价格的币种与原提案不同，请核对。');
  const fields = {...priorFields,...update};
  if (adviceOnly) {
    delete fields.price;
    delete fields.quantity;
    delete fields.fee;
  }
  validateFields(fields,[role,analystName,...analystAliases]);
  const missing = missingFields(fields).map(key =>
    key === 'ticker' && fields.securityName && !fields.market ? '交易市场或标的代码' :
      required[key] ?? priceLabels[key] ?? '模拟成交股数');
  if (missing.length) return {fields,missing,body:null};

  const {analyst,currency,securityName,quantity,fee,price,...input} = fields;
  const parsed = parseRegistration(role,{...input,confidence:input.confidence ?? 70,recommended_at:input.recommended_at ?? receivedAt});
  if (Date.parse(parsed.recommended_at) > Date.parse(receivedAt)) invalid('建议时间不得晚于原提案的飞书发送时间。');
  const {analyst_id,role:ignoredRole,source_type,...recommendation} = parsed;
  const simulation = quantity == null ? null : {
    direction:['buy','add'].includes(input.action) ? 'buy' : 'sell',price,quantity,fee:fee ?? 0,
  };
  return {fields,missing,body:{recommendation,simulation,defaultConfidence:input.confidence == null}};
}

export function summary({recommendation:rec,simulation,defaultConfidence}, id, analystName, accountId) {
  const currency = currencyCodeOfMarket(rec.market);
  const trade = simulation && `${simulation.direction === 'buy' ? '买入' : '卖出'} ${simulation.quantity} 股 × ${simulation.price} ${currency}，手续费 ${simulation.fee}`;
  const prices = ['reference_price','target_price','stop_loss']
    .filter(key => rec[key] != null)
    .map(key => priceLabels[key] + ' ' + rec[key]);
  return [
    `待确认提案 ${id}`,
    `分析师 ${analystName}`,
    `${rec.ticker} · ${rec.market} · ${actions[rec.action]}`,
    `建议时间 ${beijingInputValue(rec.recommended_at).replace('T',' ')}（北京时间）`,
    ...(prices.length ? [prices.join('｜') + '（' + currency + '）'] : []),
    `信心 ${rec.confidence}%${defaultConfidence ? '（表单默认）' : ''}`,
    ...(rec.horizon ? ['期限 ' + (horizonLabels[rec.horizon] ?? rec.horizon)] : []),
    ...(rec.rationale ? ['建议理由 ' + rec.rationale] : []),
    ...(rec.thesis_ref ? ['关联研究 ' + rec.thesis_ref] : []),
    trade ? `正式系统模拟成交申请 ${trade}` : '仅登记建议',
    accountId ? `正式模拟账户尾号 ${accountId.slice(-6)}` : '尚未绑定正式模拟账户。确认后可登记 Demo 建议。',
    '已授权的审批人请直接回复这条摘要「同意」。',
  ].join('\n');
}
