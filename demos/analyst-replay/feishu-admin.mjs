import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pairingReference, validateAnalystAliases } from './feishu-pairing.mjs';

const identifier = value => typeof value === 'string' && /^[\w:-]{1,160}$/.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (map, key) => Object.hasOwn(map, key) ? map[key] : undefined;

export class FeishuBindingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function fail(status, message) {
  throw new FeishuBindingError(status, message);
}

export function openFeishuAdmin(directory, analystProfiles) {
  const settingsFile = join(directory, 'feishu-bindings.json');
  const workflowFile = join(directory, 'feishu-workflow.sqlite');

  function loadSettings() {
    try {
      const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
      if (!record(settings) || (settings.chatId != null && settings.chatId !== '' && !identifier(settings.chatId)) ||
          (settings.analystBySender != null && !record(settings.analystBySender)) ||
          (settings.analystNamesByRole != null && !record(settings.analystNamesByRole)) ||
          (settings.approverIds != null && !Array.isArray(settings.approverIds))) {
        throw new Error('invalid bindings');
      }
      validateAnalystAliases(settings);
      return settings;
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      fail(500, '无法读取飞书配对配置，请联系本机管理员核对。');
    }
  }

  function writeSettings(settings) {
    const temporary = settingsFile + '.' + randomUUID();
    try {
      writeFileSync(temporary, JSON.stringify(settings, null, 2) + '\n', {mode:0o600, flag:'wx'});
      renameSync(temporary, settingsFile);
    } catch {
      try { rmSync(temporary, {force:true}); } catch { /* The original file remains intact. */ }
      fail(500, '无法保存飞书配对，请联系本机管理员核对。');
    }
  }

  function readWorkflow(query, fallback) {
    if (!existsSync(workflowFile)) return fallback;
    let db;
    try {
      db = new DatabaseSync(workflowFile, {readOnly:true});
      db.exec('PRAGMA busy_timeout=500');
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name='feishu_workflow_events' AND type='table'").get()) return fallback;
      return query(db);
    } catch {
      fail(503, '暂时无法读取飞书收件记录，请刷新重试。');
    } finally {
      db?.close();
    }
  }

  function view(settings = loadSettings()) {
    const pairings = readWorkflow(db => db.prepare(`SELECT e.chat_id AS chatId, e.sender_id AS senderId,
      e.received_at AS receivedAt, e.status AS status, m.status AS replyStatus
      FROM feishu_workflow_events e JOIN (
        SELECT MAX(seq) AS seq FROM feishu_workflow_events WHERE kind='pair'
        GROUP BY chat_id, sender_id
      ) latest ON latest.seq=e.seq LEFT JOIN feishu_workflow_messages m
      ON m.chat_id=e.chat_id AND m.reply_to=e.message_id AND m.kind='pair'
      ORDER BY (e.chat_id=?) DESC, e.seq DESC LIMIT 100`).all(settings.chatId || ''), []);
    const analystBySender = settings.analystBySender ?? {};
    const signatures = settings.analystNamesByRole ?? {};
    const aliases = settings.analystAliasesByRole ?? {};
    const approvers = settings.approverIds ?? [];
    return {
      chatId:settings.chatId || null,
      pairings:pairings.map(pair => {
        const inTarget = pair.chatId === settings.chatId;
        const role = inTarget ? own(analystBySender, pair.senderId) : null;
        return {...pair, pairingReference:pairingReference(pair.chatId, pair.senderId), analyst:typeof role === 'string' ? role : null,
          approver:inTarget && approvers.includes(pair.senderId)};
      }),
      analysts:analystProfiles().map(({id, display_name}) => {
        const signature = own(signatures, id);
        return {id, display_name, signature:typeof signature === 'string' ? signature : display_name,
          aliases:own(aliases, id) ?? [], assigned:Object.values(analystBySender).includes(id)};
      }),
    };
  }

  function assign({chatId, senderId, assignment}) {
    if (![chatId, senderId, assignment].every(identifier)) fail(400, '请选择目标群、已收到的成员和要配对的身份。');
    const settings = loadSettings();
    const analystBySender = settings.analystBySender ?? {};
    const approverIds = settings.approverIds ?? [];
    if (settings.chatId && settings.chatId !== chatId) fail(409, '已有目标群，请从该群收件记录选择成员。');
    if (!settings.chatId && (Object.keys(analystBySender).length || approverIds.length)) {
      fail(409, '现有身份配置尚未指定目标群，请由本机管理员核对。');
    }
    const received = readWorkflow(db => db.prepare(`SELECT 1 FROM feishu_workflow_events
      WHERE kind='pair' AND chat_id=? AND sender_id=? LIMIT 1`).get(chatId, senderId), null);
    if (!received) fail(409, '没有收到该成员在所选群发送的「联调」或「绑定」。');

    const previousRole = own(analystBySender, senderId);
    const isApprover = approverIds.includes(senderId);
    const next = {...settings, chatId};
    if (assignment === 'approver') {
      if (previousRole) fail(409, '该成员已配对分析师身份。');
      if (isApprover) return view(settings);
      next.approverIds = [...approverIds, senderId];
    } else {
      const profile = analystProfiles().find(item => item.id === assignment);
      if (!profile) fail(400, '请选择现有的 Demo 分析师。');
      if (isApprover || (previousRole && previousRole !== profile.id)) fail(409, '该成员已有配对身份。');
      if (previousRole === profile.id) return view(settings);
      if (Object.values(analystBySender).includes(profile.id)) fail(409, '这位分析师已与另一名成员配对。');
      next.analystBySender = {...analystBySender, [senderId]:profile.id};
      const signatures = settings.analystNamesByRole ?? {};
      if (own(signatures, profile.id) === undefined) next.analystNamesByRole = {...signatures, [profile.id]:profile.display_name};
    }
    try { validateAnalystAliases(next); } catch (error) { fail(409, error.message); }
    writeSettings(next);
    return view(next);
  }

  function boundAnalystRoles() {
    const settings = loadSettings();
    return settings.chatId ? Object.values(settings.analystBySender ?? {}) : [];
  }

  function boundChatId() { return loadSettings().chatId || null; }

  function approvedRegistration(role, {requestId,...fields}) {
    const chatId = boundChatId();
    if (!chatId || !identifier(requestId)) return false;
    const proposal = readWorkflow(db => db.prepare(`SELECT body FROM feishu_workflow_proposals WHERE
      chat_id=? AND id=? AND role=? AND approval IS NOT NULL AND demo_status IN ('pending','registered')`).get(chatId,requestId,role), null);
    if (!proposal) return false;
    const {recommendation} = JSON.parse(proposal.body);
    return Object.keys(recommendation).length === Object.keys(fields).length &&
      Object.entries(recommendation).every(([key,value]) => Object.hasOwn(fields,key) && fields[key] === value);
  }

  return {view:() => view(), assign, boundAnalystRoles, boundChatId, approvedRegistration};
}
