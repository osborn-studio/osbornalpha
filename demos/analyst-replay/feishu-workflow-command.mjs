import { inferCoreMarket, normalizeSecurityTicker } from '../../src/lib/securities/ticker.ts';
import { currencyCodeOfMarket } from '../../src/lib/utils.ts';
import { parseRegistration } from './registrations.mjs';
import { beijingInputValue } from './public/beijing-time.mjs';
import { extractNatural, nonActionableSuggestion, resolveModelSecurity, resolveNamedSecurity, validateModelDate, withoutCompletedTradeNotes } from './feishu-natural.mjs';

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
const actionEvidence = {
  buy:/买|购入|建仓|开仓|做多/,
  add:/加仓|增持|补仓|加码|增配|多配|(?:仓位|持仓|头寸|配置|占比|权重)(?:再|稍微|稍作|小幅)?(?:往上调|上调|调高|提高|抬高|抬一点)/,
  sell:/卖|清仓|退出持仓|出掉|离场/,
  trim:/减仓|减持|减配|少配|挪出(?:去)?(?:一半|部分)|(?:仓位|持仓|头寸|配置|占比|权重)(?:再|稍微|稍作|小幅)?(?:往下调|下调|调低|降低)/,
  hold:/持|留|维持|不动|照旧|原样/,
  pass:/观望|暂缓|再看|等待|等等|不参与|不操作|先不动/,
};
const excludedActionContext = /(?:不(?:要|再|想|建议|打算|计划|准备|应|会|可|能)|别|禁止|避免|取消|尚未|没有|早已|已经|曾经)[^，,。.!！?？;；\n]{0,24}$/;
const marketEvidence = {
  A:/(?:A股|沪市|深市|北交所|上交所|深交所|^A$)/i,
  HK:/(?:港股|港交所|香港|H股|^HK$)/i,
  US:/(?:美股|纳斯达克|纽交所|NASDAQ|NYSE|^US$)/i,
};
const horizonEvidence = {
  short:/短期|短线/,
  mid:/中期|中线/,
  long:/长期|长线/,
  '5d':/(?:^|[^\d])(?:5|五)\s*(?:个\s*)?(?:交易日|日|天)/,
  '10d':/(?:^|[^\d])(?:10|十)\s*(?:个\s*)?(?:交易日|日|天)/,
};
const decimalLiteral = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
const currencyLiteral = String.raw`港元|港币|人民币|美元|美金|HKD|USD|CNY|RMB|HK\$|US\$|¥|\$|元`;
const numericAmount = `(?<prefix>${currencyLiteral})?\\s*(?<number>${decimalLiteral})\\s*(?<unit>${currencyLiteral})?`;
const amountEvidence = {
  reference_price:'参考(?:价格|价位|价)?|现价|当前(?:价格|价)|基准价|入场(?:价格|价位|价)|建议价',
  target_price:'目标(?:价格|价位|位|价)?|止盈(?:价格|价位|位|点|价)?|(?:预计|预期|看好)(?:会)?(?:上涨|涨|升|下跌|跌)(?:到|至)|看高到|看到',
  stop_loss:'止损(?:价格|价位|点位|位|点|线|价)?',
  fee:'手续费',
  price:'(?:模拟)?成交(?:价格|均价|单价|价位|价)|模拟(?:买价|卖价|价格|价)|每股成交(?:价格|价)',
};
const amountJoin = String.raw`\s*(?:(?:调整为|调整到|放在|设在|设为|定在|定为|约为|大约|大概|每股|按|以|用|为|是|在|到|约|[:=])\s*)*`;
const unsupportedAmountSuffix = /^\s*(?:[.．]\d|[-–—~～至到]\s*\d|万|亿|[%股手])/u;
const plainAmountEvidence = new RegExp('^'+numericAmount+'$','i');
const startsWithAmount = new RegExp(`^(?:(?:${currencyLiteral})\\s*)?\\d`,'i');
const currencySuffix = new RegExp(`^\\s*(?:${currencyLiteral})`,'i');
const shareEvidence = new RegExp('(?<![\\d\\w.\\-−~～])('+decimalLiteral+')\\s*(万)?\\s*(?:股(?!票)|shares?\\b)','gi');
const plainShareEvidence = new RegExp('^'+decimalLiteral+'$');

function invalid(message) {
  throw Object.assign(new Error(message), {status:400});
}

export function isAdviceOnlyCommand(text) {
  return adviceOnlyCommand.test(text.trim());
}

