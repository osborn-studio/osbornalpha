import { inferCoreMarket, normalizeSecurityTicker } from '../../src/lib/securities/ticker.ts';
import { currencyCodeOfMarket } from '../../src/lib/utils.ts';
import { parseRecommendationInput } from '../../src/lib/analyst/validate.ts';
import { beijingInputValue } from './beijing-time.mjs';
import { draftAwaitsQuantity, matchesShareQuantity } from './feishu-share-quantity.mjs';
import { extractNatural, isKnownChineseSecurityName, resolveModelSecurity, resolveNamedSecurity, validateModelDate } from './feishu-natural.mjs';

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
const currencyNames = {港元:'HKD',港币:'HKD',人民币:'CNY',元人民币:'CNY',美元:'USD',美金:'USD'};
const amountPattern = /^(\d+(?:\.\d+)?)\s*(元人民币|港元|港币|人民币|美元|美金|元|HKD|USD|CNY)?$/i;
const prefix = /^\/?(?:建议|提案)(?:\s+|[|｜]|$)/;
const adviceOnlyCommand = /^(仅登记建议|只登记建议|只记建议|取消模拟成交)[。！! ]*$/;
// The server resolves the real profile from the authenticated Feishu role. The shared parser requires a UUID for shape validation.
const validationProfile = '00000000-0000-4000-8000-000000000000';
const marketEvidence = {
  A:/(?:A股|沪市|深市|北交所|上交所|深交所|^A$|\b\d{6}\s+CH\b)/i,
  HK:/(?:港股|港交所|香港|H股|^HK$|\b\d{1,5}\s+HK\b|^港(?:的|市)?那只[。！？!?]?$)/i,
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
const currencyLiteral = String.raw`元人民币|港元|港币|人民币|美元|美金|HKD|USD|CNY|RMB|HK\$|US\$|¥|\$|元`;
const numericAmount = `(?<prefix>${currencyLiteral})?\\s*(?<number>${decimalLiteral})\\s*(?<unit>${currencyLiteral})?`;
const amountEvidence = {
  reference_price:'参考(?:价格|价位|价)?|现价|当前(?:价格|价)|(?:目前|当前)(?=\\s*每股)|基准价|入场(?:价格|价位|价)|建议价',
  target_price:'目标(?:价格|价位|位|价)?|止盈(?:价格|价位|位|点|价)?|(?:预计|预期|看好)(?:会)?(?:上涨|涨|升|下跌|跌)(?:到|至)|看高到|看到',
  stop_loss:'止损(?:价格|价位|点位|位|点|线|价)?',
  fee:'手续费',
  price:'(?:模拟)?成交(?:价格|均价|单价|价位|价)|模拟(?:买价|卖价|价格|价)|模拟(?:成交|交易)(?=\\s*(?:按|以|用)\\s*每股)|每股成交(?:价格|价)',
};
const postfixLabels = {
  reference_price:'参考(?:价格|价位|价)|基准价', target_price:'目标(?:价格|价位|价)|止盈价',
  stop_loss:'止损(?:价格|价位|价)', price:'(?:模拟)?成交(?:均价|单价|价格|价)',
};
const postfixJoin = String.raw`\s*(?:是|为|作为|用作)\s*(?:本次的?\s*)?`;
const amountJoin = String.raw`\s*(?:(?:调整为|调整到|放在|设在|设为|定在|定为|约为|大约|大概|每股|按|以|用|为|是|在|到|约|[:=])\s*)*`;
const unsupportedAmountSuffix = /^\s*(?:[.．]\d|[-–~～至到]\s*\d|万|亿|[%股手])/u;
const plainAmountEvidence = new RegExp('^'+numericAmount+'$','i');
const perShareAmount = new RegExp(`^${numericAmount}\\s*(?:一股|每股|/\\s*股)$`,'i');
const amountPerShare = new RegExp(`^每股\\s*${numericAmount}$`,'i');
const boundPriceLabel = String.raw`(?:最多|至多|至少|不(?:得|能)?超过|不高于|不低于|上限(?:为|是)?|封顶)\s*(?:按\s*)?(?:每股\s*)?`;
const precedingPriceBound = new RegExp(`${boundPriceLabel}$`,'u');
const quotedPriceBound = new RegExp(`${boundPriceLabel}(?:(?:${currencyLiteral})\\s*)?\\d`,'iu');
const startsWithAmount = new RegExp(`^(?:(?:${currencyLiteral})\\s*)?\\d`,'i');
const oldPriceLead = /(?:上次|昨天|之前|旧的?|原先|历史)(?:的|模拟|成交|交易|参考价|目标价|止损价|价格|价|每股|按|以|用|为|是|\s)*$/u;
const currencySuffix = new RegExp(`^\\s*(?:${currencyLiteral})`,'i');
const cashNumber = `(?:${decimalLiteral}\\s*[百千万亿]?|[零〇一二两三四五六七八九十百千万亿]+)`;
const cashAmount = new RegExp(`(?:${cashNumber}\\s*(?:${currencyLiteral})|(?:${currencyLiteral})\\s*${cashNumber})`,'iu');
const namedPrice = new RegExp(`(?:${Object.values(amountEvidence).join('|')}|每股|市值|估值|净资产|总资产|账户余额)${amountJoin}$`,'iu');
const onlyAdviceEvidence = /(?:只|仅|光).{0,8}(?:建议|观点|看法|登记|记录|记下)|(?:先不|不必|不要|不用|无需|别|暂缓|取消).{0,6}(?:交易|成交|执行|下单)/u;

function hasUnpricedCashOrder(source,action) {
  if (!['buy','add','trim','sell'].includes(action?.value)) return false;
  // The model identifies the action. Only inspect funds tied to that clause,
  // so an unrelated account balance or a labelled price cannot request a fill.
  return source.split(/[。！？!?；;\n]/u).some(sentence => {
    if (!sentence.includes(action.evidence)) return false;
    const clauses = sentence.split(/，|,(?!\d{3}(?:\D|$))/u);
    return clauses.some((clause,index) => {
      const cash = cashAmount.exec(clause);
      if (!cash) return false;
      const before = clause.slice(0,cash.index).trim();
      const after = clause.slice(cash.index+cash[0].length).trim();
      if (namedPrice.test(before) || /^(?:一股|每股|\/股)/u.test(after)) return false;
      return clause.includes(action.evidence) || (index > 0 && clauses[index-1].includes(action.evidence) && !before && !after);
    });
  });
}

function invalid(message) {
  throw Object.assign(new Error(message), {status:400});
}

export function isAdviceOnlyCommand(text) {
  return adviceOnlyCommand.test(text.trim());
}

export function modelExecutionMode(text, interpretation) {
  const source = comparable(text);
  const field = modelField(source,interpretation,'executionMode');
  if (field?.value === 'simulate') return 'simulate';
  if (field?.value === 'advice_only' && (!cashAmount.test(source) || onlyAdviceEvidence.test(field.evidence))) return 'advice_only';
  // Missing or ungrounded disposition on a sized order must go back to its
  // author for shares and price (or an explicit advice-only choice) before PM.
  return hasUnpricedCashOrder(source,modelField(source,interpretation,'action')) ? 'simulate' : undefined;
}

function moneyEvidence(key, evidence, allowPlain) {
  const amountAfterLabel = new RegExp(`(?:${amountEvidence[key]})${amountJoin}${numericAmount}`,'gi');
  const amountBeforeLabel = {
    stop_loss:new RegExp(`(?:跌破|低于|下破|上破|超过)\\s*${numericAmount}\\s*(?:则|就|时|后|立即)?\\s*止损`, 'gi'),
    price:new RegExp(`模拟(?:交易|成交)?(?:按|以|用)${amountJoin}${numericAmount}(?=\\s*(?:买入|买进|卖出|成交))`, 'gi'),
  }[key];
  const matches = [...evidence.matchAll(amountAfterLabel), ...(amountBeforeLabel ? evidence.matchAll(amountBeforeLabel) : [])];
  if (key === 'price') {
    matches.push(...evidence.matchAll(new RegExp(`每股\\s*${numericAmount}(?=\\s*(?:模拟)?成交(?!价|总额))`,'gi')));
  }
  if (postfixLabels[key]) {
    const postfix = new RegExp(`^${numericAmount}${postfixJoin}(?:${postfixLabels[key]})$`,'i').exec(evidence);
    if (postfix) matches.push(postfix);
  }
  if (!matches.length && allowPlain) {
    const plain = plainAmountEvidence.exec(evidence) ?? perShareAmount.exec(evidence) ?? amountPerShare.exec(evidence);
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

const comparable = value => value.normalize('NFKC').trim();

function modelField(source, interpretation, key) {
  const field = interpretation?.fields?.[key];
  if (typeof field?.evidence !== 'string') return null;
  const evidence = comparable(field.evidence);
  return evidence && source.includes(evidence) ? {...field,evidence} : null;
}

function modelName(source, interpretation) {
  const candidate = modelField(source,interpretation,'securityName');
  if (typeof candidate?.value !== 'string') return null;
  const name = comparable(candidate.value).replace(/(?:的)?(?:股票|个股|这只票)$/u,'');
  if (!/^[\p{Script=Han}A-Za-z0-9][\p{Script=Han}A-Za-z0-9 .&-]{1,49}$/u.test(name)) return null;
  const at = candidate.evidence.toUpperCase().indexOf(name.toUpperCase());
  if (at < 0) return null;
  const isRelated = /^(?:\s*的)?\s*(?:(?:股票|个股)\s*)?(?:供应商|供应链|产业链|客户|相关|概念|子公司|期权|基金|ETF)/i;
  const grounded = isKnownChineseSecurityName(name) ? resolveModelSecurity(source,candidate.evidence,{},name) : null;
  if (grounded && !grounded.ticker && !grounded.securityName) return null;
  for (let start = source.indexOf(candidate.evidence); start !== -1; start = source.indexOf(candidate.evidence,start+1)) {
    if (!isRelated.test(source.slice(start+at+name.length))) return {name,evidence:candidate.evidence};
  }
  return null;
}

function localModelListing(source, {name,evidence}, options) {
  const result = resolveModelSecurity(source,evidence,options,name);
  if (result.ticker || result.securityName || !/-(?:W|SW|S)$/i.test(name)) return result;
  const ordinary = resolveModelSecurity(source,evidence,options,name.replace(/-(?:W|SW|S)$/i,''));
  return ordinary.market === 'HK' ? ordinary : result;
}

export function proposalSecurityQuery(text, interpretation, priorFields = {}) {
  const source = comparable(text);
  const ticker = modelField(source,interpretation,'ticker');
  if (ticker?.requiresListing) return (!priorFields.ticker && priorFields.securityName) || ticker.value;
  const name = modelName(source,interpretation);
  if (!name) return priorFields.ticker ? null : priorFields.securityName ?? null;
  if (!priorFields.ticker && priorFields.securityName && name.name !== priorFields.securityName) return name.name;
  if (localModelListing(source,name,{}).ticker) return null;
  return name.name;
}

export function listingChoices(catalogue = [],market) {
  const exact = catalogue.filter(item => !item.suggestionOnly);
  return (exact.length ? exact : catalogue).filter(item => !market || item.market === market);
}

export function correctionTickerQuery(text,packet,priorFields) {
  if (!priorFields.ticker && !priorFields.securityName) return null;
  const field = modelField(comparable(text),packet,'ticker');
  if (typeof field?.value !== 'string') return null;
  const market = inferCoreMarket(field.value);
  const ticker = market && normalizeSecurityTicker(field.value,market);
  const original = priorFields.ticker ?? resolveNamedSecurity(priorFields.securityName).ticker;
  return ticker && ticker !== original ? ticker : null;
}

function conflictingSecurity(ticker,previous,fallback) {
  throw Object.assign(new Error(fallback),{status:400,conflictingTicker:ticker,previousSecurity:previous});
}

function boundedPriceEvidence(source, evidence) {
  // Reject a model quote that clips a sign, decimal digit, scale suffix or range endpoint.
  for (let index = source.indexOf(evidence); index !== -1; index = source.indexOf(evidence,index+1)) {
    const before = source.slice(0,index);
    const after = source.slice(index+evidence.length);
    const lead = before + evidence.slice(0,evidence.search(/\d/u));
    if (oldPriceLead.test(lead) || precedingPriceBound.test(before) || quotedPriceBound.test(evidence) ||
        /^\s*(?:以内|以下|以上|上限|下限|区间|吗|么|[?？])/u.test(after)) continue;
    if (startsWithAmount.test(evidence) && /(?:[\d.]|[-+−]\s*|\d+\s*(?:至|到)\s*)$/.test(before)) continue;
    if (/\d$/.test(evidence) && /^\d/.test(after)) continue;
    if (unsupportedAmountSuffix.test(after)) continue;
    let currency = '';
    if (/\d$/.test(evidence)) currency = currencySuffix.exec(after)?.[0] ?? '';
    else if (/\d\s*元$/u.test(evidence) && after.startsWith('人民币')) currency = '人民币';
    if (currencySuffix.test(after.slice(currency.length)) || (currency && unsupportedAmountSuffix.test(after.slice(currency.length)))) continue;
    return evidence + currency;
  }
  return null;
}

function includeAmountLabel(source, evidence, key) {
  if (!plainAmountEvidence.test(evidence) && !amountPerShare.test(evidence)) return evidence;
  const label = new RegExp(`(?:${amountEvidence[key]})${amountJoin}$`,'i');
  const postfix = postfixLabels[key] && new RegExp(`^${postfixJoin}(?:${postfixLabels[key]})`,'i');
  for (let index = source.indexOf(evidence); index !== -1; index = source.indexOf(evidence,index+1)) {
    const prefix = label.exec(source.slice(0,index));
    if (prefix) return prefix[0] + evidence;
    const suffix = postfix && postfix.exec(source.slice(index+evidence.length));
    if (suffix) return evidence + suffix[0];
  }
  return evidence;
}

function interpretedFields(text, interpretation, priorFields, receivedAt, catalogue, priorCatalogue) {
  if (interpretation.intent !== 'proposal') return {};
  const source = comparable(text);
  const field = key => modelField(source,interpretation,key);
  // The model chooses the candidates. The application checks only their evidence and constraints.
  const extracted = {};
  const executionMode = modelExecutionMode(text,interpretation);
  if (executionMode) extracted.executionMode = executionMode;
  const market = field('market');
  if (market && Object.hasOwn(marketEvidence,market.value) && marketEvidence[market.value].test(market.evidence)) {
    extracted.market = market.value;
  }
  const marketHint = extracted.market ?? (!priorFields.ticker ? priorFields.market : undefined);
  const options = {market:marketHint,receivedAt};
  const action = field('action');
  if (action && Object.hasOwn(actions,action.value)) extracted.action = action.value;
  for (const key of ['rationale','thesis_ref','analyst']) {
    const result = field(key);
    if (typeof result?.value === 'string' && result.value.trim() &&
        result.evidence.includes(comparable(result.value))) extracted[key] = result.value.trim();
  }
  const listings = [];
  const name = modelName(source,interpretation);
  const security = field('ticker');
  const priorName = !priorFields.ticker ? priorFields.securityName : null;
  const nameValue = name?.name ?? priorName;
  const local = name ? localModelListing(source,name,options) :
    priorName && extracted.market ? resolveNamedSecurity(priorName,extracted.market) : {};
  const choices = listingChoices(catalogue,marketHint);
  const remote = choices.filter(item => !item.suggestionOnly);
  if (nameValue) extracted.securityName = nameValue;
  // With a queried security master, only use a listing it actually verified for this issuer.
  if (!security?.requiresListing && local.ticker && (!catalogue || (remote.length === 1 && remote[0].ticker === local.ticker))) listings.push(local);
  if (security?.requiresListing) {
    const verified = remote.find(item=>item.market === 'US' && item.ticker === security.value);
    if (verified) listings.push(verified);
  } else if (typeof security?.value === 'string') {
    // Verify the model's selected code, rather than searching its whole evidence for a different code.
    const value = comparable(security.value);
    const evidence = security.evidence.toUpperCase();
    const explicit = /[A-Z\d]/i.test(value) && evidence.includes(value.toUpperCase()) ?
      resolveModelSecurity(source,value,options) : resolveModelSecurity(source,security.evidence,options);
    if (explicit.ticker && explicit.ticker === normalizeSecurityTicker(value,explicit.market)) listings.push(explicit);
    const exact = choices.find(item => normalizeSecurityTicker(value,item.market) === item.ticker);
    if (exact && /^\d{1,5}$/.test(value) && (evidence === value || evidence.includes(`(${value})`))) listings.push(exact);
  }
  if (!security && !listings.length && remote.length === 1 && (marketHint || !resolveNamedSecurity(nameValue ?? '').securityName)) listings.push(remote[0]);
  const refiningName = priorName && name && nameValue !== priorName;
  // A second name can clarify a shorthand from the draft. Both searches must point
  // to the same listing. A prefix match alone cannot select a trade.
  const previousChoices = listingChoices(refiningName ? priorCatalogue : catalogue);
  const sameIssuer = remote.some(row => previousChoices.some(previous => previous.ticker === row.ticker));
  if (listings.length && name && catalogue?.length === 0 && !local.ticker) {
    invalid(`暂时无法从证券主表核实「${name.name}」和该代码是否对应，请稍后再回复公司名和代码。`);
  }
  if (new Set(listings.map(item=>item.ticker)).size > 1 ||
      (name && catalogue?.length && listings.some(item=>!choices.some(row=>row.ticker === item.ticker)))) {
    invalid('证券名称和代码指向不同的标的，请明确其中一只。');
  }
  if (priorName && ((refiningName && !sameIssuer) || (listings.length &&
      resolveNamedSecurity(priorName,listings[0].market).ticker !== listings[0].ticker &&
      !previousChoices.some(item => item.ticker === listings[0].ticker) && (!name || refiningName || catalogue?.length)))) {
    conflictingSecurity(listings[0]?.ticker,priorName,`你前面提到的是「${priorName}」。请回复它的上市市场，或把公司名和完整代码一起发来。如果要换成另一只，请另发一条完整建议。`);
  }
  if (listings.length) ({ticker:extracted.ticker,market:extracted.market} = listings[0]);

  const pending = missingFields(priorFields);
  for (const key of Object.keys(amountEvidence)) {
    const result = field(key);
    if (!Number.isFinite(result?.value)) continue;
    const evidence = boundedPriceEvidence(source,includeAmountLabel(source,result.evidence,key));
    if (!evidence) continue;
    const soleMissing = pending.length === 1 && pending[0] === key;
    const start = source.indexOf(evidence);
    const perShareFill = key === 'price' && (perShareAmount.test(evidence) || amountPerShare.test(evidence)) &&
      (/^\s*(?:模拟)?成交/.test(source.slice(start+evidence.length)) ||
       /模拟(?:成交|交易|买入|卖出)?(?:按|以|用|价[:：]?)\s*$/.test(source.slice(0,start)));
    const currentPerShare = key === 'reference_price' && amountPerShare.test(evidence) &&
      /(?:目前|当前)\s*$/u.test(source.slice(0,start));
    const verified = moneyEvidence(key,evidence,perShareFill || currentPerShare || (soleMissing && evidence === source));
    if (verified?.amount === result.value) {
      extracted[key] = result.value;
      if (verified.currency && extracted.currency && verified.currency !== extracted.currency) invalid('金额币种不一致，请核对。');
      extracted.currency ??= verified.currency;
    }
  }
  const quantity = field('quantity');
  const quantityDraft = priorName && !security && !name && extracted.ticker && remote.length === 1 ?
    {...priorFields,ticker:extracted.ticker} : priorFields;
  if (quantity && matchesShareQuantity(source,quantity.evidence,quantity.value,draftAwaitsQuantity(quantityDraft))) {
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
    if (!valid) invalid('请确认建议日期和时间，例如 2026-06-16 16:30（北京时间）。');
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

export function missingFields(fields) {
  const missing = Object.keys(required).filter(key => fields[key] == null);
  if (fields.executionMode === 'simulate' || ['quantity','fee','price'].some(key => fields[key] != null)) {
    if (fields.price == null) missing.push('price');
    if (fields.quantity == null) missing.push('quantity');
  }
  return missing;
}

export function missingLabels(fields) {
  return missingFields(fields).map(key =>
    key === 'ticker' && fields.securityName && !fields.market ? '交易市场或标的代码' :
      required[key] ?? priceLabels[key] ?? '模拟成交股数');
}

function validateFields(fields, signatures) {
  if (fields.analyst != null && !signatures.includes(fields.analyst)) invalid('提案署名与此飞书成员绑定的分析师不一致。');
  if (fields.action != null && !Object.hasOwn(actions,fields.action)) invalid('请明确建议动作，如买入、加仓、减仓、卖出、持有或观望。');
  if (fields.market != null && !['A','HK','US'].includes(fields.market)) invalid('请明确市场为 A 股、港股或美股。');
  if (fields.ticker != null) {
    const market = inferCoreMarket(fields.ticker);
    if (!market || (fields.market && fields.market !== market) || !normalizeSecurityTicker(fields.ticker,market)) {
      invalid('标的代码与市场不匹配，请补充该公司的上市市场和完整股票代码。');
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
  if (['hold','pass'].includes(fields.action) && (fields.executionMode === 'simulate' ||
      ['quantity','price','fee'].some(key => fields[key] != null))) invalid('持有和观望提案不能附带模拟成交。');
}

const buyDirection = action => action === 'buy' || action === 'add';

export function evaluateProposal(role, analystName, command, receivedAt, analystAliases = [], priorFields = {}, interpretation, catalogue, priorCatalogue) {
  const text = command.trim();
  const adviceOnly = isAdviceOnlyCommand(text) || (!interpretation &&
    /(?:仅|只)(?:登记|记录|提交|录入|记|录)(?:分析)?建议|(?:不做|不录入|不登记|取消)(?:模拟)?成交/.test(text));
  const pending = missingFields(priorFields);
  let update;
  if (adviceOnlyCommand.test(text)) {
    update = {};
  } else if (interpretation) {
    update = interpretedFields(text,interpretation,priorFields,receivedAt,catalogue,priorCatalogue);
  } else if (pending.length === 1 && Object.hasOwn(priceLabels,pending[0]) && amountPattern.test(text)) {
    update = amountFields(pending[0],text);
  } else if (pending.length === 1 && pending[0] === 'quantity' && /^\d+(?:\.\d+)?\s*股?$/.test(text)) {
    update = {quantity:Number.parseFloat(text)};
  } else {
    const options = {market:priorFields.market,securityName:priorFields.securityName,receivedAt};
    update = /[|｜]/.test(text) ? structuredFields(text) : extractNatural(text,options);
  }
  const candidate = interpretation?.fields?.ticker;
  if (candidate?.requiresListing && priorFields.ticker && priorFields.ticker !== candidate.value && !update.ticker) {
    invalid(`原提案是 ${priorFields.ticker}。未能从证券主表核实新代码 ${candidate.value}，请核对标的后重发。`);
  }
  if (priorFields.ticker && update.ticker && priorFields.ticker !== update.ticker) {
    conflictingSecurity(update.ticker,priorFields.securityName ?? priorFields.ticker,
      `原提案的标的是 ${priorFields.ticker}。如果要换成 ${update.ticker}，请另发一条完整建议。`);
  }
  const fields = {...priorFields,...update};
  if (adviceOnly || fields.executionMode === 'advice_only') {
    delete fields.price;
    delete fields.quantity;
    delete fields.fee;
    fields.executionMode = 'advice_only';
  } else {
    if (priorFields.currency && update.currency && priorFields.currency !== update.currency) invalid('补充价格的币种与原提案不同，请核对。');
    if (priorFields.action && update.action && buyDirection(priorFields.action) !== buyDirection(update.action) &&
        ['quantity','price','fee'].some(key => priorFields[key] != null && update[key] == null)) {
      invalid('成交方向变了，请重新说明本次成交的股数和每股价，或回复「仅登记建议」。');
    }
  }
  validateFields(fields,[role,analystName,...analystAliases]);
  const missing = missingLabels(fields);
  if (missing.length) return {fields,missing,body:null};

  const {analyst,currency,securityName,quantity,fee,price,executionMode,...input} = fields;
  const replayHorizon = ['5d','10d'].includes(input.horizon) ? input.horizon : null;
  const result = parseRecommendationInput({...input,analyst_id:validationProfile,source_type:'manual',source_ref:undefined,
    horizon:replayHorizon ? undefined : input.horizon,confidence:input.confidence ?? 70,recommended_at:input.recommended_at ?? receivedAt});
  if (!result.ok) invalid('建议登记未通过校验：' + result.error);
  if (Date.parse(result.value.recommended_at) > Date.parse(receivedAt)) invalid('建议时间不得晚于原提案的飞书发送时间。');
  const {analyst_id,source_type,...recommendation} = result.value;
  if (replayHorizon) recommendation.horizon = replayHorizon;
  const simulation = quantity == null ? null : {
    direction:buyDirection(input.action) ? 'buy' : 'sell',price,quantity,fee:fee ?? 0,
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
    `待确认提案 #${id.slice(0,8)}`,
    `分析师 ${analystName}`,
    `${rec.ticker} · ${rec.market} · ${actions[rec.action]}`,
    `建议时间 ${beijingInputValue(rec.recommended_at).replace('T',' ')}（北京时间）`,
    ...(prices.length ? [prices.join('｜') + '（' + currency + '）'] : []),
    ...(!defaultConfidence ? [`信心 ${rec.confidence}%`] : []),
    ...(rec.horizon ? ['期限 ' + (horizonLabels[rec.horizon] ?? rec.horizon)] : []),
    ...(rec.rationale ? ['建议理由 ' + rec.rationale] : []),
    ...(rec.thesis_ref ? ['关联研究 ' + rec.thesis_ref] : []),
    trade ? `正式系统模拟成交申请 ${trade}` : '仅登记建议',
    accountId ? `正式模拟账户尾号 ${accountId.slice(-6)}` : '尚未绑定正式模拟账户。确认后可登记 Demo 建议。',
    '已授权的审批人请直接回复这条摘要「同意」。',
  ].join('\n');
}
