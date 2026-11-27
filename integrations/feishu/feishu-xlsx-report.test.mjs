import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {beijingClock, createXlsxReporter, isExportCommand, reportCard} from './feishu-xlsx-report.mjs';

const hook = {mode: 'webhook', chatId: 'oc_bound', url: 'https://open.feishu.cn/open-apis/bot/v2/hook/fixture-123456'};
const groups = [
  {label: '全组', long: 0.000042, held: 1, notional: 8729.91, unrealized: -8.5, realized: 0, valid: 3, adopted: 1, withdrawn: 0, trades: 1, hitRate: null, score: null},
  {label: '示例分析师甲（lina）', long: 0.000042, held: 1, notional: 8729.91, unrealized: -8.5, realized: 0, valid: 3, adopted: 1, withdrawn: 0, trades: 1, hitRate: 0.5, score: 14.7},
];
const ok = file => ({code: 0, result: {status: 'ok', name: '2026-11-27.xlsx', file, tradeDate: '2026-11-27', groups}});

function harness(t, {result, env = {}, at = '2026-11-27T08:40:00Z', delivery = hook, bitableCall} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'xlsx-report-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const file = join(dir, 'report.xlsx');
  writeFileSync(file, Buffer.from([0x50, 0x4b, 3, 4]));
  const calls = {python: [], fetch: []};
  let clock = new Date(at);
  const reporter = createXlsxReporter({
    directory: dir,
    env: {FEISHU_SIMULATION_ORIGIN: 'https://alpha.example', FEISHU_SIMULATION_INGEST_TOKEN: 'i'.repeat(40), FEISHU_REPORT_OUT_DIR: dir, ...env},
    runPython: async args => { calls.python.push(args); return typeof result === 'function' ? result(file) : (result ?? ok(file)); },
    fetchImpl: async (url, options) => {
      calls.fetch.push({url, options, body: options.body && typeof options.body === 'string' ? JSON.parse(options.body) : options.body});
      if (options.method === 'PUT') return new Response(JSON.stringify({name: '2026-11-27.xlsx', path: '/analyst/report/files/2026-11-27.xlsx'}), {status: 200});
      return new Response(JSON.stringify({code: 0}), {status: 200});
    },
    readDelivery: () => delivery,
    now: () => clock,
    log: () => {},
    ...(bitableCall && {bitableCall: () => bitableCall}),
  });
  return {reporter, calls, dir, setNow: value => { clock = new Date(value); }};
}

test('recognizes only explicit export requests', () => {
  for (const text of ['导出报表', '导出 Excel', '请导出一下报表', '生成今天的报表', '发一份模拟组合报告', '出报表！']) assert.ok(isExportCommand(text), text);
  for (const text of ['报表里小米的仓位是多少', '导出', '不要导出报表了', '帮我看看报表', '']) assert.ok(!isExportCommand(text), text);
});

test('Beijing clock crosses the date line from Pacific time', () => {
  assert.deepEqual(beijingClock(new Date('2026-11-27T08:35:00Z')), {date: '2026-11-27', weekday: 5, minutes: 16 * 60 + 35});
  assert.deepEqual(beijingClock(new Date('2026-11-27T17:00:00Z')), {date: '2026-11-28', weekday: 6, minutes: 60});
});

test('the card carries the key figures and two links within the custom bot limit', () => {
  const card = reportCard({tradeDate: '2026-11-27', groups}, {downloadUrl: 'https://x/d', siteUrl: 'https://x/s'});
  const text = JSON.stringify(card);
  assert.equal(card.msg_type, 'interactive');
  assert.match(card.card.body.elements[0].content, /Long 0\.0042%｜持仓 1 只｜名义 ¥8,730/u);
  assert.match(card.card.body.elements[0].content, /示例分析师甲（lina）\*\*　Long 0\.0042%.*命中率 50\.0%/u);
  assert.match(text, /正式系统/u); // the group bot's keyword
  assert.deepEqual(card.card.body.elements.slice(1).map(b => b.behaviors[0].default_url), ['https://x/d', 'https://x/s']);
  assert.ok(Buffer.byteLength(text) < 18000);
});

