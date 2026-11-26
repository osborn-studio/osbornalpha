// These words recur in ticker-shaped positions without identifying an equity.
export const nonTickers = new Set(['HK','US','HKD','USD','RMB','CNY','PM','AI','ETF','PE','PB','EPS','ADR','GDP','CEO','IPO','MACD','RSI','ROE','ROA','YOY','QOQ','FY','A']);
const ambiguousSymbols = new Set([...nonTickers,'ROI','API','FDA','ADC','CAR-T','PD-1','GLP-1','NASDAQ','NYSE']);
export const relatedSecurity = /^\s*(?:的\s*)?(?:(?:股票|个股)\s*)?(?:供应商|供应链|产业链|合作伙伴|客户|上下游|相关|概念|旗下|子公司|期权|权证|基金|ETF)/iu;
const sectorDescription = /^\s*(?:的\s*)?(?:行业|赛道|板块|指数|疗法|药物)/u;
const marketLabel = /(?:美股|纳斯达克|纽交所|NASDAQ|NYSE|港股|港交所|A股|沪市|深市)/iu;
const otherMarket = /港股|港交所|A股|沪市|深市/iu;
const labelBefore = /(?:美股|纳斯达克|纽交所|NASDAQ|NYSE|港股|港交所|A股|沪市|深市|证券代码|股票代码|标的代码|代码|\bticker|\bsymbol)\s*(?:为|是|[:=])?\s*\$?$/iu;
const tickerShape = /^[A-Z]{1,5}(?:[.-][A-Z])?$/u;
const canonical = code => code.replace('-', '.');

// Only repair the field the model selected, using the same occurrence in its quoted current message.
export function correctLabeledSymbol(packet,text) {
  const fields = packet.fields;
  const name = fields.securityName ?? (ambiguousSymbols.has(fields.ticker?.value) ? fields.ticker : undefined);
  if (!name || typeof name.value !== 'string') return packet;
  const symbol = name.value.normalize('NFKC').trim();
  if (!tickerShape.test(symbol) && !ambiguousSymbols.has(symbol)) return packet;
  const source = text.normalize('NFKC').trim();
  const quote = name.evidence.normalize('NFKC').trim();
  if (!quote || !source.includes(quote)) return packet;
  const offset = quote.indexOf(symbol);
  if (offset < 0) return packet;
  const needsCodeLabel = ambiguousSymbols.has(symbol);
  const ticker = canonical(symbol);
  const conflict = fields.ticker && canonical(fields.ticker.value.toUpperCase()) !== ticker;
  let reject = needsCodeLabel && Boolean(fields.securityName);
  let labeled = false;
  for (let index = source.indexOf(quote); index !== -1; index = source.indexOf(quote,index+1)) {
    const before = source.slice(0,index+offset);
    const after = source.slice(index+offset+symbol.length);
    const label = labelBefore.exec(before);
    if (/[A-Za-z\d._/-]$/u.test(before) || /^(?:[A-Za-z\d_/-]|\.[A-Za-z\d])/u.test(after) || relatedSecurity.test(after) || sectorDescription.test(after)) {
      reject = true;
      continue;
    }
    if (!label || (needsCodeLabel && (marketLabel.test(label[0]) || !tickerShape.test(symbol)))) continue;
    const previous = before.slice(0,label.index);
    if (otherMarket.test(label[0]) || (fields.market && fields.market.value !== 'US') ||
        (!marketLabel.test(label[0]) && /(?:港股|港交所|A股|沪市|深市)\s*$/iu.test(previous))) {
      reject = true;
      continue;
    }
    labeled = true;
    break;
  }
  if (!labeled && !reject) return packet;
  if (conflict) return {intent:'ambiguous',intentEvidence:fields.action?.evidence ?? name.evidence,fields:{}};
  const next = {...fields};
  delete next.securityName;
  // Market names alone do not verify that an acronym is listed. The workflow checks the exact symbol.
  if (labeled) next.ticker = {value:ticker,evidence:name.evidence,requiresListing:true};
  else delete next.ticker;
  return {...packet,fields:next};
}
