const digits = '零一二三四五六七八九';
const places = [['亿',100000000],['万',10000],['千',1000],['百',100],['十',10]];
const han = '零〇一二两三四五六七八九十百千万亿';
const arabic = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:\s*[万亿])?`;
const numeral = `(?:${arabic}|[${han}]+)`;
const shareToken = new RegExp(`(${numeral})\\s*(?:股(?!票)|shares?\\b)`,'giu');
const bareNumber = new RegExp(`^${numeral}$`,'u');
const incompletePrefix = new RegExp(`(?:[\\d${han}.点负]|\\d,)$`,'u');
const rangeTo = String.raw`(?:[-–—~～至到]|(?:或(?:者)?|还是))`;
const rangeBefore = new RegExp(`${numeral}\\s*(?:股\\s*)?${rangeTo}\\s*$`,'u');
const rangeAfter = new RegExp(`^\\s*${rangeTo}\\s*${numeral}`,'u');
const boundedQuantity = /(?:[-+−~～]|大约|大概|约|最多|最少|至少|至多|不超过|不低于|不高于|上限(?:为|是)?)\s*$/u;
const existingPosition = /(?:有|还剩|剩余|持仓(?:为|是)?|目标(?:持仓|仓位|总数)(?:为|是)?|(?:加|减)(?:到|至)|(?:已经?|之前|上次|昨天)(?:买入?|卖出?|成交)了?)\s*$/u;
const unitPrice = /(?:美元|美金|港元|港币|人民币|元|USD|HKD|CNY)\s*(?:\/|每)?\s*$/iu;
const qualifiedAfter = /^\s*(?:左右|上下|以内|以下|以上|起步|起卖|起买|不到|多|半|是(?:原有|已有|持仓))/u;

// Accept explicit place values. An unqualified “一百二” can mean 102 or 120.
function spokenNumber(text) {
  if (text.length === 1 && digits.includes(text)) return digits.indexOf(text);
  for (const [symbol,place] of places) {
    const index = text.indexOf(symbol);
    if (index < 0) continue;
    const head = text.slice(0,index);
    const tail = text.slice(index+1);
    if (tail.includes(symbol) || (place < 10000 && head.length > 1)) return NaN;
    const coefficient = !head && symbol === '十' ? 1 : spokenNumber(head);
    if (!(coefficient > 0 && coefficient < (place < 10000 ? 10 : place))) return NaN;
    if (!tail) return coefficient * place;
    const zero = tail.startsWith('零');
    const remainder = spokenNumber(zero ? tail.slice(1) : tail);
    if (!(remainder > 0 && remainder < place) || zero !== (remainder < place/10)) return NaN;
    return coefficient * place + remainder;
  }
  return NaN;
}

function shareNumber(raw) {
  if (raw.length > 48 || !bareNumber.test(raw)) return NaN;
  if (!/^\d/.test(raw)) return spokenNumber(raw.replaceAll('两','二').replaceAll('〇','零'));
  const numeric = raw.replaceAll(',','').replace(/\s*万$/, 'e4').replace(/\s*亿$/, 'e8');
  return Number(numeric);
}

// A pending question can identify a named draft while its listing is being resolved.
// Callers without a pending-field list must already know the ticker.
export function draftAwaitsQuantity(draft, pendingFields) {
  const soleQuestion = pendingFields === undefined ? Boolean(draft.ticker) :
    pendingFields.length === 1 && pendingFields[0] === 'quantity' && Boolean(draft.ticker || draft.securityName);
  return soleQuestion && ['buy','add','trim','sell'].includes(draft.action) &&
    draft.executionMode !== 'advice_only' && draft.quantity == null && Number.isFinite(draft.price) && draft.price > 0;
}

// Only validate the model's selected evidence. Never infer a trade size from the rest of the message.
export function matchesShareQuantity(source, evidence, value, allowBare = false) {
  if (!evidence || !Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER) return false;
  if (allowBare && source === evidence && shareNumber(evidence) === value) return true;
  const matches = [...evidence.matchAll(shareToken)];
  if (!matches.length || matches.some(match => shareNumber(match[1]) !== value)) return false;
  for (let start = source.indexOf(evidence); start !== -1; start = source.indexOf(evidence,start+1)) {
    if (matches.every(match => {
      const position = start + match.index;
      const before = source.slice(Math.max(0,position-100),position);
      const after = source.slice(position+match[0].length,position+match[0].length+100);
      const clippedUnit = match[0].endsWith('股') ? /^[票东市权价指息本]/u.test(after) : /^\w/u.test(after);
      return !clippedUnit && !incompletePrefix.test(before) && !boundedQuantity.test(before) &&
        !existingPosition.test(before) && !unitPrice.test(before) &&
        !rangeBefore.test(before) && !rangeAfter.test(after) && !qualifiedAfter.test(after);
    })) return true;
  }
  return false;
}