test('stores the workbook, then posts the card with shared-login links', async t => {
  const h = harness(t, {env: {FEISHU_SHARED_LOGIN_URL: 'https://osbornalpha.com/auth/go/' + 'k'.repeat(48)}});
  assert.deepEqual(await h.reporter.run(), {status: 'sent', name: '2026-11-27.xlsx'});
  const [put, post] = h.calls.fetch;
  assert.equal(put.url, 'https://alpha.example/api/integrations/feishu/reports/2026-11-27.xlsx');
  assert.equal(put.options.headers.authorization, 'Bearer ' + 'i'.repeat(40));
  assert.equal(post.url, hook.url);
  const [download, site] = post.body.card.body.elements.slice(1).map(b => b.behaviors[0].default_url);
  assert.equal(download, 'https://osbornalpha.com/auth/go/' + 'k'.repeat(48) + '?next=%2Fanalyst%2Freport%2Ffiles%2F2026-11-27.xlsx');
  assert.equal(site, 'https://osbornalpha.com/auth/go/' + 'k'.repeat(48) + '?next=%2Fanalyst');
});

test('with FEISHU_OPEN_LINKS_IN_FEISHU the card buttons open inside a Feishu window', async t => {
  const h = harness(t, {env: {FEISHU_SHARED_LOGIN_URL: 'https://osbornalpha.com/auth/go/' + 'k'.repeat(48), FEISHU_OPEN_LINKS_IN_FEISHU: 'true'}});
  await h.reporter.run();
  const site = h.calls.fetch[1].body.card.body.elements[2].behaviors[0].default_url;
  assert.equal(site, 'https://applink.feishu.cn/client/web_url/open?mode=window&url=' +
    encodeURIComponent('https://osbornalpha.com/auth/go/' + 'k'.repeat(48) + '?next=%2Fanalyst'));
});

test('without a shared login link the card points at the site directly', async t => {
  const h = harness(t);
  await h.reporter.run();
  const download = h.calls.fetch[1].body.card.body.elements[1].behaviors[0].default_url;
  assert.equal(download, 'https://alpha.example/analyst/report/files/2026-11-27.xlsx');
});

test('a workbook that fails verification is reported, never uploaded', async t => {
  const h = harness(t, {result: {code: 2, result: {status: 'verify_failed', tradeDate: '2026-11-27', problems: ['a', 'b']}}});
  assert.equal((await h.reporter.run()).status, 'verify_failed');
  assert.equal(h.calls.fetch.length, 1);
  assert.match(h.calls.fetch[0].body.content.text, /^正式报表：2026-11-27 的报表未发送：核对未通过（2 处）/u);
});

test('the scheduled run sends once per Beijing weekday after the close', async t => {
  const h = harness(t, {at: '2026-11-27T08:00:00Z'}); // 16:00 Beijing, before the window
  assert.equal((await h.reporter.run({scheduled: true})).status, 'skipped');
  h.setNow('2026-11-27T08:35:00Z');
  assert.equal((await h.reporter.run({scheduled: true})).status, 'sent');
  assert.deepEqual(h.calls.python.at(-1), ['--out-dir', h.dir, '--scheduled']);
  assert.deepEqual(JSON.parse(readFileSync(join(h.dir, 'sent.json'), 'utf8')), {'2026-11-27': '2026-11-27.xlsx'});
  h.setNow('2026-11-27T09:35:00Z');
  assert.equal((await h.reporter.run({scheduled: true})).status, 'skipped');
  h.setNow('2026-11-28T08:35:00Z'); // Saturday in Beijing
  assert.equal((await h.reporter.run({scheduled: true})).status, 'skipped');
  assert.equal(h.calls.python.length, 1);
});

