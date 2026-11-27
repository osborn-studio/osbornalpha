import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {bitableTarget, syncBitable} from './feishu-bitable-report.mjs';

const app = 'bascnAbCdEfGhIjKlMn';

// In-memory Bitable: tables, fields and records, served through the same paths as the OpenAPI.
function fakeBitable({pageSize = 500} = {}) {
  const tables = new Map();
  const calls = [];
  let next = 0;
  const id = prefix => prefix + (++next);
  async function call(method, url, {params = {}, data} = {}) {
    calls.push(`${method} ${url.replace(`/open-apis/bitable/v1/apps/${app}`, '')}`);
    const [, , , , , appToken, , tableId, kind, action] = url.split('/');
    assert.equal(appToken, app);
    if (!tableId) {
      if (method === 'GET') return {items: [...tables.values()].map(t => ({table_id: t.id, name: t.name})), has_more: false};
      const t = {id: id('tbl'), name: data.table.name, fields: data.table.fields.map(f => ({...f})), records: new Map()};
      tables.set(t.id, t);
      return {table_id: t.id};
    }
    const table = tables.get(tableId);
    if (!table) throw Object.assign(Error('table not found'), {code: 1254004});
    if (kind === 'fields') {
      if (method === 'GET') return {items: table.fields, has_more: false};
      table.fields.push({...data});
      return {field: data};
    }
    if (method === 'GET') {
      const all = [...table.records.entries()].map(([record_id, fields]) => ({record_id, fields: {...fields}}));
      const start = Number(params.page_token ?? 0);
      const page = all.slice(start, start + pageSize);
      const more = start + pageSize < all.length;
      return {items: page, has_more: more, ...(more && {page_token: String(start + pageSize)})};
    }
    assert.ok(data.records.length <= 500);
    if (action === 'batch_create') for (const r of data.records) table.records.set(id('rec'), {...r.fields});
    if (action === 'batch_update') for (const r of data.records) table.records.set(r.record_id, {...table.records.get(r.record_id), ...r.fields});
    if (action === 'batch_delete') for (const r of data.records) table.records.delete(r);
    return {};
  }
  const rows = name => [...[...tables.values()].find(t => t.name === name).records.values()];
  return {call, calls, tables, rows};
}

const payload = (holdings, summaryRows = [{汇总键: '2026-11-27 全组', 范围: '全组', 'Long（%）': 0.0042}]) => ({
  reportDate: '2026-11-27',
  tables: [
    {name: '每日汇总', key: '汇总键', replace: false, fields: [{field_name: '汇总键', type: 1}, {field_name: '范围', type: 3}, {field_name: 'Long（%）', type: 2, property: {formatter: '0.0000'}}, {field_name: 'Excel', type: 15}], rows: summaryRows},
    {name: '当前持仓', key: '持仓键', replace: true, fields: [{field_name: '持仓键', type: 1}, {field_name: '股数', type: 2}], rows: holdings},
  ],
});

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'bitable-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return {statePath: join(dir, 'state.json')};
}

test('accepts only cloud-drive base links', () => {
  assert.equal(bitableTarget({}), null);
  assert.deepEqual(bitableTarget({FEISHU_REPORT_BITABLE_URL: `https://osborn.feishu.cn/base/${app}?table=tbl1&view=vew1`}),
    {appToken: app, url: `https://osborn.feishu.cn/base/${app}`});
  assert.throws(() => bitableTarget({FEISHU_REPORT_BITABLE_URL: 'https://osborn.feishu.cn/wiki/wikcnXyz1234567'}), /知识库/u);
  assert.throws(() => bitableTarget({FEISHU_REPORT_BITABLE_URL: `https://evil.example/base/${app}`}), /飞书多维表格/u);
});

