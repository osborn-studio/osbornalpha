import { randomUUID } from 'node:crypto';
import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { mergeSelfEnrollments, parseOnboardingRequest, readConfiguredBindings } from './feishu-onboarding.mjs';
import { DatabaseSync } from 'node:sqlite';
import { pairingReference, validateAnalystAliases } from '../../integrations/feishu/feishu-pairing.mjs';

const identifier = value => typeof value === 'string' && /^[\w:-]{1,160}$/.test(value);
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

export function openFeishuAdmin(directory, analystProfiles, {db, createProfile, transaction, connectorDirectory} = {}) {
  const settingsFile = join(directory, 'feishu-bindings.json');
  // Only server configuration selects the second event source. A request can never supply a path.
  const sources = [...new Set([resolve(directory), ...(connectorDirectory ? [resolve(connectorDirectory)] : [])])];
  if (db) db.exec(`CREATE TABLE IF NOT EXISTS feishu_demo_members (
    chat_id TEXT NOT NULL, sender_id TEXT NOT NULL, analyst_id TEXT NOT NULL UNIQUE REFERENCES replay_analysts(id),
    PRIMARY KEY(chat_id,sender_id)
  )`);

  function loadSettings(source = directory) {
    try { return mergeSelfEnrollments(readConfiguredBindings(source),db); }
    catch { fail(500, '无法读取飞书配对配置，请联系本机管理员核对。'); }
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

  function readWorkflow(query, fallback, source = directory) {
    const workflowFile = join(source, 'feishu-workflow.sqlite');
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
    const next = {...readConfiguredBindings(directory), chatId};
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
      next.analystBySender = {...next.analystBySender, [senderId]:profile.id};
      const signatures = settings.analystNamesByRole ?? {};
      if (own(signatures, profile.id) === undefined) next.analystNamesByRole = {...next.analystNamesByRole, [profile.id]:profile.display_name};
    }
    try { validateAnalystAliases(next); } catch (error) { fail(409, error.message); }
    writeSettings(next);
    return view();
  }

  function boundAnalystRoles() {
    const settings = loadSettings();
    return settings.chatId ? Object.values(settings.analystBySender ?? {}) : [];
  }

  function boundChatId() { return loadSettings().chatId || null; }

  function approvedRegistration(role, {requestId,...fields}) {
    const current = loadSettings();
    const chatId = current.chatId;
    if (!chatId || !identifier(requestId)) return false;
    for (const source of sources) {
      const settings = loadSettings(source);
      if (settings.chatId !== chatId) continue;
      const proposal = readWorkflow(workflow => workflow.prepare(`SELECT body,sender_id,approver_id FROM feishu_workflow_proposals
        WHERE chat_id=? AND id=? AND role=? AND approval IS NOT NULL AND demo_status IN ('pending','registered')`)
        .get(chatId,requestId,role), null, source);
      if (!proposal || proposal.sender_id === proposal.approver_id || ![current,settings].every(binding =>
        binding.analystBySender?.[proposal.sender_id] === role && binding.approverIds?.includes(proposal.approver_id))) continue;
      const {recommendation} = JSON.parse(proposal.body);
      if (Object.keys(recommendation).length === Object.keys(fields).length &&
          Object.entries(recommendation).every(([key,value]) => Object.hasOwn(fields,key) && fields[key] === value)) return true;
    }
    return false;
  }

  function onboard({eventId, ...extra}) {
    if (!identifier(eventId) || Object.keys(extra).length) fail(400,'建档请求无效。');
    const current = loadSettings();
    if (!current.chatId) fail(409,'请先配对目标飞书群。');
    for (const source of sources) {
      const senderSettings = loadSettings(source);
      if (senderSettings.chatId !== current.chatId) continue;
      const event = readWorkflow(workflow => workflow.prepare(`SELECT sender_id,text FROM feishu_workflow_events
        WHERE event_id=? AND chat_id=? AND kind='assistant_command' AND status='pending'`).get(eventId,current.chatId),null,source);
      if (!event) continue;
      const request = parseOnboardingRequest(event.text);
      if (!request?.displayName) fail(400,'请发送「我想成为分析师，署名你的姓名」。');
      const sender = event.sender_id;
      if (!identifier(sender) || current.approverIds?.includes(sender) || senderSettings.approverIds?.includes(sender))
        fail(403,'确认人已绑定独立角色。');
      const previous = own(current.analystBySender ?? {},sender);
      const sourceRole = own(senderSettings.analystBySender ?? {},sender);
      if (sourceRole !== previous) fail(409,'现有身份绑定需要 PM 核对。');
      if (previous) {
        const profile = analystProfiles().find(p => p.id === previous);
        if (!profile) fail(409,'未找到已配对的档案，请联系 PM 核对。');
        return {role:previous,displayName:profile.display_name,demoOnly:current.demoOnlyRoles?.includes(previous) ?? false};
      }
      const normalizeName = name => String(name).normalize('NFKC').toLowerCase();
      for (const settings of [current,senderSettings]) {
        const reserved = [...Object.values(settings.analystNamesByRole ?? {}), ...Object.values(settings.analystAliasesByRole ?? {}).flat()];
        if (reserved.some(name => normalizeName(name) === normalizeName(request.displayName)))
          fail(409,'署名与已有群成员冲突，请使用其他署名。');
      }
      return transaction(() => {
        const {profile} = createProfile({display_name:request.displayName,kind:'human'});
        db.prepare('INSERT INTO feishu_demo_members(chat_id,sender_id,analyst_id) VALUES (?,?,?)')
          .run(current.chatId,sender,profile.id);
        // Validate the effective names and aliases before committing either profile or membership.
        for (const bindingSource of new Set([directory,source])) {
          try { mergeSelfEnrollments(readConfiguredBindings(bindingSource),db); }
          catch { fail(409,'署名与已有群成员冲突，请使用其他署名。'); }
        }
        return {role:profile.id,displayName:profile.display_name,demoOnly:true};
      });
    }
    fail(403,'未找到本群成员已提交的本人入职请求。');
  }

  return {view:() => view(), assign, onboard, boundAnalystRoles, boundChatId, approvedRegistration};
}