test('refuses to run without a webhook delivery', async t => {
  const h = harness(t, {delivery: {mode: 'app', chatId: 'oc_bound'}});
  assert.equal((await h.reporter.run()).status, 'error');
  assert.equal(h.calls.python.length, 0);
});

test('only bound members addressing the bot start a report, once per event and minute', async t => {
  const h = harness(t);
  const bindings = {chatId: 'oc_bound', analystBySender: {ou_analyst: 'analyst-a'}, approverIds: ['ou_pm']};
  const ask = (over = {}) => h.reporter.handle({eventId: 'ev1', chatId: 'oc_bound', senderId: 'ou_analyst', text: '导出报表', directedToBot: true, ...over}, bindings);
  assert.equal(ask({directedToBot: false}), false);
  assert.equal(ask({senderId: 'ou_stranger'}), false);
  assert.equal(ask({chatId: 'oc_other'}), false);
  assert.equal(ask({text: '报表里有什么'}), false);
  assert.equal(ask(), true);
  assert.equal(ask(), true); // redelivery of the same event
  assert.equal(ask({eventId: 'ev2', senderId: 'ou_pm'}), true); // within a minute: acknowledged, not rerun
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(h.calls.python.length, 1);
});

test('mirrors the verified rows into the 多维表格 and adds its button, Excel link included', async t => {
  const written = [];
  const call = async (method, url, {data} = {}) => {
    if (method === 'GET' && url.endsWith('/tables')) return {items: [], has_more: false};
    if (method === 'POST' && url.endsWith('/tables')) return {table_id: 'tbl_' + data.table.name};
    if (method === 'GET') return {items: [], has_more: false};
    written.push({url, records: data.records});
    return {};
  };
  const h = harness(t, {
    env: {FEISHU_REPORT_BITABLE_URL: 'https://osborn.feishu.cn/base/bascnAbCdEfGhIjKlMn?table=tblx'},
    bitableCall: call,
    result: file => {
      const rows = join(h.dir, 'rows.json');
      writeFileSync(rows, JSON.stringify({reportDate: '2026-11-27', tables: [
        {name: '每日汇总', key: '汇总键', replace: false, fields: [{field_name: '汇总键', type: 1}, {field_name: 'Excel', type: 15}], rows: [{汇总键: '2026-11-27 全组'}]},
      ]}));
      return {code: 0, result: {...ok(file).result, bitable: rows}};
    },
  });
  assert.equal((await h.reporter.run()).status, 'sent');
  assert.deepEqual(written, [{url: '/open-apis/bitable/v1/apps/bascnAbCdEfGhIjKlMn/tables/tbl_每日汇总/records/batch_create',
    records: [{fields: {汇总键: '2026-11-27 全组', Excel: {text: '2026-11-27.xlsx', link: 'https://alpha.example/analyst/report/files/2026-11-27.xlsx'}}}]}]);
  const buttons = h.calls.fetch.at(-1).body.card.body.elements.slice(1);
  assert.deepEqual(buttons.map(b => b.text.content), ['下载 Excel', '查看多维表格', '打开正式站']);
  assert.equal(buttons[1].behaviors[0].default_url, 'https://osborn.feishu.cn/base/bascnAbCdEfGhIjKlMn');
});

test('a failed 多维表格 update still sends the card, with a note', async t => {
  const h = harness(t, {
    env: {FEISHU_REPORT_BITABLE_URL: 'https://osborn.feishu.cn/base/bascnAbCdEfGhIjKlMn'},
    bitableCall: async () => { throw Object.assign(Error('forbidden'), {code: 91403}); },
    result: file => {
      const rows = join(h.dir, 'rows.json');
      writeFileSync(rows, JSON.stringify({reportDate: '2026-11-27', tables: []}));
      return {code: 0, result: {...ok(file).result, bitable: rows}};
    },
  });
  assert.equal((await h.reporter.run()).status, 'sent');
  const content = h.calls.fetch.at(-1).body.card.body.elements[0].content;
  assert.match(content, /多维表格本次未能更新，请以 Excel 为准。/u);
});
