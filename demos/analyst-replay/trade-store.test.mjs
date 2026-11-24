import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openTradeStore } from './trade-store.mjs';

function journal(t, filename = ':memory:') {
  const db = new DatabaseSync(filename);
  t.after(() => db.close());
  return {db, store:openTradeStore(db, fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  })};
}

const fill = (overrides = {}) => ({
  requestId:randomUUID(),ticker:'700',market:'HK',direction:'buy',price:100,quantity:10,fee:5,
  executed_at:'2026-11-23T09:15:00+08:00',note:'按成交回报登记',...overrides,
});

test('records Beijing fills as separate private portfolios, computes fee-adjusted cost and realized PnL', t => {
  const {store} = journal(t);
  const buy = store.create('A',fill({role:'B'}));
  assert.equal(buy.role,'A');
  assert.equal(buy.executed_at,'2026-11-23T01:15:00.000Z');
  assert.equal(buy.note,'按成交回报登记');
  assert.equal(buy.currency,'HKD');
  assert.equal(buy.ticker,'00700.HK');
  assert.equal(store.view('B').trades.length,0);

  const sell = store.create('A',fill({ticker:'00700.hk',direction:'sell',price:120,quantity:4,fee:3,executed_at:'2026-11-23T10:20:00+08:00'}));
  const us = store.create('B',fill({ticker:'nvda',market:'US',price:200}));
  const china = store.create('B',fill({ticker:'SH600519',market:undefined}));
  assert.equal(us.currency,'USD');
  assert.equal(china.currency,'CNY');
  assert.equal(china.ticker,'600519.SH');
  assert.deepEqual(store.view('A').trades.map(row => row.id),[sell.id,buy.id]);
  assert.deepEqual(store.view('A').positions,[{
    role:'A',market:'HK',ticker:'00700.HK',currency:'HKD',shares:6,avg_cost:100.5,realized_pnl:75,
    opened_at:buy.executed_at,closed_at:null,
  }]);
  assert.deepEqual(store.view('B').trades.map(row => row.role),['B','B']);
  assert.equal(store.view('PM').trades.length,4);
  assert.equal(store.view('PM').positions.length,3);
  assert.throws(() => store.create('PM',fill()), {status:403});
});

