// Local execution journal. An analyst's confirmed fills are independent of suggested actions and market replays.
import { createHash, randomUUID } from 'node:crypto';
import { isUuid, parseTradeInput } from '../../src/lib/portfolio/validate.ts';
import { computePositions } from '../../src/lib/portfolio/positions.ts';
import { inferCoreMarket, normalizeSecurityTicker } from '../../src/lib/securities/ticker.ts';
import { currencyCodeOfMarket } from '../../src/lib/utils.ts';

function fail(status, message) {
  throw Object.assign(new Error(message), {status});
}

function tradeFields(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields) || !isUuid(fields.requestId)) {
    fail(400, '成交请求编号无效，请刷新页面后重试。');
  }
  if (typeof fields.ticker !== 'string') fail(400, '请填写成交标的。');
  const market = fields.market ?? inferCoreMarket(fields.ticker);
  const ticker = ['A','HK','US'].includes(market) && normalizeSecurityTicker(fields.ticker, market);
  if (!ticker) fail(400, '标的代码与所选市场不匹配。');
  const currency = currencyCodeOfMarket(market);
  if (fields.currency != null && fields.currency !== currency) fail(400, '成交币种须与标的市场一致。');
  if (!Number.isFinite(fields.price) || fields.price <= 0) fail(400, '成交价须为正数。');
  if (!Number.isFinite(fields.quantity) || fields.quantity <= 0) fail(400, '成交数量须为正数。');
  if (fields.fee != null && (!Number.isFinite(fields.fee) || fields.fee < 0)) fail(400, '手续费须为非负数。');
  if (!['buy','sell'].includes(fields.direction)) fail(400, '请选择买入或卖出。');
  const parsed = parseTradeInput({...fields, ticker, currency});
  if (!parsed.ok) fail(400, '交易记录未通过校验：' + parsed.error);
  const {direction,price,quantity,fee,note} = parsed.value;
  let executedAt = null;
  if (fields.executed_at != null) {
    if (typeof fields.executed_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(fields.executed_at)) {
      fail(400, '成交时间须包含时区，或留空按现在登记。');
    }
    executedAt = new Date(fields.executed_at).toISOString();
  }
  return {market,ticker,currency,direction,price,quantity,fee,executed_at:executedAt,note:note || null};
}

function integerFills(trades) {
  // Weighted-cost arithmetic uses whole subshares so 0.3 shares sold in lots of 0.1 and 0.2 close exactly.
  const quantities = trades.map(({quantity}) => {
    const [mantissa, exponent = '0'] = String(quantity).split('e');
    return {mantissa, exponent:Number(exponent), digits:(mantissa.split('.')[1] || '').length};
  });
  const decimals = quantities.reduce((max, n) => Math.max(max, n.digits - n.exponent), 0);
  const scale = 10 ** decimals;
  const fills = decimals ? trades.map((trade, i) => {
    const n = quantities[i];
    return {...trade, price:trade.price / scale, quantity:Number(n.mantissa + 'e' + (n.exponent + decimals))};
  }) : trades;
  if (!Number.isFinite(scale) || !Number.isSafeInteger(fills.reduce((sum, f) => sum + f.quantity, 0))) {
    fail(400, '该成交数量与当前流水合计超出了可精确计算的份额范围。');
  }
  return {fills, scale};
}

function positionFor(trades) {
  const {role, market} = trades[0];
  const {fills, scale} = integerFills(trades);
  let position;
  try {
    [position] = computePositions(fills);
    position.shares /= scale;
    position.avgCost *= scale;
  } catch (error) {
    if (error.message.startsWith('oversell:')) {
      fail(400, '卖出数量超过该成交时点的可用持仓，请核对数量与成交时间。');
    }
    throw error;
  }
  if (![position.shares,position.avgCost,position.realizedPnl].every(Number.isFinite)) {
    fail(400, '成交金额或数量超出了可计算范围。');
  }
  return {role,market,ticker:position.ticker,currency:position.currency,shares:position.shares,
    avg_cost:position.avgCost,realized_pnl:position.realizedPnl,opened_at:position.openedAt,closed_at:position.closedAt};
}

