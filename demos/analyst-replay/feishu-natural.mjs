import { MOCK_UNIVERSE } from '../../src/lib/data/mock.ts';
import { inferCoreMarket, normalizeSecurityTicker } from '../../src/lib/securities/ticker.ts';
import { beijingInputToISO, beijingInputValue } from './public/beijing-time.mjs';

// A company can trade on multiple exchanges. Only these conventional short names
// have a default listing in this demo. All other company names need a market or code.
const defaultListings = new Map([
  ['腾讯', '00700.HK'], ['腾讯控股', '00700.HK'], ['小米', '01810.HK'], ['小米集团', '01810.HK'],
  ['茅台', '600519.SH'], ['贵州茅台', '600519.SH'], ['美团', '03690.HK'], ['快手', '01024.HK'],
  ['英伟达', 'NVDA'], ['苹果', 'AAPL'], ['微软', 'MSFT'], ['特斯拉', 'TSLA'], ['亚马逊', 'AMZN'],
]);
const chineseNames = new Set([...defaultListings.keys(), ...MOCK_UNIVERSE.map(row => row.n).filter(name => /^[\p{Script=Han}]{2,}$/u.test(name))]);
const usSymbols = new Set(MOCK_UNIVERSE.filter(row => row.m === 'US').map(row => row.t));
const usCompanyAliases = new Map([['NVIDIA','NVDA']]);
const actionPatterns = {
  buy:/买入|买进|建仓|开仓买|买(?!盘|点|方|单|家|卖)/g,
  add:/加仓|增持|补仓|加码/g,
  sell:/卖出|卖掉|清仓|卖(?!压|点|方|单|家)/g,
  trim:/减仓|减持/g,
  hold:/继续持有|维持持仓|持仓不动|持有/g,
  pass:/暂时观望|先观望|观望|暂不操作/g,
};
const fieldLabels = {
  reference_price:'参考(?:价格|价位|价)?|现价|当前(?:价格|价)|基准价|入场(?:价格|价位|价)|建议价',
  target_price:'目标(?:价格|价位|位|价)?|止盈(?:价格|价位|位|点|价)?|(?:预计|预期|看好)(?:会)?(?:上涨|涨|升|下跌|跌)(?:到|至)|看高到|看到',
  stop_loss:'止损(?:价格|价位|点位|位|点|线|价)?',
  price:'(?:模拟)?成交(?:价格|均价|单价|价位|价)|模拟买价|模拟卖价',
  fee:'手续费',
};
const labels = {reference_price:'参考价',target_price:'目标价',stop_loss:'止损价',price:'模拟成交价',fee:'手续费',
  ticker:'证券代码',securityName:'证券名称',market:'市场',action:'建议动作',quantity:'模拟成交股数',currency:'币种',recommended_at:'建议时间',
  horizon:'建议期限',confidence:'信心',analyst:'分析师',rationale:'理由',thesis_ref:'关联研究'};