function moneyEvidence(key, evidence, allowPlain, allowCurrentPrice) {
  const amountAfterLabel = new RegExp(`(?:${amountEvidence[key]})${amountJoin}${numericAmount}`,'gi');
  const amountBeforeLabel = {
    stop_loss:new RegExp(`(?:跌破|低于|下破|上破|超过)\\s*${numericAmount}\\s*(?:则|就|时|后|立即)?\\s*止损`, 'gi'),
    price:new RegExp(`模拟(?:交易|成交)?(?:按|以|用)${amountJoin}${numericAmount}(?=\\s*(?:买入|买进|卖出|成交))`, 'gi'),
  }[key];
  const matches = [...evidence.matchAll(amountAfterLabel), ...(amountBeforeLabel ? evidence.matchAll(amountBeforeLabel) : [])];
  if (!matches.length && allowCurrentPrice) {
    matches.push(...evidence.matchAll(new RegExp(`每股\\s*${numericAmount}`, 'gi')));
  }
  if (!matches.length && allowPlain) {
    const plain = plainAmountEvidence.exec(evidence);
    if (plain) matches.push(plain);
  }
  let result;
  for (const match of matches) {
    if (unsupportedAmountSuffix.test(evidence.slice(match.index+match[0].length))) continue;
    const {number,prefix,unit} = match.groups;
    const normalizeUnit = raw => raw === '元' || raw === '$' || !raw ? undefined :
      currencyNames[raw] ?? ({RMB:'CNY','HK$':'HKD','US$':'USD','¥':'CNY'}[raw.toUpperCase()] ?? raw.toUpperCase());
    const quotedCurrency = normalizeUnit(prefix);
    const pricedCurrency = normalizeUnit(unit);
    if (quotedCurrency && pricedCurrency && quotedCurrency !== pricedCurrency) invalid('金额币种不一致，请核对。');
    const currency = pricedCurrency ?? quotedCurrency;
    const amount = Number(number.replaceAll(',',''));
    if (result && (result.amount !== amount || result.currency !== currency)) return null;
    result = {amount,currency};
  }
  return result;
}

function quotedShareCount(evidence, allowPlain) {
  if (allowPlain && plainShareEvidence.test(evidence)) return Number(evidence.replaceAll(',',''));
  if (/\d\s*(?:-|–|—|至|到|~|～)\s*\d/.test(evidence)) return null;
  const values = mentionedShareCounts(evidence);
  return values.size === 1 ? [...values][0] : null;
}

function mentionedShareCounts(text) {
  return new Set([...text.matchAll(shareEvidence)].map(([,number,wan])=>Number(number.replaceAll(',',''))*(wan?10000:1)));
}

const comparable = value => value.normalize('NFKC').trim();

function boundedNumericEvidence(source, evidence, includeCurrency = false) {
  // Reject a model quote that clips a sign, decimal digit, scale suffix or range endpoint.
  for (let index = source.indexOf(evidence); index !== -1; index = source.indexOf(evidence,index+1)) {
    const before = source.slice(0,index);
    const after = source.slice(index+evidence.length);
    if (startsWithAmount.test(evidence) && /(?:[\d.]|[-+−–—~～]\s*|\d+\s*(?:至|到)\s*)$/.test(before)) continue;
    if (/\d$/.test(evidence) && /^\d/.test(after)) continue;
    if (unsupportedAmountSuffix.test(after)) continue;
    const currency = includeCurrency && /\d$/.test(evidence) ? currencySuffix.exec(after)?.[0] ?? '' : '';
    if (currency && unsupportedAmountSuffix.test(after.slice(currency.length))) continue;
    return evidence + currency;
  }
  return null;
}

function supportsModelAction(source, evidence, action) {
  const match = actionEvidence[action].exec(evidence);
  if (!match) return false;
  for (let index = source.indexOf(evidence); index !== -1; index = source.indexOf(evidence, index + evidence.length)) {
    if (!excludedActionContext.test(source.slice(0,index + match.index))) return true;
  }
  return false;
}

