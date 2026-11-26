export const positionHeading = '分析师持仓（按成本，按币种分别计算）';
export const emptyPositions = '暂无归属持仓。';
export const unmatchedPositionNote = '归属卖出超过该分析师当时可归属的买入，成本或盈亏缺少依据，标为待核。';

const amount = new Intl.NumberFormat('en-US',{useGrouping:false,maximumFractionDigits:12});
const percent = new Intl.NumberFormat('en-US',{useGrouping:false,maximumFractionDigits:2});
// Suppress binary floating-point noise in displayed cost (e.g. 99 × 400.2).
const format = value => value === null ? '待核' : amount.format(Number(value.toPrecision(15)));
const decimal = '-?\\d+(?:\\.\\d+)?';
const number = '(?:'+decimal+'|待核)';
// Official transaction symbols may include slashes and spaces. Both amount columns
// carry the same currency; each field is bounded by the report's full-width separator.
const displayField = String.raw`[^｜\p{Cc}\p{Cf}<>@]`;
const positionRow = new RegExp('^(?<ticker>'+displayField+'{1,60})｜净股数 (?<shares>'+decimal+')｜均价 '+number+
  '｜持仓成本 (?<cost>'+number+') (?<currency>'+displayField+'{1,8})｜已实现盈亏 (?<realized>'+number+')'+
  String.raw` \k<currency>`+'｜占比 (?:'+decimal+'%|待核)$','u');

function readAmount(value) {
  if (value === '待核') return null;
  const result = Number(value);
  if (!Number.isFinite(result)) throw Error('持仓数值无效。');
  return result;
}

export function readPositionRows(block) {
  const [header,...lines] = block.split('\n');
  if (header !== positionHeading || !lines.length) throw Error('持仓报表格式无法核实。');
  if (lines.length === 1 && lines[0] === emptyPositions) return [];
  if (lines.at(-1) === unmatchedPositionNote) lines.pop();
  if (!lines.length) throw Error('持仓缺少明细。');
  return lines.map(text => {
    const row = positionRow.exec(text);
    if (!row) throw Error('持仓明细格式无法核实。');
    const {ticker,currency,cost,shares,realized} = row.groups;
    return {ticker,currency,cost:readAmount(cost),shares:readAmount(shares),realized:readAmount(realized),text};
  });
}

// Reuse the same aggregation and currency denominators in the formal API and the
// connector, which can combine only the authorized named reports for this chat.
export function renderPositionRows(books) {
  const holdings = new Map();
  const add = (a,b) => a === null || b === null ? null : a+b;
  for (const book of books) {
    const {ticker,currency} = book;
    const key = JSON.stringify([currency,ticker]);
    const held = holdings.get(key) ?? {ticker,currency,shares:0,cost:0,realized:0};
    held.shares += book.shares;
    held.cost = add(held.cost,book.cost);
    held.realized = add(held.realized,book.realized);
    holdings.set(key,held);
  }
  if (!holdings.size) return [emptyPositions];
  const totals = new Map();
  for (const {currency,cost} of holdings.values()) {
    totals.set(currency,add(totals.has(currency) ? totals.get(currency) : 0,cost));
  }
  const sorted = [...holdings.values()].sort((a,b)=>a.currency.localeCompare(b.currency)||a.ticker.localeCompare(b.ticker));
  const lines = sorted.map(({ticker,currency,shares,cost,realized})=>{
    const total = totals.get(currency);
    const weight = total === null ? '待核' : percent.format(total ? 100*cost/total : 0)+'%';
    const average = cost === null ? null : shares ? cost/shares : 0;
    return [ticker,'净股数 '+format(shares),'均价 '+format(average),'持仓成本 '+format(cost)+' '+currency,
      '已实现盈亏 '+format(realized)+' '+currency,'占比 '+weight].join('｜');
  });
  if (sorted.some(p=>p.realized === null || p.cost === null)) lines.push(unmatchedPositionNote);
  return lines;
}

export function renderGroupPositions(positions) {
  return positions.length ? ['全组持仓与占比（按同币种持仓成本）',...renderPositionRows(positions)].join('\n') : '';
}
