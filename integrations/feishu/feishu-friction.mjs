import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const contextTTL = 30 * 60_000;
const incidentTTL = 14 * 24 * 60 * 60_000;
const digest = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const modelFields = new Set(['securityName', 'ticker', 'market', 'action', 'executionMode', 'currency', 'quantity', 'price',
  'reference_price', 'target_price', 'stop_loss', 'fee', 'horizon', 'confidence', 'recommended_at']);
const privateMessage = /(?:app[ _-]?secret|client[ _-]?secret|(?:password|secret|token)\s*[:=]|api[ _-]?key|authorization\s*:|bearer\s+\S+|access[ _-]?token|refresh[ _-]?token|\bwebhook\b|-----BEGIN [\w ]*PRIVATE KEY-----|密钥|密码|验证码|私钥|银行卡|身份证|信用卡|银行账[户号]|证券账[户号]|资金账[户号]|\bsk-[\w-]{8,})/iu;
const negative = /(?:你.{0,4}(?:没听懂|没理解|理解错|答错|弄错|看错|没看|怎么又|又问)|答非所问|没回答我的问题|我(?:刚才|刚刚|前面|已经).{0,8}(?:说过|说了|给过|给了|填过|写过)|(?:怎么|为什么)(?:还|又)(?:要)?(?:问|让我填)|不是这个意思|理解反了|识别错了)/u;
const correction = /(?:我说的是|我的意思是|我指的是|我刚才说的是|我想表达的是|你理解成|我只是(?:想问|问问|在问)|不是(?:让你|要你|叫你)|我没让你)/u;
const disown = /(?:我只是(?:想问|问问|在问|转述|举例)|我没(?:让你)?(?:提交|登记|下单|提建议)|不是(?:让你|要你|叫你)(?:登记|买|卖|下单|提交)|不是(?:我的|一条)建议)/u;
const owned = /(?:我是(?:要|想)(?:登记|提交)|我是(?:在)?(?:提建议|给建议)|请把我的建议记|刚才就是我的建议)/u;
const secretFragment = /\b(?:ou|oc|om|on|cli)_[A-Za-z0-9_-]+\b|@_user_\d+|\b[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}\b|\b[\da-f]{12,}\b|\b[a-z\d_-]{28,}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:https?:\/\/|www\.)[^\s，。；）]+|(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)|(?<!\d)\+\d{1,3}[- (]?(?:\d[ ()-]?){7,13}\d(?!\d)|(?<!\d)\d{12,}(?!\d)|@[\p{L}\p{N}_-]+/giu;

function scrub(value, names) {
  if (typeof value !== 'string') return '';
  let text = value.normalize('NFKC').slice(0, 1600);
  if (privateMessage.test(text)) return '[已隐去敏感内容]';
  text = text.replace(/(?<!\d)1[3-9]\d[- ]\d{4}[- ]\d{4}(?!\d)|(?<!\d)(?:\([2-9]\d{2}\)\s*|[2-9]\d{2}-)[2-9]\d{2}[- ]\d{4}(?!\d)/gu,'[已隐去]')
    .replace(secretFragment, '[已隐去]')
    .replace(/(?:正式)?模拟账户尾号\s*\d+/gu, '模拟账户')
    .replace(/(?:待确认提案|提案编号|回放编号)\s*[:：]?\s*[A-Z0-9-]{5,}/giu, '提案')
    .replace(/(?:姓名|署名|联系人)\s*[:：为是]\s*[^\s,，。|｜]{1,40}/gu, '[成员]')
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ');
  for (const name of names) text = text.replace(name, '[成员]');
  return text.trim().slice(0, 420);
}

function aliases(config, redactNames) {
  const values = [...redactNames, ...Object.values(config.analystNamesByRole ?? {}), ...Object.values(config.analystAliasesByRole ?? {}).flat(),
  ...Object.values(config.analystBySender ?? {})];
  return [...new Set(values.filter(x => typeof x === 'string' && x.length >= 2 && x.length <= 100))]
    .sort((a, b) => b.length - a.length).map(name => {
      const literal = name.normalize('NFKC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(/^[\w-]+$/u.test(name) ? '(?<![A-Z0-9_])' + literal + '(?![A-Z0-9_])' : literal, 'giu');
    });
}

function fieldsOf(values, names, model = false) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return undefined;
  const clean = {};
  for (const [key, field] of Object.entries(values)) {
    if (!modelFields.has(key)) continue;
    const value = model ? field?.value : field;
    if (typeof value === 'string') clean[key] = scrub(value, names).slice(0, 100);
    else if (Number.isFinite(value) && Math.abs(value) < 1e10) clean[key] = value;
  }
  return clean;
}

const intents = new Set(['other', 'proposal', 'help', 'ambiguous', 'cancel']);
const topics = new Set(['missing', 'usage', 'investment']);
const modelErrorCodes = new Set(['MODEL_TIMEOUT', 'MODEL_TRANSPORT', 'MODEL_HTTP', 'MODEL_OUTPUT', 'MODEL_REPLY_BLOCKED']);
const safeKeys = keys => Array.isArray(keys) ? [...new Set(keys.filter(key => modelFields.has(key)))].sort() : undefined;

function signalFor(turn, previous) {
  if (turn.outcome === 'model_failure' || turn.outcome === 'chat_fallback') return 'model_failure';
  if (turn.outcome === 'routed_chat') return null;
  if (previous && ((['pm_summary', 'awaiting_details'].includes(previous.outcome) && disown.test(turn.user)) ||
    (previous.outcome === 'chat' && owned.test(turn.user)))) return 'misrouted_proposal';
  if (negative.test(turn.user)) return 'negative_feedback';
  if (previous && correction.test(turn.user)) return 'member_correction';
  if (previous?.outcome === 'awaiting_details' && turn.outcome === 'awaiting_details' &&
    turn.intent === 'proposal' && turn.isSupplement && turn.missing?.length &&
    JSON.stringify(previous.missing) === JSON.stringify(turn.missing)) return 'repeated_clarification';
  return null;
}

// Only redacted incidents go to disk. Ordinary turns live briefly in memory, partitioned by group/member/thread.
export function createFrictionCollector(db, { now = Date.now, redactNames = [] } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS friction_incidents (
    id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,component TEXT NOT NULL,signal TEXT NOT NULL,episode_json TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS friction_created ON friction_incidents(created_at)`);
  const insert = db.prepare('INSERT OR IGNORE INTO friction_incidents VALUES(?,?,?,?,?)');
  const expire = db.prepare('DELETE FROM friction_incidents WHERE created_at<=?');
  const trim = db.prepare('DELETE FROM friction_incidents WHERE id IN (SELECT id FROM friction_incidents ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET 200)');
  const windows = new Map();
  let nextPrune = 0;
  function prune() {
    const time = now();
    if (time < nextPrune) return;
    expire.run(time - incidentTTL);
    for (const [key, window] of windows) {
      if (window.at <= time - contextTTL) windows.delete(key);
      else window.entries = window.entries.filter(entry => entry.at > time - contextTTL);
    }
    nextPrune = time + 60_000;
  }
  function observe(record, config) {
    if (!config.chatId || config.chatId !== record.chatId || !record.senderId || !record.threadId || !record.messageId ||
      !['extraction', 'chat'].includes(record.component)) return;
    prune();
    const at = now(), key = digest(record.chatId, record.senderId, record.threadId), msg = digest(record.chatId, record.messageId);
    const related = record.relatedThreadId && digest(record.chatId, record.senderId, record.relatedThreadId);
    const current = windows.get(key) ?? windows.get(related);
    const old = current ? current.entries.filter(entry => entry.at > at - contextTTL) : [];
    const same = old.at(-1)?.msg === msg;
    const entries = same ? old.slice(0, -1) : old;
    const names = aliases(config, redactNames);
    const turn = {
      ...(same ? old.at(-1).turn : {}), component: record.component, user: scrub(record.user, names),
      assistant: scrub(record.assistant, names), outcome: record.outcome
    };
    // A model may parse a private identifier as a price or ticker. Do not retain its packet for a sensitive message.
    const sensitive = turn.user === '[已隐去敏感内容]';
    const input = sensitive ? undefined : record.input;
    if (input) Object.assign(turn, {
      isSupplement: input.isSupplement === true, priorFields: fieldsOf(input.priorFields, names),
      priorMissing: safeKeys(input.pendingFields)
    });
    if (turn.outcome === 'chat_fallback' && modelErrorCodes.has(record.modelErrorCode)) {
      turn.modelErrorCode = record.modelErrorCode;
      if (record.modelErrorCode === 'MODEL_HTTP' && Number.isInteger(record.modelHttpStatus) &&
          record.modelHttpStatus >= 400 && record.modelHttpStatus <= 599) turn.modelHttpStatus = record.modelHttpStatus;
    }
    if (record.missing) turn.missing = safeKeys(record.missing);
    for (const [packet, prefix] of [[record.packet, ''], [record.rawPacket, 'raw']]) {
      if (sensitive || !packet) continue;
      if (intents.has(packet.intent)) turn[prefix ? 'rawIntent' : 'intent'] = packet.intent;
      if (topics.has(packet.helpTopic)) turn[prefix ? 'rawHelpTopic' : 'helpTopic'] = packet.helpTopic;
      turn[prefix ? 'rawFields' : 'fields'] = fieldsOf(packet.fields, names, true);
    }
    if (record.proposalContext) {
      const { ticker, action, status, execution } = record.proposalContext;
      turn.proposalContext = {
        ...fieldsOf({ ticker, action }, names), status: scrub(status, names).slice(0, 30),
        execution: execution ? { ...fieldsOf(execution, names), direction: execution.direction } : null
      };
    }
    const previous = entries.at(-1)?.turn;
    if (Array.isArray(record.sentHistory)) {
      const prior = previous?.user;
      turn.historyContainsPreviousUser = Boolean(prior && prior !== turn.user &&
        !prior.includes('[已隐去') && !prior.includes('[成员]') && record.sentHistory.some(item =>
          item.role === 'user' && scrub(item.content,names) === prior));
    }
    const recent = [...entries.slice(-2), { msg, turn, at }];
    let signal = signalFor(turn, previous);
    let reviewed = Boolean(current?.reviewed && at - current.at < contextTTL);
    // A conversation can stall without anyone explicitly criticizing the bot.
    if (!signal && !reviewed && recent.length === 3 && recent.every(({ turn: item }) =>
      ['chat', 'awaiting_details'].includes(item.outcome))) {
      signal = 'conversation_review';
      reviewed = true;
    }
    windows.delete(key);
    windows.set(key, { at, entries: recent, reviewed });
    if (windows.size > 256) windows.delete(windows.keys().next().value);
    if (!signal) return;
    const component = signal === 'misrouted_proposal' ? 'extraction' : record.component;
    const incidentId = digest('friction-1', msg, component, signal);
    insert.run(incidentId, at, component, signal, JSON.stringify({ version: 1, turns: recent.map(x => x.turn) }));
    trim.run();
  }
  return { observe, prune };
}

// A broken monitor must not block an event ACK or a group reply. Recover locally on a later observation.
export function openFrictionMonitor(file, { now = Date.now, log = console.error, redactNames = [] } = {}) {
  let sqlite, collector, retryAt = 0;
  function invoke(method, ...args) {
    if (now() < retryAt) return;
    try {
      if (!collector) {
        mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
        sqlite = new DatabaseSync(file);
        chmodSync(file, 0o600);
        sqlite.exec('PRAGMA busy_timeout=15; PRAGMA secure_delete=ON;');
        collector = createFrictionCollector(sqlite, { now, redactNames });
      }
      collector[method](...args);
    } catch {
      try { sqlite?.close(); } catch {/* Ignore an already closed handle. */ }
      sqlite = collector = undefined;
      retryAt = now() + 60_000;
      log('飞书优化监测暂不可用，将在本机重试。');
    }
  }
  return {
    observe: (...args) => invoke('observe', ...args), prune: () => invoke('prune'),
    close: () => { sqlite?.close(); sqlite = collector = undefined; }
  };
}
