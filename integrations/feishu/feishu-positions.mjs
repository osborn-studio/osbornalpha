// The source ledger is account-wide. A position here belongs only to the analyst
// who authored the recommendation linked to each selected fill.
import {computePositions} from '../../src/lib/portfolio/positions.ts';
import {positionHeading,renderPositionRows} from './feishu-position-report.mjs';

// Postgres timestamps can carry six fraction digits. The shared cost engine
// sorts ISO strings; equal times retain the supplied receipt/UUID order.
export function executionTime(raw) {
  const date = new Date(raw);
  if (!Number.isFinite(date.valueOf())) throw Error('正式成交时间无效。');
  const fraction = /T\d\d:\d\d:\d\d(?:\.(\d{1,6}))?(?:Z|[+-]\d\d:\d\d)$/u.exec(raw);
  if (!fraction) throw Error('正式成交时间无效。');
  return date.toISOString().slice(0,19) + '.' + (fraction[1] ?? '').padEnd(6,'0') + 'Z';
}

function orderFills(a,b) {
  const stamp = a.executed_at.localeCompare(b.executed_at);
  if (stamp) return stamp;
  if (a.eventOrder !== b.eventOrder) {
    if (a.eventOrder == null) return -1;
    if (b.eventOrder == null) return 1;
    return a.eventOrder < b.eventOrder ? -1 : 1;
  }
  return a.id.localeCompare(b.id);
}

function replay(fills) {
  fills.sort(orderFills);
  let net = 0, unmatched = false, knownBasisFrom = 0;
  for (const [index,fill] of fills.entries()) {
    const change = fill.direction === 'buy' ? fill.quantity : -fill.quantity;
    // Fractional shares can leave a one-ULP remainder when a lot closes.
    const closes = Math.sign(net) === -Math.sign(change) &&
      Math.abs(net+change) <= Number.EPSILON*Math.max(Math.abs(net),fill.quantity)*4;
    if (closes && net > 0 && net !== fill.quantity) fills[index] = {...fill,quantity:net};
    net = closes ? 0 : net+change;
    if (net < 0) {
      unmatched = true;
      knownBasisFrom = null;
    } else if (net === 0 && knownBasisFrom === null) {
      // Future opening lots have an independent basis once the attributed book is flat.
      knownBasisFrom = index+1;
    }
  }
  const {ticker,currency} = fills[0];
  if (knownBasisFrom === null || knownBasisFrom === fills.length) return {ticker,currency,shares:net,cost:net === 0 ? 0 : null,realized:null};
  const [p] = computePositions(knownBasisFrom ? fills.slice(knownBasisFrom) : fills);
  return {ticker,currency,shares:p.shares,cost:p.shares*p.avgCost,realized:unmatched ? null : p.realizedPnl};
}

export function renderPositions(fills) {
  const books = new Map();
  for (const fill of fills) {
    const key = JSON.stringify([fill.analystId,fill.currency,fill.ticker]);
    if (!books.has(key)) books.set(key,[]);
    books.get(key).push(fill);
  }

  return [positionHeading,...renderPositionRows(Array.from(books.values(),replay))].join('\n');
}