test('enforces historical availability and keeps ledger and holdings atomic when concurrent sells compete', async t => {
  const {db,store} = journal(t);
  const buy = store.create('A',fill());
  const sell = {direction:'sell',price:130,quantity:7,fee:1};
  assert.throws(() => store.create('A',fill({...sell,executed_at:'2026-11-23T09:10:00+08:00'})), {status:400});
  assert.equal(store.view('A').trades.length,1);
  const results = await Promise.allSettled([1,2].map(() => Promise.resolve().then(() => store.create('A',fill(sell)))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length,1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status,400);
  assert.equal(store.view('A').positions[0].shares,3);
  assert.equal(store.view('A').trades.length,2);

  db.exec("CREATE TRIGGER reject_position BEFORE UPDATE ON execution_positions BEGIN SELECT RAISE(ABORT,'test rollback'); END;");
  assert.throws(() => store.create('A',fill({price:95})),/test rollback/);
  assert.equal(store.view('A').trades.length,2);
  assert.equal(store.view('A').positions[0].opened_at,buy.executed_at);
});

test('request replay is deduplicated across process opens, time omission, symbol aliases and timezones', async t => {
  const dir = mkdtempSync(join(tmpdir(),'osborn-trade-store-'));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  const path = join(dir,'trades.sqlite');
  const {store} = journal(t,path);
  const request = fill({executed_at:undefined});
  const from = Date.now();
  const [a,b] = await Promise.all([1,2].map(() => Promise.resolve().then(() => store.create('A',request))));
  assert.equal(a.id,b.id);
  assert.ok(Date.parse(a.executed_at) >= from && Date.parse(a.executed_at) <= Date.now());
  const restarted = journal(t,path).store;
  assert.deepEqual(restarted.create('A',{...request,ticker:'0700.HK'}),a);
  assert.throws(() => restarted.create('A',{...request,quantity:11}), {status:409});
  const withOffset = fill();
  const buy = restarted.create('A',withOffset);
  assert.deepEqual(restarted.create('A',{...withOffset,executed_at:'2026-11-22T17:15:00-08:00'}),buy);
  assert.equal(restarted.create('B',request).role,'B');
  assert.equal(restarted.view('PM').trades.length,3);
});

test('fractional exits clear the holding and preserve historic realized PnL after reopening', t => {
  const {store} = journal(t);
  store.create('A',fill({quantity:0.1,fee:0}));
  store.create('A',fill({quantity:0.2,fee:0}));
  assert.throws(() => store.create('A',fill({direction:'sell',quantity:0.300001,fee:0})), {status:400});
  assert.throws(() => store.create('A',fill({direction:'sell',quantity:0.30000000000000004,fee:0})), {status:400});
  const exit = store.create('A',fill({direction:'sell',quantity:0.3,fee:0}));
  const a = store.view('A').positions[0];
  assert.equal(a.shares,0);
  assert.equal(a.closed_at,exit.executed_at);

  store.create('B',fill({quantity:0.3,fee:0}));
  store.create('B',fill({direction:'sell',price:110,quantity:0.1,fee:0}));
  const end = store.create('B',fill({direction:'sell',price:120,quantity:0.2,fee:0}));
  const closed = store.view('B').positions[0];
  assert.equal(closed.shares,0);
  assert.equal(closed.closed_at,end.executed_at);
  assert.ok(Math.abs(closed.realized_pnl - 5) < 1e-8);
  store.create('B',fill({price:90,quantity:2,fee:2}));
  assert.deepEqual(store.view('B').positions[0],{...closed,shares:2,avg_cost:91,closed_at:null});
});

test('invalid price, fee, shares, market and ambiguous fill time leave the ledger empty', t => {
  const {store} = journal(t);
  for (const fields of [{price:0},{price:Infinity},{quantity:NaN},{quantity:-1},{fee:-12},{fee:'2'},
    {market:'A'},{market:'XX'},{currency:'USD'},{executed_at:'2026-11-23T17:30'},
    {executed_at:7},{direction:'hold'},{requestId:'bad'}]) {
    assert.throws(() => store.create('A',fill(fields)),{status:400});
  }
  assert.throws(() => store.view('X'),{status:403});
  assert.deepEqual(store.view('PM'),{trades:[],positions:[]});
});


test('adds new analyst accounts to the existing ledger without changing prior trades or positions', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE execution_trades (
    seq INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, role TEXT NOT NULL CHECK(role IN ('A','B')),
    request_id TEXT NOT NULL, fingerprint TEXT NOT NULL, ticker TEXT NOT NULL, executed_at TEXT NOT NULL, entry TEXT NOT NULL,
    UNIQUE(role,request_id));
    CREATE TABLE execution_positions (
      role TEXT NOT NULL, ticker TEXT NOT NULL, position TEXT NOT NULL, PRIMARY KEY(role,ticker));`);
  const old = {id:randomUUID(),role:'A',ticker:'00700.HK',direction:'buy'};
  db.prepare("INSERT INTO execution_trades VALUES (12,?,'A','request','fingerprint','00700.HK','2026-11-23T01:15:00.000Z',?)")
    .run(old.id,JSON.stringify(old));
  const position = {role:'A',ticker:'00700.HK',shares:10};
  db.prepare("INSERT INTO execution_positions VALUES ('A','00700.HK',?)").run(JSON.stringify(position));
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); db.exec('COMMIT'); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const added = 'analyst-' + randomUUID();
  const store = openTradeStore(db,transaction,role => ['A','B',added].includes(role));
  assert.deepEqual(store.view('A'),{trades:[old],positions:[position]});
  const entry = store.create(added,fill());
  assert.deepEqual(store.view(added).trades,[entry]);
  assert.equal(store.view('PM').trades.length,2);
  assert.equal(store.view('PM').positions.length,2);
  assert.deepEqual(store.view('B'),{trades:[],positions:[]});
  assert.throws(() => store.view('unknown'),{status:403});
  assert.equal(db.prepare('SELECT seq FROM execution_trades WHERE id=?').get(old.id).seq,12);
  assert.deepEqual(openTradeStore(db,transaction,role => role === added).view(added).trades,[entry]);
});