const number = String.raw`(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const joinValue = String.raw`\s*(?:(?:调整为|调整到|设为|设在|放在|定为|改为|改成|设置在|设置为|大约|约为|大概|大致|放到|定在|只到|调整至|调到|调至|改到|为|是|在|到|看|约|按|用|[:=])\s*)*`;
const unit = String.raw`(?:港币|港元|HKD|HK\$|美元|美金|USD|人民币|CNY|RMB|元|块钱|块)`;
const money = String.raw`(?<prefix>港币|港元|HKD|HK\$|美元|USD|人民币|CNY|RMB)?\s*(?<amount>${number})\s*(?<unit>${unit})?`;
const markets = {港股:'HK',美股:'US',沪市:'A',深市:'A',北交所:'A','A股':'A'};
const currencies = {港元:'HKD',港币:'HKD',HKD:'HKD','HK$':'HKD',美元:'USD',美金:'USD',USD:'USD',人民币:'CNY',RMB:'CNY',CNY:'CNY'};
const marketCurrency = {HK:'HKD',US:'USD',A:'CNY'};
const uncertainSpeech = /[?？]|是否|要不要|能不能|可不可以|怎么样|怎么看|行不行|吗\s*[。.!！]?$|(?:他说|她说|有人说|别人说|据说|转发|转述|听说|别人建议|有人建议)|(?:我不同意|我不赞成|我反对)|(?:如果|假如|假设|除非|要是|等到)[^。！？\n]{0,75}(?:买|卖|加仓|减仓)/;
const conditionalAction = /(?:回调|回落|跌破|下破|跌到|涨到|涨至|反弹至|升至|突破|低于|高于)[^,，。!?！？;；\n]{0,28}(?:再|才|则|后|时|就|考虑)(?:会|可|去|考虑|建议|执行|分批|继续|逐步|择机|择时|\s)*(?:买|卖|加仓|减仓|补仓|清仓)/;
const shopping = /(?:买|卖|换|订|挑)[^,。;\n]{0,12}(?:手机|电脑|充电器|平板|电饭煲|家电|耳机|果汁|水果|手表)|(?:手机|平板|电饭煲|耳机|水果)[^,。;\n]{0,6}(?:买|卖)/;
const negated = /(?:不(?:再|要|应|会|能|宜|可|想|计划|打算|准备|建议)?|别|禁止|避免|取消|尚未|没有|不能再)\s*$/;
const completedAction = /(?:早已|已经|曾经|已)\s*$/;
const separatedAction = /[\/、;；。!！?？\n]|\.(?![A-Za-z0-9])|或者|还是|或|以及|并且|然后|之后|以后|同时|接着|再|接下来/;
const completedTradeNote = /(^|[,，。!?！？;；\n]|\.(?![A-Za-z0-9]))\s*(?:我(?:们)?\s*)?(?:(?:昨天|昨日|前天|此前|之前|上次|上周)\s*)?(?:早已|已经|曾经|已)\s*(?:买|卖|建仓|加仓|减仓|清仓|增持|减持|补仓)[^,，。!?！？;；\n]*/g;
const symbolPattern = /(?<![A-Za-z0-9.])(?:\d{1,5}\.HK|HK\s*\d{1,5}|\d{6}(?:\.(?:SH|SZ|BJ|SS))?|(?:SH|SZ|BJ)\d{6}|0\d{4})(?![A-Za-z0-9.%])/gi;
const explicitTicker = /(?:股票代码|标的代码|证券代码|代码|标的|港股|美股|A股)\s*(?:是|为|[:=])?\s*\$?([A-Za-z][A-Za-z0-9.-]{0,9}|\d{1,6}(?:\.[A-Za-z]{2})?)(?![A-Za-z0-9.])/gi;
const stockWord = /(?<![A-Za-z0-9.])[A-Z][A-Z0-9]{0,5}(?:[.-][A-Z])?(?![A-Za-z0-9]|\.[A-Za-z0-9])/gi;
const nonTickers = new Set(['HK','US','HKD','USD','RMB','CNY','PM','AI','ETF','PE','PB','EPS','ADR','GDP','CEO','IPO','MACD','RSI','ROE','ROA','YOY','QOQ','FY','A']);
const amountBeforeCode = /(?:人民币|港元|港币|美元|美金|CNY|RMB|HKD|USD|US\$|HK\$|[¥$])\s*$/i;
const amountAfterCode = /^\s*(?:万|亿|元|块钱|港币|港元|美元|美金|人民币|HKD|USD|RMB|CNY)/i;
const relatedSecurity = /^\s*(?:的\s*)?(?:(?:股票|个股)\s*)?(?:供应商|供应链|产业链|合作伙伴|客户|上下游|相关|概念|旗下|子公司|期权|权证|基金|ETF)/iu;

export function nonActionableSuggestion(text) {
  return uncertainSpeech.test(text) || conditionalAction.test(text) || shopping.test(text);
}

function invalid(message) { throw Object.assign(new Error(message),{status:400}); }

function put(fields,key,value) {
  if (value == null) return;
  if (fields[key] !== undefined && fields[key] !== value) invalid('消息里有多个不同的' + labels[key] + '，请每次只描述一条建议，并明确' + labels[key] + '。');
  fields[key] = value;
}

function cleanText(raw) {
  if (typeof raw !== 'string' || raw.length > 12000) invalid('请用文字发送一条建议。');
  return raw.normalize('NFKC').trim();
}

function numeric(raw) { return Number(raw.replaceAll(',','')); }

function readPrices(text, fields) {
  function record(key, match, remainder) {
    if (negated.test(text.slice(0,match.index))) invalid('请明确本次' + labels[key] + '，或说明暂不设置。');
    if (/^\s*(?:%|[-~～至到]\s*\d|[.．]\d|万|亿|手|股|个交易日|日|天)/u.test(remainder)) invalid('请给出单一数值的' + labels[key] + '与币种。');
    const value = numeric(match.groups.amount);
    if (!Number.isFinite(value) || (key === 'fee' ? value < 0 : value <= 0)) invalid(labels[key] + '金额无效。');
    for (const raw of [match.groups.prefix,match.groups.unit]) put(fields,'currency',currencies[raw?.toUpperCase()]);
    put(fields,key,value);
  }
  function consume(key, pattern) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) record(key,match,text.slice(match.index + match[0].length));
    text = text.replace(pattern,' ');
  }
  consume('price',new RegExp('模拟(?:交易|成交)?(?:按|以|用)\\s*'+money+'(?=\\s*(?:买入|买进|卖出|成交))','gi'));
  consume('reference_price',new RegExp('(?:按|以)\\s*'+money+'(?=\\s*(?:买入|买进|加仓|卖出|减仓))','gi'));
  for (const [key,label] of Object.entries(fieldLabels)) {
    consume(key, new RegExp('(?:'+label+')'+joinValue+money,'gi'));
    // An explicit invalid amount must not silently become an omitted optional fee or order.
    if (new RegExp('(?:'+label+')'+joinValue+'[-+]\\s*\\d').test(text)) invalid(labels[key] + '请填写有效金额。');
  }
  consume('stop_loss',new RegExp('(?:跌破|跌到|低于|低过|下破|上破|突破|超过)\\s*'+money+'\\s*(?:时|就|则|后|再|即|必须|立即|执行)*止损','gi'));
  consume('stop_loss',new RegExp(money+'\\s*(?:元)?(?:以下|以上|附近|处)?\\s*(?:就|则)?止损','gi'));
  consume('target_price',new RegExp(money+'\\s*(?:附近|处)?止盈','gi'));
  consume('price',new RegExp(money+'\\s*(?:模拟)?成交(?!价|均价|单价)','gi'));
  return text;
}

function actionsIn(text) {
  const matchesByAction = new Map();
  for (const [action,pattern] of Object.entries(actionPatterns)) {
    const matches = [];
    for (const match of text.matchAll(pattern)) {
      if (action === 'hold' && /^\s*(?:约|计划)?\s*(?:5|10|五|十)\s*(?:个)?(?:交易日|日|天)/.test(text.slice(match.index+match[0].length))) continue;
      const prefix = text.slice(0,match.index);
      if (!negated.test(prefix) && !completedAction.test(prefix)) matches.push(match);
    }
    if (matches.length) matchesByAction.set(action,matches);
  }
  // An unlabeled 买/卖 can state the direction of a more specific position adjustment.
  // Keep full verbs and cases where the author explicitly separates the actions.
  for (const [direction,adjustment,word] of [['buy','add','买'],['sell','trim','卖']]) {
    const broad = matchesByAction.get(direction);
    const specific = matchesByAction.get(adjustment);
    if (broad?.length !== 1 || specific?.length !== 1 || broad[0][0] !== word) continue;
    const [first,second] = [broad[0],specific[0]].sort((a,b) => a.index-b.index);
    if (!separatedAction.test(text.slice(first.index+first[0].length,second.index))) matchesByAction.delete(direction);
  }
  return new Set(matchesByAction.keys());
}

function cleanSymbol(raw) { return raw.replace(/^HK\s*(\d+)$/i,'$1.HK'); }

function mentionsName(text, name) {
  // Common abbreviations are also prefixes of other issuers and funds (e.g. 腾讯音乐).
  for (const match of text.matchAll(new RegExp(name,'g'))) {
    const tail = text.slice(match.index+name.length);
    if (relatedSecurity.test(tail)) continue;
    if (/^(?:$|[\s\p{P}\p{S}\d]|和|与|及|现|目标|参考|止损|继续|打算|建议|计划|预计|准备|先|可以|暂|看|想|要|拟|未来|短期|中期|长期|最近|有(?:一)?(?:条|个)?(?:建议|提议|想法)|意见|今[天日]|明[天日]|昨[天日]|认为|港股|A股|美股|股票|股价|股份公司|[买卖加减持增补清观]|(?:吧|呢|啊|一下)(?=$|[\s\p{P}\p{S}])|(?:降|提|抬)(?:低|高|点|一点|些|仓)|的(?:股|仓位|持仓|目标|参考|止损|现价|港股|A股|美股))/u.test(tail)) return true;
  }
  return false;
}

function readTicker(text, fields, knownMarket, priorName) {
  const candidates = new Set();
  const market = fields.market ?? knownMarket;
  function consider(raw) {
    const symbol = cleanSymbol(raw).toUpperCase();
    const code = usCompanyAliases.get(symbol) ?? symbol;
    if (nonTickers.has(code)) return;
    const inferred = inferCoreMarket(code);
    if (!inferred) return;
    const ticker = normalizeSecurityTicker(code,inferred);
    if (!ticker) return;
    if (market && inferred !== market) invalid('证券代码与市场不一致，请明确交易市场及代码。');
    candidates.add(ticker);
  }
  for (const match of text.matchAll(symbolPattern)) {
    const after = text.slice(match.index + match[0].length);
    if (relatedSecurity.test(after)) continue;
    // A bare amount in an order budget can have the same number of digits as a code.
    if (/^\d+$/.test(match[0]) &&
        (amountBeforeCode.test(text.slice(0,match.index)) || amountAfterCode.test(after))) continue;
    consider(match[0]);
  }
  for (const match of text.matchAll(explicitTicker)) {
    if (!relatedSecurity.test(text.slice(match.index + match[0].length))) consider(match[1]);
  }
  for (const match of text.matchAll(stockWord)) {
    const original = match[0], symbol = original.toUpperCase();
    if (relatedSecurity.test(text.slice(match.index+original.length))) continue;
    if (usSymbols.has(symbol) || usCompanyAliases.has(symbol) ||
        (original === symbol && (text.trim() === symbol || /(?:买入|买|卖出|卖|加仓|减仓|观望|持有|\$)\s*$/.test(text.slice(0,match.index))))) consider(symbol);
  }
  const resolvedNames = new Set();
  const names = [...chineseNames].filter(name => mentionsName(text,name));
  const marketOnly = /^(?:(?:交易)?市场)?\s*[:=]?\s*(?:是|为)?\s*(?:港股|美股|A股|沪市|深市|北交所)?(?:的)?[。!,.\s]*$/i.test(text);
  if (!names.length && !candidates.size && chineseNames.has(priorName) && market && marketOnly) names.push(priorName);
  const ambiguousNames = new Set();
  for (const name of names) {
    const listings = MOCK_UNIVERSE.filter(row => row.n === name || row.n === name + ' ADR');
    const rows = listings.filter(row => row.m === market);
    const fallback = defaultListings.get(name);
    if (fallback && (!market || inferCoreMarket(fallback) === market)) resolvedNames.add(fallback);
    else if (market && rows.length === 1) resolvedNames.add(rows[0].t);
    else if (new Set(listings.map(row=>row.m)).size > 1) ambiguousNames.add(name);
  }
  if (!candidates.size && !resolvedNames.size) for (const name of ambiguousNames) put(fields,'securityName',name);
  for (const ticker of resolvedNames) candidates.add(ticker);
  for (const ticker of candidates) put(fields,'ticker',ticker);
  if (fields.ticker) put(fields,'market',inferCoreMarket(fields.ticker));
}

export function resolveNamedSecurity(name, market) {
  const fields = {};
  readTicker(cleanText(name),fields,market);
  return {ticker:fields.ticker,market:fields.market,securityName:fields.securityName};
}

export function resolveModelSecurity(text, quote, options = {}, expectedName) {
  const source = cleanText(text);
  const evidence = cleanText(quote);
  if (!evidence) return {};
  if (expectedName !== undefined) {
    const name = cleanText(expectedName).replace(/(?:的)?(?:股票|个股|这只票)$/u,'');
    if (chineseNames.has(name)) {
      if (mentionsName(evidence,name) && mentionsName(source,name)) return resolveNamedSecurity(name,options.market);
      return {};
    }
    if (!usCompanyAliases.has(name.toUpperCase()) && !usSymbols.has(name.toUpperCase())) return {};
    const fields = resolveModelSecurity(source,name.toUpperCase(),options);
    return evidence.toUpperCase().includes(name.toUpperCase()) ? fields : {};
  }
  // A clipped company name is insufficient when the full message names a different issuer.
  for (const name of chineseNames) {
    if (mentionsName(evidence,name) && !mentionsName(source,name)) return {};
  }
  const comparableSource = source.toUpperCase();
  const comparableEvidence = evidence.toUpperCase();
  for (let index = comparableSource.indexOf(comparableEvidence); index !== -1; index = comparableSource.indexOf(comparableEvidence,index+1)) {
    const before = source.slice(0,index);
    const after = source.slice(index+evidence.length);
    if (relatedSecurity.test(after)) continue;
    if (/^[A-Za-z\d][A-Za-z\d./-]*$/.test(evidence) &&
        (/[A-Za-z\d.]$/.test(before) || /^(?:[A-Za-z\d]|\.[A-Za-z\d])/.test(after))) continue;
    if (/^\d+$/.test(evidence) && (amountBeforeCode.test(before) || amountAfterCode.test(after))) continue;
    return resolveNamedSecurity(evidence,options.market);
  }
  return {};
}

const datePart = String.raw`(?:(?<year>20\d\d)[年/.-](?<month>\d{1,2})[月/.-](?<day>\d{1,2})(?:日|号)?|(?<relative>今天|今日|昨天|昨日|前天))`;
const clockPart = String.raw`(?:[T\s]*(?:北京时间\s*)?(?<part>凌晨|上午|中午|下午|晚上)?\s*(?<hour>\d{1,2})(?:(?::(?<minute>\d{2})(?::(?<second>\d{2})(?:\.(?<ms>\d{1,3}))?)?)|(?:点|时)(?:(?<zhMinute>\d{1,2})分?|(?<half>半))?)(?<offset>Z|[+-]\d{2}:\d{2})?)?`;

function readDate(text,fields,receivedAt) {
  const dateRegex = new RegExp('(?<![0-9])'+datePart+clockPart+'(?![0-9])','g');
  for (const match of text.matchAll(dateRegex)) {
    const prefix = text.slice(0,match.index);
    const suffix = text.slice(match.index+match[0].length);
    const explicitlyDated = /(?:建议(?:时间|日期)|推荐(?:时间|日期)|回放(?:日期|时间|到|至)?|决策日)\s*[:为是]?\s*$/.test(prefix);
    const eventBefore = /(?:预计|预期|估计|财报|季报|年报|业绩|派息|除息|公布|披露|公告|到期|截止|截至)(?:将|会|日|日期|时间|定|于|在|为|是|:|\s)*$/.test(prefix);
    const eventAfter = /^\s*(?:将|可能|或|预计|会|正式|召开|公布|发布|披露|出炉|发放)*(?:财报|季报|年报|报告|业绩|股息|除权|除息|派息|分红|股东会|公告|到期)/.test(suffix);
    if (!explicitlyDated && (eventBefore || eventAfter)) continue;
    const g = match.groups;
    let date;
    if (g.relative) {
      if (!receivedAt) invalid('请给出含年份的建议日期，或说明消息对应的北京时间。');
      const back = {今天:0,今日:0,昨天:1,昨日:1,前天:2}[g.relative];
      if (!g.hour && !back) { put(fields,'recommended_at',new Date(receivedAt).toISOString()); continue; }
      date = beijingInputValue(Date.parse(receivedAt) - back*86_400_000).slice(0,10);
    } else date = g.year+'-'+g.month.padStart(2,'0')+'-'+g.day.padStart(2,'0');
    let hour = Number(g.hour ?? 0);
    if (['中午','下午','晚上'].includes(g.part) && hour < 12) hour += 12;
    if (g.part === '凌晨' && hour === 12) hour = 0;
    const wall = date+'T'+String(hour).padStart(2,'0')+':'+(g.minute ?? g.zhMinute ?? (g.half ? '30' : '00')).padStart(2,'0')+
      (g.second ? ':'+g.second+(g.ms ? '.'+g.ms : '') : '');
    try {
      const local = beijingInputToISO(wall);
      put(fields,'recommended_at',g.offset ? new Date(wall+g.offset).toISOString() : local);
    } catch { invalid('建议日期或时间无效，请使用例如 2026年6月16日 16:30 的北京时间。'); }
  }
  text = text.replace(dateRegex,' ');
  if (/\d{1,2}月\d{1,2}[日号]|(?:建议时间|建议日期|回放日期)\s*[:为是]?\s*\d{1,2}[/-]\d{1,2}/.test(text)) invalid('历史建议请注明年份，例如 2026年6月16日。');
  if (fields.recommended_at && /凌晨|上午|下午|晚上|收盘(?:后|时)?|开盘(?:后|时)?|(?:^|[^\d])\d{1,2}:\d/.test(text)) invalid('请写清建议发生的北京时间，例如 16:30。');
  if (!fields.recommended_at && /(?:建议(?:时间|日期)|回放日期)\s*[:为是]?\s*[^\s,。;|]/.test(text)) invalid('建议时间无法确认，请补充例如 2026年6月16日 16:30。');
  return text;
}

export function validateModelDate(evidence, value, receivedAt) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const fields = {};
  const normalized = cleanText(evidence).replace(/(\d)\s*([年月])\s*(?=\d)/g,'$1$2').replace(/(\d)\s*([日号])/g,'$1$2');
  readDate(normalized,fields,receivedAt);
  return fields.recommended_at && Date.parse(fields.recommended_at) === Date.parse(value) ? fields.recommended_at : null;
}

function readNotes(text,fields) {
  // Remove labeled prose before extracting action words, other securities or quoted prices from a thesis.
  const noteLabel = '理由|原因|逻辑|因为|关联研究|研究关联|关联研报|研究引用';
  const nextLabel = Object.values(fieldLabels).join('|') + '|' + noteLabel +
    '|信心|置信度|建议时间|建议日期|期限|分析师|数量|[0-9,.]+股|(?:所以)?(?:我)?建议(?:买|卖|加|减|持|观)';
  const separator = '[,。;|\\n\\s]+';
  const pattern = new RegExp('(?<label>'+noteLabel+')\\s*(?:是|为|[:=])?\\s*(?<note>[\\s\\S]*?)(?='+separator+'(?:'+nextLabel+')|$)','g');
  return text.replace(pattern,(match,...args) => {
    const {label,note} = args.at(-1);
    if (note && !/^(?:无|暂无|跳过|略)$/.test(note.trim())) put(fields,/研究|研报/.test(label)?'thesis_ref':'rationale',note.trim());
    return ' ';
  });
}

export function detectNaturalProposal(raw, {directedToBot = false} = {}) {
  const text = cleanText(raw);
  if (nonActionableSuggestion(text)) return false;
  if (!directedToBot && /买|卖/.test(text) && !/(?:买入|买进|卖出|卖掉|加仓|减仓|清仓|股份|股票|[0-9]\s*股|建议|推荐|参考|目标|止损|现价|成交)/.test(text)) return false;
  const action = actionsIn(text).size > 0;
  if (!action && Object.values(actionPatterns).some(pattern=>new RegExp(pattern.source).test(text))) return false;
  const loneCode = (usSymbols.has(text.toUpperCase()) || usCompanyAliases.has(text.toUpperCase()) ||
    /^\$?[A-Z]{1,6}(?:[.-][A-Z])?$/.test(text) || /^(?:\d{5,6}|HK\s*\d{1,5}|\d{1,5}\.HK|(?:SH|SZ|BJ)\d{6}|\d{6}\.(?:SH|SZ|BJ))$/i.test(text)) &&
    !nonTickers.has(text.toUpperCase());
  if (directedToBot && (chineseNames.has(text) || loneCode || /^(?:股票代码|代码|证券代码|标的代码|标的)\s*(?:是|为|[:=])?\s*[A-Z0-9][A-Z0-9.-]*[。.]?$/i.test(text) || /^(?:港股|美股|A股)\s*[\p{Script=Han}A-Za-z0-9.]{1,15}$/u.test(text))) return true;
  const symbol = [...chineseNames].some(name=>text.includes(name)) || new RegExp(symbolPattern.source,'i').test(text) ||
    /(?:美股|港股|A股|证券代码|股票代码)|(?:买入|卖出|加仓|减仓|观望|持有)\s*[A-Z]|[A-Z]{1,5}\s*(?:买入|卖出|加仓|减仓|观望|持有)/.test(text);
  const quote = /参考价?|现价|目标价|止损|模拟成交|\d\s*股/.test(text);
  const proposal = /建议|提案|提议|推荐/.test(text);
  return /^(?:买入|买进|卖出|加仓|减仓|持有|观望|补仓|增持|减持|清仓)$/.test(text) ||
    (action && /(?:买入|卖出|加仓|减仓|持有|观望)\s*[\p{Script=Han}]{1,14}(?:股份|集团|科技|公司)/u.test(text)) ||
    (action && directedToBot && /(?:买入|卖出|加仓|减仓|持有|观望)\s*[\p{Script=Han}]{2,12}[。！!]?$/u.test(text)) ||
    /^(?:我要|我想|请)?(?:登记|提交|录入)(?:一(?:条|个)?)?(?:投资|交易|分析)?建议/.test(text) ||
    (proposal && (action || symbol || quote)) ||
    (symbol && (action || quote)) ||
    (action && (quote || /(?:我(?:想|要|准备|打算)|计划|打算|拟|建议|申请)/.test(text)));
}

export function withoutCompletedTradeNotes(text) {
  return text.replace(completedTradeNote,'$1');
}

export function extractNatural(raw, {market, receivedAt, securityName} = {}) {
  const fields = {};
  let text = withoutCompletedTradeNotes(readNotes(cleanText(raw),fields));
  if (nonActionableSuggestion(text) || (!actionsIn(text).size && Object.values(actionPatterns).some(p=>new RegExp(p.source).test(text)))) invalid('请明确陈述你本人的证券建议，例如「建议加仓」或「继续观望」。');
  text = text.replace(/(?:分析师|署名)\s*[:=]?\s*([\w.-]+|[\p{Script=Han}]{2,8})(?=\s|[,。;|]|$)/gu,(_,name)=>{put(fields,'analyst',name);return ' ';});
  text = text.replace(/(?:市场|交易所)\s*[:=是为]?\s*(HK|US|A)(?![A-Za-z\d])/gi,(_,code)=>{put(fields,'market',code.toUpperCase());return ' ';});
  text = readDate(text,fields,receivedAt);
  for (const [name,code] of Object.entries(markets)) if (text.toUpperCase().includes(name.toUpperCase())) put(fields,'market',code);
  for (const action of actionsIn(text)) put(fields,'action',action);
  text = readPrices(text,fields);
  text = text.replace(/([一二三四五六七八九十1-9])成(?:的)?(?:信心|把握)|(?:信心|把握|置信度)\s*[:=为有是]?\s*([一二三四五六七八九十1-9])成/g,(_,before,after)=>{
    const digit=before ?? after;
    put(fields,'confidence',10*(Number(digit) || '一二三四五六七八九十'.indexOf(digit)+1));
    return ' ';
  });
  text = text.replace(/(?:信心度|信心|置信度|把握)\s*[:=为是有]?\s*(\d+(?:\.\d+)?)\s*%?/g,(_,raw)=>{put(fields,'confidence',Number(raw));return ' ';});
  text = text.replace(/(?:期限(?:为|是)?\s*[:=]?\s*)?(5|10|五|十)\s*(?:个)?(?:交易日|天|日)(?:期)?/g,(_,raw)=>{put(fields,'horizon',['5','五'].includes(raw)?'5d':'10d');return ' ';});
  text = text.replace(/(?:建议期限|期限|周期)\s*[:=为是]?\s*(短期|中期|长期|未定)/g,(_,raw)=>{put(fields,'horizon',{短期:'short',中期:'mid',长期:'long'}[raw]);return ' ';});
  if (/(?:数量|股数)\s*[:=]?\s*[-−]|[-−]\s*\d+(?:\.\d+)?\s*(?:万)?股|\d+(?:\.\d+)?[-~至到]\s*\d+(?:\.\d+)?(?:万)?股/.test(text)) invalid('请明确一个正数的模拟成交股数。');
  const labeledQuantity = new RegExp('(?:数量|股数)'+joinValue+'('+number+')\\s*(万)?\\s*(?:股)?','g');
  text = text.replace(labeledQuantity,(_,raw,wan)=>{put(fields,'quantity',numeric(raw)*(wan?10000:1));return ' ';});
  const shares = new RegExp('('+number+')\\s*(万)?\\s*股(?!票)','g');
  text = text.replace(shares,(_,raw,wan)=>{put(fields,'quantity',numeric(raw)*(wan?10000:1));return ' ';});
  if (/\d\s*手/.test(text)) invalid('请将手数换算成具体股数后再提交。');
  readTicker(text,fields,market,securityName);
  if (fields.currency && (fields.market ?? market) && fields.currency !== marketCurrency[fields.market ?? market]) invalid('金额币种与交易市场不一致，请明确价格和币种。');
  return fields;
}
