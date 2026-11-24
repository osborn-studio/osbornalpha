import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openFeishuWorkflow } from './feishu-workflow.mjs';
import { deliverAppPending, hasAppDelivery, recoverAppDelivery } from './delivery.mjs';

const defaultDirectory = fileURLToPath(new URL('../../build/analyst-replay/', import.meta.url));

function bindings(directory) {
  try {
    const config = JSON.parse(readFileSync(join(directory, 'feishu-bindings.json'), 'utf8'));
    if (!config || Array.isArray(config) || typeof config !== 'object') throw Error('身份配置格式无效');
    return config;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function localRegister({role, fields}, port) {
  const base = 'http://127.0.0.1:' + port;
  const request = async (path, body, token) => {
    const headers = {origin: base, 'content-type': 'application/json'};
    if (token) headers.authorization = 'Bearer ' + token;
    if (path === '/api/registrations') headers['x-demo-registration-source'] = 'feishu-app';
    const r = await fetch(base + path, {method:'POST', headers, body:JSON.stringify(body), redirect:'error', signal:AbortSignal.timeout(40000)});
    if (!r.ok) throw Object.assign(Error('Demo 接口返回 HTTP ' + r.status), {status:r.status, retriable:r.status >= 500 || r.status === 429});
    return r.json();
  };
  const session = await request('/api/demo/role', {role});
  if (!session.key) throw Error('未取得 Demo 身份');
  const {entry} = await request('/api/registrations', fields, session.key);
  if (!entry?.id) throw Error('未取得登记回执');
  // The receipt is authoritative even if the optional aggregate cannot be read.
  try {
    const state = await fetch(base + '/api/state', {
      headers:{authorization:'Bearer ' + session.key}, redirect:'error', signal:AbortSignal.timeout(4000),
    });
    if (state.ok) {
      const {registrations} = await state.json();
      const analystStats = registrations?.results?.find(row => row.role === role);
      if (analystStats) return {...entry, analystStats};
    }
  } catch { /* A later refresh can supply the aggregate. */ }
  return entry;
}

async function syncFormal(payload) {
  const target = new URL(process.env.FEISHU_SIMULATION_ORIGIN);
  const local = ['localhost','127.0.0.1','[::1]'].includes(target.hostname);
  if (target.href !== target.origin + '/' || (target.protocol !== 'https:' && !(local && target.protocol === 'http:'))) {
    throw Object.assign(Error('正式系统地址无效'), {retriable:false});
  }
  const token = process.env.FEISHU_SIMULATION_INGEST_TOKEN;
  if (!token) throw Object.assign(Error('正式模拟账户未配置接入凭据'), {retriable:false});
  const r = await fetch(new URL('/api/integrations/feishu/simulation', target), {
    method:'POST', redirect:'error', signal:AbortSignal.timeout(20000),
    headers:{authorization:'Bearer ' + token, 'content-type':'application/json'}, body:JSON.stringify(payload),
  });
  if (!r.ok) throw Object.assign(Error('正式系统返回 HTTP ' + r.status), {status:r.status, retriable:r.status >= 500 || [408,429].includes(r.status)});
  const receipt = await r.json();
  if (!receipt?.recommendationId || (payload.execution && !receipt.tradeId)) throw Error('正式系统未返回完整编号');
  return receipt;
}

export function createLocalFeishuWorkflow({sendMessage}) {
  const directory = resolve(process.env.REPLAY_DATA_DIR || defaultDirectory);
  mkdirSync(directory, {recursive:true, mode:0o700});
  const port = Number(process.env.REPLAY_PORT || 4317);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw Error('Demo 端口无效');
  const lockFile = join(directory, 'feishu-instance.sqlite');
  const lock = new DatabaseSync(lockFile);
  let db;
  try {
    chmodSync(lockFile, 0o600);
    lock.exec('BEGIN EXCLUSIVE');
    const file = join(directory, 'feishu-workflow.sqlite');
    db = new DatabaseSync(file);
    chmodSync(file, 0o600);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000');
    const transaction = fn => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    };
    const configuredTarget = Boolean(process.env.FEISHU_SIMULATION_ORIGIN && process.env.FEISHU_SIMULATION_INGEST_TOKEN);
    const workflow = openFeishuWorkflow(db, transaction, {
      register: payload => localRegister(payload, port),
      syncFormal: configuredTarget ? syncFormal : undefined,
      sendMessage, config: () => bindings(directory),
    });
    const replayFile = join(directory,'replay.sqlite');
    let replay;
    function drainBroadcasts() {
      if (process.env.REPLAY_PUBLIC_URL || !existsSync(replayFile)) return;
      if (!replay) {
        const candidate = new DatabaseSync(replayFile);
        try {
          candidate.exec('PRAGMA busy_timeout=3000');
          if (!hasAppDelivery(candidate)) { candidate.close(); return; }
          recoverAppDelivery(candidate);
          replay = candidate;
        } catch (error) { candidate.close(); throw error; }
      }
      return deliverAppPending(replay,{sendMessage,boundChatId:() => bindings(directory).chatId});
    }
    return {...workflow, async drain() {
      const results = await Promise.allSettled([workflow.drain(),Promise.resolve().then(drainBroadcasts)]);
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
      // A new registration can complete a group and enqueue its broadcast during this drain.
      await drainBroadcasts();
    }, close() { replay?.close(); db.close(); lock.close(); }};
  } catch (e) {
    db?.close();
    lock.close();
    throw e;
  }
}