test('first run creates the tables, later runs write only what changed and drop sold holdings', async t => {
  const {statePath} = setup(t);
  const base = fakeBitable();
  const first = await syncBitable({call: base.call, appToken: app, statePath,
    payload: payload([{持仓键: '全组 300 HK', 股数: 100}, {持仓键: '全组 1810 HK', 股数: 200}])});
  assert.deepEqual(first, {每日汇总: {created: 1, updated: 0, deleted: 0}, 当前持仓: {created: 2, updated: 0, deleted: 0}});
  assert.equal(base.tables.size, 2);

  base.calls.length = 0;
  const second = await syncBitable({call: base.call, appToken: app, statePath,
    payload: payload([{持仓键: '全组 300 HK', 股数: 100}, {持仓键: '全组 1810 HK', 股数: 300}])});
  assert.deepEqual(second.当前持仓, {created: 0, updated: 1, deleted: 0});
  assert.deepEqual(second.每日汇总, {created: 0, updated: 0, deleted: 0});
  assert.ok(!base.calls.some(c => c.startsWith('GET /tables') && !c.includes('/records')), 'schema check is cached');

  const third = await syncBitable({call: base.call, appToken: app, statePath, payload: payload([{持仓键: '全组 300 HK', 股数: 100}],
    [{汇总键: '2026-11-27 全组', 范围: '全组', 'Long（%）': 0.0042}, {汇总键: '2026-11-28 全组', 范围: '全组', 'Long（%）': 0.005}])});
  assert.deepEqual(third.当前持仓, {created: 0, updated: 0, deleted: 1});
  assert.deepEqual(base.rows('当前持仓'), [{持仓键: '全组 300 HK', 股数: 100}]);
  assert.equal(base.rows('每日汇总').length, 2); // the daily summary accumulates
});

test('adds fields a person removed and tables missing from an existing base', async t => {
  const {statePath} = setup(t);
  const base = fakeBitable();
  await syncBitable({call: base.call, appToken: app, statePath, payload: payload([])});
  const summary = [...base.tables.values()].find(x => x.name === '每日汇总');
  summary.fields = summary.fields.filter(f => f.field_name !== 'Excel');
  const extended = payload([]);
  extended.tables[0].fields.push({field_name: '备注', type: 1}); // a new schema version re-checks fields
  await syncBitable({call: base.call, appToken: app, statePath, payload: extended});
  assert.deepEqual(summary.fields.map(f => f.field_name), ['汇总键', '范围', 'Long（%）', 'Excel', '备注']);
});

test('rebuilds the cached schema when a table was deleted by hand', async t => {
  const {statePath} = setup(t);
  const base = fakeBitable();
  await syncBitable({call: base.call, appToken: app, statePath, payload: payload([{持仓键: '全组 300 HK', 股数: 100}])});
  const holdings = [...base.tables.values()].find(x => x.name === '当前持仓');
  base.tables.delete(holdings.id);
  const counts = await syncBitable({call: base.call, appToken: app, statePath, payload: payload([{持仓键: '全组 300 HK', 股数: 100}])});
  assert.deepEqual(counts.当前持仓, {created: 1, updated: 0, deleted: 0});
});

test('pages through large tables and writes in batches of 500', async t => {
  const {statePath} = setup(t);
  const base = fakeBitable({pageSize: 400});
  const many = Array.from({length: 1200}, (_, i) => ({持仓键: 'k' + i, 股数: i}));
  await syncBitable({call: base.call, appToken: app, statePath, payload: payload(many)});
  assert.equal(base.rows('当前持仓').length, 1200);
  const again = await syncBitable({call: base.call, appToken: app, statePath, payload: payload(many.map(r => ({...r, 股数: r.股数 + 1})))});
  assert.deepEqual(again.当前持仓, {created: 0, updated: 1200, deleted: 0});
});

test('compares stored rich text and links with the values to write', async t => {
  const {statePath} = setup(t);
  const base = fakeBitable();
  const row = {汇总键: '2026-11-27 全组', 范围: '全组', 'Long（%）': 0.0042, Excel: {text: '2026-11-27.xlsx', link: 'https://osbornalpha.com/x'}};
  await syncBitable({call: base.call, appToken: app, statePath, payload: payload([], [row])});
  const stored = [...[...base.tables.values()][0].records.values()][0];
  stored.汇总键 = [{type: 'text', text: '2026-11-27 全组'}]; // how the API returns multi-line text
  const counts = await syncBitable({call: base.call, appToken: app, statePath, payload: payload([], [row])});
  assert.deepEqual(counts.每日汇总, {created: 0, updated: 0, deleted: 0});
});
