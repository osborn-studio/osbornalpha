// Replay delivery. All database changes here are synchronous;
// enqueue can therefore participate in the same SQLite transaction as the replay event.
import { createHash } from 'node:crypto';
import { signWebhook, validFeishuWebhook } from '../../integrations/feishu/feishu-webhook.mjs';

const LOCAL_PATH = '/internal/mock-feishu';
const inflight = new WeakMap();
const appInflight = new WeakMap();
const requestError = (message, status = 400) => Object.assign(new Error(message), { status });
const waitForReceipt = '送达状态待核实，请按事件编号在群内核对。';
const wrongTarget = '机器人地址已切换，此消息仅可投递到原目标。';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const appDestination = chatId => digest('feishu-app:' + chatId);
const appTarget = (activeChat, boundChat, destination) => activeChat && activeChat === boundChat && appDestination(activeChat) === destination;
const appId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);

export function setupDelivery(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS replay_hook_settings (
      id INTEGER PRIMARY KEY CHECK (id=1), generation INTEGER NOT NULL DEFAULT 0,
      url TEXT NOT NULL DEFAULT '', secret TEXT NOT NULL DEFAULT '', app_chat_id TEXT NOT NULL DEFAULT ''
    );
    INSERT OR IGNORE INTO replay_hook_settings(id) VALUES(1);
    CREATE TABLE IF NOT EXISTS replay_outbox (
      seq INTEGER PRIMARY KEY, session_id TEXT NOT NULL, event_id TEXT NOT NULL,
      title TEXT NOT NULL, text TEXT NOT NULL, mode TEXT NOT NULL,
      generation INTEGER NOT NULL, destination TEXT NOT NULL, receipt_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
      due_at INTEGER NOT NULL DEFAULT 0, error TEXT, created_at TEXT NOT NULL, sent_at TEXT,
      UNIQUE(session_id,event_id)
    );
    CREATE INDEX IF NOT EXISTS replay_delivery_due ON replay_outbox(status,due_at,seq);
    CREATE TABLE IF NOT EXISTS replay_mock_receipts (
      receipt_id TEXT PRIMARY KEY REFERENCES replay_outbox(receipt_id),
      received_at TEXT NOT NULL, payload TEXT NOT NULL
    );
    UPDATE replay_outbox SET status='pending' WHERE status='sending' AND mode='local';
  `);
  if (!hasAppDelivery(db)) db.exec("ALTER TABLE replay_hook_settings ADD COLUMN app_chat_id TEXT NOT NULL DEFAULT ''");
  db.prepare("UPDATE replay_outbox SET status='uncertain',error=? WHERE status='sending' AND mode='feishu'").run(waitForReceipt);
}

export function hasAppDelivery(db) {
  return Boolean(db.prepare("SELECT 1 FROM pragma_table_info('replay_hook_settings') WHERE name='app_chat_id'").get());
}

export function recoverAppDelivery(db) {
  db.prepare("UPDATE replay_outbox SET status='uncertain',error=? WHERE status='sending' AND mode='app'").run(waitForReceipt);
}

export function configureWebhook(db, { url, secret = '' }) {
  if (typeof url !== 'string' || typeof secret !== 'string') throw requestError('请填写有效的机器人地址和签名密钥。');
  const target = url.trim();
  const key = secret.trim();
  if (target && !validFeishuWebhook(target)) throw requestError('请填写飞书或 Lark 官方自定义机器人 HTTPS webhook 地址。');
  if (key.length > 256 || /[\r\n]/.test(key)) throw requestError('签名密钥格式错误。');
  if (!target && key) throw requestError('填写签名密钥时需要同时填写 webhook 地址。');
  db.prepare(`UPDATE replay_hook_settings SET url=?, secret=?, app_chat_id='', generation=generation+1
    WHERE id=1 AND (url<>? OR secret<>? OR app_chat_id<>'')`).run(target, key, target, key);
  return getWebhookInfo(db);
}

export function configureAppDelivery(db, chatId) {
  if (!appId(chatId)) throw requestError('请先在飞书群配对中绑定目标群。', 409);
  db.prepare(`UPDATE replay_hook_settings SET app_chat_id=?,generation=generation+1
    WHERE id=1 AND app_chat_id<>?`).run(chatId,chatId);
  return getWebhookInfo(db);
}

export function getWebhookInfo(db) {
  const row = db.prepare('SELECT url,secret,app_chat_id FROM replay_hook_settings WHERE id=1').get();
  if (row.app_chat_id) return {mode:'app',configured:true,signed:false};
  return { mode: row.url ? 'feishu' : 'local', configured: Boolean(row.url), signed: Boolean(row.secret) };
}

export function enqueue(db, sessionId, id, { title, text }) {
  if (typeof title !== 'string' || typeof text !== 'string' || !title.trim() ||
      Buffer.byteLength(title + text) > 16_000) throw Error('群播报正文无效或过长。');
  const { url, generation, app_chat_id } = db.prepare('SELECT url,generation,app_chat_id FROM replay_hook_settings WHERE id=1').get();
  const mode = app_chat_id ? 'app' : url ? 'feishu' : 'local';
  const destination = app_chat_id ? appDestination(app_chat_id) : digest(url);
  const receiptId = digest(JSON.stringify([sessionId, id])).slice(0, 16);
  db.prepare(`INSERT INTO replay_outbox
    (session_id,event_id,title,text,mode,generation,destination,receipt_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(session_id,event_id) DO NOTHING`)
    .run(sessionId, id, title, text, mode, generation, destination, receiptId, new Date().toISOString());
  return id;
}

export function getNotifications(db, sessionId, secondSessionId = sessionId) {
  return db.prepare(`SELECT event_id AS id,title,text,mode,
    CASE status WHEN 'sending' THEN 'pending' ELSE status END AS status,
    attempts,error,receipt_id AS receiptId,created_at AS createdAt,sent_at AS sentAt
    FROM replay_outbox WHERE session_id IN (?,?) ORDER BY seq DESC`).all(sessionId, secondSessionId);
}

export function retryDelivery(db, sessionId, id, boundChatId = null) {
  const row = db.prepare('SELECT status,mode,destination FROM replay_outbox WHERE session_id=? AND event_id=?').get(sessionId, id);
  if (!row) throw requestError('找不到此场次的播报。', 404);
  if (row.status !== 'failed' && row.status !== 'uncertain') throw requestError('仅失败或送达待核实的播报可以重试。', 409);
  const { url, app_chat_id } = db.prepare('SELECT url,app_chat_id FROM replay_hook_settings WHERE id=1').get();
  if ((row.mode === 'feishu' && (app_chat_id || row.destination !== digest(url))) ||
      (row.mode === 'app' && !appTarget(app_chat_id,boundChatId,row.destination))) throw requestError(wrongTarget, 409);
  db.prepare("UPDATE replay_outbox SET status='pending',due_at=0,error=NULL WHERE session_id=? AND event_id=?")
    .run(sessionId, id);
}

function footer(row) {
  return `Osborn Alpha · 场次 ${row.session_id} · 事件 ${row.receipt_id}`;
}

function cardFor(row, publicUrl) {
  const elements = [{ tag: 'div', text: { tag: 'plain_text', content: row.text } }];
  if (publicUrl) {
    const target = new URL(publicUrl);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash) {
      throw Error('演示入口需要不含凭据的 HTTP(S) 地址。');
    }
    elements.push({ tag: 'action', actions: [{ tag: 'button', text: { tag: 'plain_text', content: '查看本场演示' }, url: target.href }] });
  }
  elements.push({ tag: 'note', elements: [{ tag: 'plain_text', content: footer(row) }] });
  return {
    msg_type: 'interactive',
    card: {
      header: { template: 'blue', title: { tag: 'plain_text', content: row.title } },
      elements,
    },
  };
}

// Called only by the app's authenticated loopback-only mock endpoint. A retry of a
// locally acknowledged event returns the same receipt, including after a restart.
export function recordMockReceipt(db, payload) {
  const elements = payload?.card?.elements;
  const note = Array.isArray(elements) ? elements.at(-1)?.elements?.[0]?.content : '';
  const receiptId = typeof note === 'string' ? / · 事件 ([a-f0-9]{16})$/.exec(note)?.[1] : undefined;
  const row = receiptId && db.prepare("SELECT * FROM replay_outbox WHERE receipt_id=? AND mode='local'").get(receiptId);
  if (!row || payload.msg_type !== 'interactive' || note !== footer(row) ||
      row.title !== payload.card.header?.title?.content || row.text !== elements[0]?.text?.content) {
    throw requestError('本地接收端无法匹配待发事件。');
  }
  db.prepare('INSERT OR IGNORE INTO replay_mock_receipts VALUES(?,?,?)')
    .run(receiptId, new Date().toISOString(), JSON.stringify(payload));
  return receiptId;
}

function safeLocalTarget(localUrl, localToken) {
  const url = new URL(localUrl);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== LOCAL_PATH ||
      url.username || url.password || url.search || url.hash || !localToken) throw Error('本地接收端配置无效。');
  return url;
}

async function deliverOne(db, row, options) {
  const { url, secret, app_chat_id } = db.prepare('SELECT url,secret,app_chat_id FROM replay_hook_settings WHERE id=1').get();
  if (row.mode === 'app') {
    if (!appTarget(app_chat_id,options.boundChatId(),row.destination)) return { status:'failed',error:wrongTarget };
    const text = [row.title,row.text,footer(row)].join('\n\n');
    try {
      const result = await options.sendMessage({chatId:app_chat_id,text,uuid:'oa-demo-' + row.receipt_id});
      return appId(result?.messageId) ? { status:'sent' } : { status:'uncertain',error:waitForReceipt };
    } catch (error) {
      if (error?.safeRetry === true) return { retry:true,error:'机器人限流，稍后重试。' };
      return error?.retriable === false
        ? { status:'failed',error:'飞书应用拒绝播报，请检查机器人是否在已绑定群中，并具有发送消息权限。' }
        : { status:'uncertain',error:waitForReceipt };
    }
  }
  const isLocal = row.mode === 'local';
  if (!isLocal && (app_chat_id || !url || digest(url) !== row.destination)) return { status: 'failed', error: wrongTarget };
  const target = isLocal ? safeLocalTarget(options.localUrl, options.localToken) : url;
  const headers = { 'content-type': 'application/json' };
  if (isLocal) headers['x-demo-mock-token'] = options.localToken;
  const payload = signWebhook(cardFor(row, options.publicUrl), isLocal ? '' : secret);
  const fetchImpl = options.fetchImpl ?? fetch;
  let response;
  try {
    response = await fetchImpl(target, {
      method: 'POST', headers, body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000), redirect: 'error',
    });
  } catch (error) {
    // A pre-connect failure cannot have delivered a request. The receiving loopback
    // endpoint is idempotent. All other remote failures could already be in the group.
    const beforeConnect = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT'].includes(error?.cause?.code);
    return isLocal || beforeConnect
      ? { retry: true, error: '接收端暂时无法连接。' }
      : { status: 'uncertain', error: waitForReceipt };
  }
  if (response.status === 429) return { retry: true, error: '机器人限流，稍后重试。' };
  if (!response.ok) {
    if (response.status >= 500 || response.status === 408) {
      return isLocal ? { retry: true, error: '本地接收端暂时不可用。' } : { status: 'uncertain', error: waitForReceipt };
    }
    return { status: 'failed', error: `接收端拒绝请求（HTTP ${response.status}）。` };
  }
  const body = await response.json().catch(() => null);
  const code = body?.code ?? body?.StatusCode;
  if (code === 0) return { status: 'sent' };
  if (code === 11232) return { retry: true, error: '机器人限流，稍后重试。' };
  if (Number.isInteger(code)) return { status: 'failed', error: `飞书拒绝消息（业务码 ${code}），请检查关键词或签名配置。` };
  return isLocal ? { retry: true, error: '本地接收端回执无效。' } : { status: 'uncertain', error: waitForReceipt };
}

async function drain(db, options, appWorker) {
  const next = db.prepare(`SELECT * FROM replay_outbox AS o WHERE status='pending' AND due_at<=?
    AND ${appWorker ? "o.mode='app'" : "o.mode IN ('local','feishu')"}
    AND NOT EXISTS (SELECT 1 FROM replay_outbox AS p WHERE p.session_id=o.session_id AND p.mode=o.mode
      AND p.destination=o.destination AND p.seq<o.seq AND p.status IN ('pending','sending'))
    ORDER BY seq LIMIT 1`);
  for (let count = 0; count < 40; count++) {
    const now = Date.now();
    // An earlier event waiting for backoff holds later messages for the same group/session.
    const row = next.get(now);
    if (!row) return;
    const claimed = db.prepare("UPDATE replay_outbox SET status='sending',attempts=attempts+1 WHERE seq=? AND status='pending'").run(row.seq);
    if (!claimed.changes) continue;
    // Validation errors before transmission have no delivery ambiguity. Never persist an
    // arbitrary transport error string, which could include a credential-bearing URL.
    let result;
    try { result = await deliverOne(db, row, options); }
    catch { result = { status: 'failed', error: '发送配置无效，请检查演示入口与本地接收端。' }; }
    const attempt = row.attempts + 1;
    const retry = Boolean(result.retry && attempt < 4);
    const status = retry ? 'pending' : (result.status ?? 'failed');
    db.prepare('UPDATE replay_outbox SET status=?,error=?,due_at=?,sent_at=? WHERE seq=?')
      .run(status, result.error ?? null, retry ? Date.now() + 2 ** attempt * 1000 : 0,
        status === 'sent' ? new Date().toISOString() : null, row.seq);
  }
}

function runWorker(db, options, appWorker, workers) {
  const current = workers.get(db);
  if (current) return current;
  const pending = drain(db, options, appWorker).finally(() => workers.delete(db));
  workers.set(db, pending);
  return pending;
}

export function deliverPending(db, options) {
  return runWorker(db, options, false, inflight);
}

export function deliverAppPending(db, options) {
  return runWorker(db, options, true, appInflight);
}