const executionTradesSchema = `CREATE TABLE IF NOT EXISTS execution_trades (
  seq INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, role TEXT NOT NULL CHECK(role <> 'PM'),
  request_id TEXT NOT NULL, fingerprint TEXT NOT NULL, ticker TEXT NOT NULL, executed_at TEXT NOT NULL, entry TEXT NOT NULL,
  UNIQUE(role,request_id));`;

export function openTradeStore(db, transaction, isAnalyst = role => role === 'A' || role === 'B') {
  db.exec(executionTradesSchema);
  const previous = db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='execution_trades'").get();
  if (previous.sql.includes("CHECK(role IN ('A','B'))")) {
    transaction(() => {
      db.exec('ALTER TABLE execution_trades RENAME TO execution_trades_two_roles');
      db.exec(executionTradesSchema);
      db.exec(`INSERT INTO execution_trades(seq,id,role,request_id,fingerprint,ticker,executed_at,entry)
        SELECT seq,id,role,request_id,fingerprint,ticker,executed_at,entry FROM execution_trades_two_roles;
        DROP TABLE execution_trades_two_roles;`);
    });
  }
  db.exec(`CREATE INDEX IF NOT EXISTS execution_trades_history ON execution_trades(role,ticker,executed_at,seq);
    CREATE TABLE IF NOT EXISTS execution_positions (
      role TEXT NOT NULL, ticker TEXT NOT NULL, position TEXT NOT NULL, PRIMARY KEY(role,ticker));`);
  const existing = db.prepare('SELECT fingerprint,entry FROM execution_trades WHERE role=? AND request_id=?');
  const history = db.prepare('SELECT entry FROM execution_trades WHERE role=? AND ticker=? ORDER BY executed_at, seq');
  const record = db.prepare(`INSERT INTO execution_trades (id,role,request_id,fingerprint,ticker,executed_at,entry)
    VALUES (?,?,?,?,?,?,?)`);
  const updatePosition = db.prepare(`INSERT INTO execution_positions (role,ticker,position) VALUES (?,?,?)
    ON CONFLICT(role,ticker) DO UPDATE SET position=excluded.position`);

  function create(role, fields) {
    if (!isAnalyst(role)) fail(403, '仅分析师可以登记本人的成交。');
    const input = tradeFields(fields);
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return transaction(() => {
      const prior = existing.get(role, fields.requestId);
      if (prior) {
        if (prior.fingerprint !== fingerprint) fail(409, '同一请求编号已有不同的成交内容。');
        return JSON.parse(prior.entry);
      }
      const createdAt = new Date().toISOString();
      const trade = {...input,id:randomUUID(),role,executed_at:input.executed_at ?? createdAt,created_at:createdAt};
      const trades = history.all(role, trade.ticker).map(row => JSON.parse(row.entry));
      const position = positionFor([...trades, trade]);
      record.run(trade.id, role, fields.requestId, fingerprint, trade.ticker, trade.executed_at, JSON.stringify(trade));
      updatePosition.run(role, trade.ticker, JSON.stringify(position));
      return trade;
    });
  }

  function view(role) {
    if (role !== 'PM' && !isAnalyst(role)) fail(403, '无法访问成交记录。');
    const trades = db.prepare(`SELECT entry FROM execution_trades
      WHERE ?='PM' OR role=? ORDER BY executed_at DESC,seq DESC`).all(role,role);
    const positions = db.prepare(`SELECT position FROM execution_positions
      WHERE ?='PM' OR role=? ORDER BY role,ticker`).all(role,role);
    return {trades:trades.map(row => JSON.parse(row.entry)),positions:positions.map(row => JSON.parse(row.position))};
  }

  return {create,view};
}
