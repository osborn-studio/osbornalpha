// Mirror the verified Excel report into the group's 多维表格 (rows come from xlsx-report/bitable.py,
// read out of the workbook). The connector creates missing tables and fields itself, then upserts by
// each table's key field: only changed records are written, and 当前持仓 drops rows no longer held.
// Writes go through the app's OpenAPI (one call per 500 records); the schema check is cached locally.
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import * as Lark from '@larksuiteoapi/node-sdk';

const batchSize = 500;
const api = '/open-apis/bitable/v1/apps/';

/** The configured base: FEISHU_REPORT_BITABLE_URL must be a cloud-drive base link (…/base/<app_token>). */
export function bitableTarget(env = process.env) {
  const raw = String(env.FEISHU_REPORT_BITABLE_URL ?? '').trim();
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { throw Error('FEISHU_REPORT_BITABLE_URL 不是有效链接。'); }
  if (url.protocol !== 'https:' || !/(?:^|\.)(?:feishu\.cn|larksuite\.com)$/u.test(url.hostname)) {
    throw Error('FEISHU_REPORT_BITABLE_URL 必须是飞书多维表格链接。');
  }
  const match = url.pathname.match(/^\/base\/([A-Za-z0-9]{10,64})\/?$/u);
  if (!match) throw Error('请使用云空间中的多维表格链接（/base/…）；知识库中的多维表格暂不支持。');
  return {appToken: match[1], url: `${url.origin}/base/${match[1]}`};
}

/** OpenAPI caller over the Lark SDK client (it fetches and caches the tenant token). */
export function larkBitableCall(env = process.env, sdk = Lark) {
  const client = new sdk.Client({appId: env.FEISHU_APP_ID, appSecret: env.FEISHU_APP_SECRET, domain: sdk.Domain.Feishu,
    loggerLevel: sdk.LoggerLevel?.error});
  return async (method, url, {params, data} = {}) => {
    let response;
    try {
      response = await client.request({method, url, params, data});
    } catch (error) {
      response = error?.response?.data;
      if (!response) throw Error('多维表格接口无响应。');
    }
    if (response?.code !== 0) throw Object.assign(Error(`多维表格接口返回 ${response?.code}：${response?.msg ?? ''}`), {code: response?.code});
    return response.data ?? {};
  };
}

const text = value => Array.isArray(value) ? value.map(part => part?.text ?? '').join('')
  : value && typeof value === 'object' ? JSON.stringify(value) : value == null ? '' : String(value);

function same(stored, wanted) {
  if (wanted && typeof wanted === 'object') return stored?.link === wanted.link && text(stored?.text) === wanted.text;
  if (typeof wanted === 'number') return typeof stored === 'number' && Math.abs(stored - wanted) <= 1e-9 * Math.max(1, Math.abs(wanted));
  return text(stored) === String(wanted);
}

async function pages(call, url, params) {
  const items = [];
  let pageToken;
  do {
    const data = await call('GET', url, {params: {...params, ...(pageToken && {page_token: pageToken})}});
    items.push(...(data.items ?? []));
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);
  return items;
}

const chunks = items => Array.from({length: Math.ceil(items.length / batchSize)}, (_, i) => items.slice(i * batchSize, (i + 1) * batchSize));

async function ensureSchema(call, appToken, tables) {
  const existing = await pages(call, `${api}${appToken}/tables`, {page_size: 100});
  const ids = {};
  for (const table of tables) {
    const found = existing.find(item => item.name === table.name);
    if (!found) {
      const created = await call('POST', `${api}${appToken}/tables`,
        {data: {table: {name: table.name, default_view_name: '全部', fields: table.fields}}});
      ids[table.name] = created.table_id;
      continue;
    }
    ids[table.name] = found.table_id;
    const have = new Set((await pages(call, `${api}${appToken}/tables/${found.table_id}/fields`, {page_size: 100})).map(f => f.field_name));
    for (const field of table.fields) {
      if (!have.has(field.field_name)) await call('POST', `${api}${appToken}/tables/${found.table_id}/fields`, {data: field});
    }
  }
  return ids;
}

async function writeTable(call, appToken, tableId, table) {
  const base = `${api}${appToken}/tables/${tableId}/records`;
  const existing = await pages(call, base, {page_size: 500});
  const byKey = new Map();
  for (const record of existing) {
    const key = text(record.fields?.[table.key]);
    if (key && !byKey.has(key)) byKey.set(key, record);
  }
  const creates = [], updates = [];
  for (const row of table.rows) {
    const record = byKey.get(row[table.key]);
    if (!record) creates.push({fields: row});
    else if (Object.entries(row).some(([field, value]) => !same(record.fields?.[field], value))) updates.push({record_id: record.record_id, fields: row});
  }
  for (const part of chunks(updates)) await call('POST', `${base}/batch_update`, {data: {records: part}});
  for (const part of chunks(creates)) await call('POST', `${base}/batch_create`, {data: {records: part}});
  let deleted = 0;
  if (table.replace) {
    const keep = new Set(table.rows.map(row => row[table.key]));
    const stale = existing.filter(record => !keep.has(text(record.fields?.[table.key]))).map(record => record.record_id);
    for (const part of chunks(stale)) await call('POST', `${base}/batch_delete`, {data: {records: part}});
    deleted = stale.length;
  }
  return {created: creates.length, updated: updates.length, deleted};
}

/** Create or extend the tables when needed, then upsert every table's rows. Returns per-table counts. */
export async function syncBitable({call, appToken, payload, statePath}) {
  const schema = createHash('sha256').update(JSON.stringify(payload.tables.map(t => [t.name, t.key, t.fields]))).digest('hex');
  let state = null;
  try { state = JSON.parse(readFileSync(statePath, 'utf8')); } catch { /* first run */ }
  const fresh = async () => {
    state = {appToken, schema, tables: await ensureSchema(call, appToken, payload.tables)};
    mkdirSync(dirname(statePath), {recursive: true});
    writeFileSync(statePath, JSON.stringify(state, null, 1));
  };
  if (state?.appToken !== appToken || state?.schema !== schema) await fresh();
  const writeAll = async () => {
    const counts = {};
    for (const table of payload.tables) counts[table.name] = await writeTable(call, appToken, state.tables[table.name], table);
    return counts;
  };
  try {
    return await writeAll();
  } catch (error) {
    // A table or field removed by hand: rebuild the cached schema once and retry.
    await fresh();
    return writeAll().catch(() => { throw error; });
  }
}