function interpretedFields(text, interpretation, priorFields, receivedAt) {
  if (interpretation.intent !== 'proposal') return {};
  const source = withoutCompletedTradeNotes(comparable(text));
  if (nonActionableSuggestion(source)) return {};
  const field = key => {
    const result = interpretation.fields?.[key];
    if (!result || typeof result.evidence !== 'string') return null;
    const evidence = comparable(result.evidence);
    return evidence && source.includes(evidence) ? {...result,evidence} : null;
  };
  // The model chooses the candidates. The application checks only their evidence and constraints.
  const extracted = {};
  const market = field('market');
  if (market && Object.hasOwn(marketEvidence,market.value) && marketEvidence[market.value].test(market.evidence)) {
    extracted.market = market.value;
  }
  const options = {market:extracted.market ?? priorFields.market,receivedAt};
  const action = field('action');
  if (action && Object.hasOwn(actions,action.value) &&
      supportsModelAction(source,action.evidence,action.value)) extracted.action = action.value;
  for (const key of ['rationale','thesis_ref','analyst']) {
    const result = field(key);
    if (typeof result?.value === 'string' && result.value.trim() &&
        result.evidence.includes(comparable(result.value))) extracted[key] = result.value.trim();
  }
  const listings = [];
  for (const key of ['ticker','securityName']) {
    const security = field(key);
    if (typeof security?.value !== 'string') continue;
    const verified = resolveModelSecurity(source,security.evidence,options,
      key === 'securityName' ? comparable(security.value) : undefined);
    if (verified.securityName) extracted.securityName = verified.securityName;
    if (verified.market && verified.ticker &&
        (key === 'securityName' || verified.ticker === normalizeSecurityTicker(security.value,verified.market))) {
      listings.push(verified);
    }
  }
  if (!listings.length && extracted.market && priorFields.securityName && !field('securityName') && !field('ticker')) {
    const verified = resolveNamedSecurity(priorFields.securityName,extracted.market);
    if (verified.ticker) listings.push(verified);
  }
  if (new Set(listings.map(item=>item.ticker)).size > 1) invalid('证券名称和代码指向不同的标的，请明确其中一只。');
  if (listings.length) ({ticker:extracted.ticker,market:extracted.market} = listings[0]);

  const pending = missingFields(priorFields);
  for (const key of Object.keys(amountEvidence)) {
    const result = field(key);
    if (!Number.isFinite(result?.value)) continue;
    const evidence = boundedNumericEvidence(source,result.evidence,true);
    if (!evidence) continue;
    const allowPlain = pending.length === 1 && pending[0] === key && evidence === source;
    const allowCurrentPrice = key === 'reference_price' &&
      /(?:目前|当前|现在|当下)\s*$/.test(source.slice(0,source.indexOf(result.evidence)));
    const verified = moneyEvidence(key,evidence,allowPlain,allowCurrentPrice);
    if (verified?.amount === result.value) {
      extracted[key] = result.value;
      if (verified.currency && extracted.currency && verified.currency !== extracted.currency) invalid('金额币种不一致，请核对。');
      extracted.currency ??= verified.currency;
    }
  }
  const quantity = field('quantity');
  if (Number.isFinite(quantity?.value) && mentionedShareCounts(source).size <= 1 &&
      boundedNumericEvidence(source,quantity.evidence) &&
      quotedShareCount(quantity.evidence,pending.length === 1 && pending[0] === 'quantity' && quantity.evidence === source) === quantity.value) {
    extracted.quantity = quantity.value;
  }
  const confidence = field('confidence');
  if (Number.isInteger(confidence?.value) &&
      (new RegExp(`(?:^|[^\\d])${confidence.value}\\s*%`).test(confidence.evidence) ||
       new RegExp(`(?:信心|置信度|把握)\\s*[:=为是]?\\s*${confidence.value}(?![.\\d])`).test(confidence.evidence))) {
    extracted.confidence = confidence.value;
  }
  const horizon = field('horizon');
  if (horizon && Object.hasOwn(horizonEvidence,horizon.value) && horizonEvidence[horizon.value].test(horizon.evidence)) {
    extracted.horizon = horizon.value;
  }
  const date = field('recommended_at');
  if (typeof date?.value === 'string') {
    const valid = validateModelDate(date.evidence,date.value,receivedAt);
    if (!valid || !validateModelDate(source,date.value,receivedAt)) {
      invalid('请确认建议日期和时间，例如 2026-06-16 16:30（北京时间）。');
    }
    extracted.recommended_at = valid;
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
  const adviceOnly = isAdviceOnlyCommand(text) || (!interpretation &&
    /(?:仅|只)(?:登记|记录|提交|录入|记|录)(?:分析)?建议|(?:不做|不录入|不登记|取消)(?:模拟)?成交/.test(text));
  const pending = missingFields(priorFields);
  let update;
  if (adviceOnlyCommand.test(text)) {
    update = {};
  } else if (interpretation) {
    update = interpretedFields(text,interpretation,priorFields,receivedAt);
  } else if (pending.length === 1 && Object.hasOwn(priceLabels,pending[0]) && amountPattern.test(text)) {
    update = amountFields(pending[0],text);
  } else if (pending.length === 1 && pending[0] === 'quantity' && /^\d+(?:\.\d+)?\s*股?$/.test(text)) {
    update = {quantity:Number.parseFloat(text)};
  } else {
    const options = {market:priorFields.market,securityName:priorFields.securityName,receivedAt};
    update = /[|｜]/.test(text) ? structuredFields(text) : extractNatural(text,options);
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
