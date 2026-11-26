import { proposalStatus, reviseProposal } from './feishu-proposal-controls.mjs';
import { analystRosterText, isAnalystRosterQuestion, publicAnalystDirectory } from './feishu-analyst-roster.mjs';
import { directGroupReport, allowsGroupReportScope, directFormalRead, formalReportIntent, groundFormalRead, isContextualReportQuestion, reportScopeAnswer } from './feishu-report-intent.mjs';
import { parseFeishuReadTool } from './feishu-read-tool.mjs';
import { isAssistantCommandCandidate } from './feishu-ostag.mjs';
import { createHash } from 'node:crypto';
import { isUuid } from '../../src/lib/portfolio/validate.ts';
import { currencyCodeOfMarket } from '../../src/lib/utils.ts';
import { pairingReference, validateAnalystAliases } from './feishu-pairing.mjs';
import { evaluateProposal, isAdviceOnlyCommand, missingFields, missingLabels, modelExecutionMode, proposalSecurityQuery, summary } from './feishu-workflow-command.mjs';
import { beijingDateTime, marketCalendarLabel } from './beijing-time.mjs';

const identifier = value => typeof value === 'string' && /^[\w:-]{1,160}$/.test(value);
const proposalKinds = new Set(['proposal','proposal_ai','supplement','proposal_followup']);
const recentDraftWindow = 30 * 60_000;
const chatWindow = 30 * 60_000;
const chatUnavailable = '这次聊天模型没有返回可用答复，请稍后再试。';
const usageHelp = '我可以登记分析建议和申请模拟成交。说出标的和动作就行，比如「我想买入英伟达」。有明确股数和每股成交价也可以一起写。整理好后，我会请 PM 确认。投资方向和成交价格由分析师提供。';
const investmentHelp = '投资方向由分析师决定。你确定自己的建议后，把公司名和动作发给我，我可以整理并交给 PM 确认。';
const priceExamples = {HK:'38.50 港元',A:'120 元人民币',US:'150 美元'};
const currencyLabels = {HKD:'港元',CNY:'元人民币',USD:'美元'};

function publicProposalContext(proposal) {
  const {recommendation,simulation} = JSON.parse(proposal.body);
  return {ticker:recommendation.ticker,action:recommendation.action,status:proposal.formal_status,
    execution:simulation ? {direction:simulation.direction,quantity:simulation.quantity,price:simulation.price,
      currency:currencyCodeOfMarket(recommendation.market)} : null};
}

function proposalFacts(proposal, {ticker,status,execution}) {
  const description = execution ? `这条是 ${ticker} 的模拟${execution.direction === 'buy' ? '买入' : '卖出'}申请，` +
    `${execution.quantity} 股，每股 ${execution.price} ${currencyLabels[execution.currency] ?? execution.currency}。` :
    `这条是 ${ticker} 的分析建议。摘要只登记建议。`;
  const update = {
    awaiting_approval:'目前等 PM 确认，尚未登记。', pending_formal_sync:'PM 已确认，正在等待正式系统回执。',
    registered:proposal.trade_id ? '回执显示模拟成交已登记。' : '回执显示分析建议已登记。',
    withdrawn:'这条摘要已撤回。', awaiting_account:'正式账户尚未绑定。', blocked:'正式同步已暂停。',
    failed:'正式同步失败，请查看该条回执。', uncertain:'正式回执待核实。',
  }[status] ?? '请查看这条摘要的正式回执。';
  return description + update;
}

function groundedQuote(text, quote) {
  if (typeof quote !== 'string') return false;
  const evidence = quote.normalize('NFKC').trim();
  return Boolean(evidence && text.normalize('NFKC').includes(evidence));
}

function isUnlinkedSupplement(packet, priorFields) {
  const pending = new Set(missingFields(priorFields));
  if (pending.has('ticker')) {
    pending.add('securityName');
    pending.add('market');
  }
  if (pending.has('quantity') || pending.has('price')) pending.add('currency');
  pending.add('executionMode');
  const updates = Object.keys(packet.fields ?? {});
  return updates.length > 0 && updates.every(key => pending.has(key));
}

function stableId(...parts) {
  const hex = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

function confirmedAccount(settings) {
  const account = settings.simulationAccount;
  return account?.confirmed === true && isUuid(account.id) ? account.id : null;
}

function demoResult(entry) {
  const score = entry.score;
  const result = (day, scoreValue, hit) => scoreValue == null ? null :
    `${day} 日 ${hit ? '命中' : '未命中'}，评分 ${scoreValue}`;
  const scores = [result(5, score?.score_5d, score?.hit), result(10, score?.score_10d, score?.hit_10d)].filter(Boolean);
  const status = {pending:'等待可核对行情', provisional:'暂评', final:'已完成评分'}[entry.status];
  const {hits,n,hitRate} = entry.analystStats ?? {};
  const rate = Number.isSafeInteger(n) && n > 0 && Number.isSafeInteger(hits) && hits >= 0 && hits <= n &&
    Number.isFinite(hitRate) && hitRate >= 0 && hitRate <= 100
    ? `该分析师累计命中率 ${hitRate.toFixed(2)}%（${hits}/${n}）` : null;
  const rec = entry.recommendation;
  const suggested = rec?.recommended_at && '建议时间（北京时间）' + beijingDateTime(rec.recommended_at);
  const evidence = entry.evidence?.disclosure;
  const marketNote = evidence && rec?.market ? marketCalendarLabel(rec.market) + ' · ' + evidence : evidence;
  return ['Demo 建议已登记 ' + entry.id, suggested, status, ...scores, rate, marketNote].filter(Boolean).join('\n');
}

export function openFeishuWorkflow(db, transaction, {register, sendMessage, syncFormal, queryFormal, queryGroupReport, extractWithModel, respondToChat, searchSecurity, config, monitor, wake, now = Date.now,
  classifyAssistantCommand, provisionAnalyst, registerDemoOnly, trackDemoRecap, reminderAfterMs = 30 * 60_000}) {
  db.exec(`CREATE TABLE IF NOT EXISTS feishu_workflow_events (
    seq INTEGER PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, message_id TEXT NOT NULL UNIQUE,
    chat_id TEXT NOT NULL, sender_id TEXT NOT NULL, parent_id TEXT, kind TEXT NOT NULL,
    text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', received_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS feishu_workflow_proposals (
    id TEXT PRIMARY KEY, origin TEXT NOT NULL UNIQUE, chat_id TEXT NOT NULL, sender_id TEXT NOT NULL,
    role TEXT NOT NULL, body TEXT NOT NULL, summary_id TEXT UNIQUE, approval TEXT UNIQUE, approver_id TEXT,
    demo_status TEXT NOT NULL DEFAULT 'awaiting_approval', demo_id TEXT,
    formal_status TEXT NOT NULL DEFAULT 'awaiting_approval', simulation_status TEXT NOT NULL,
    formal_id TEXT, decision_id TEXT, trade_id TEXT, formal_error TEXT,
    formal_attempts INTEGER NOT NULL DEFAULT 0, formal_due_at INTEGER NOT NULL DEFAULT 0,
    simulation_account TEXT, attempts INTEGER NOT NULL DEFAULT 0, due_at INTEGER NOT NULL DEFAULT 0,
    approved_at TEXT, error TEXT
  );
  CREATE TABLE IF NOT EXISTS feishu_workflow_messages (
    seq INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, chat_id TEXT NOT NULL, reply_to TEXT NOT NULL,
    text TEXT NOT NULL, kind TEXT NOT NULL, proposal_id TEXT, message_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
    due_at INTEGER NOT NULL DEFAULT 0, first_attempt_at INTEGER, error TEXT
  );
  CREATE TABLE IF NOT EXISTS feishu_formal_report_scopes (
    message_id TEXT PRIMARY KEY, requester_id TEXT NOT NULL, owner_id TEXT NOT NULL, analyst_key TEXT
  );
  CREATE TABLE IF NOT EXISTS feishu_model_report_jobs (
    event_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, analyst_key TEXT, sections TEXT NOT NULL, source_id TEXT
  );
  CREATE TABLE IF NOT EXISTS feishu_workflow_drafts (
    id TEXT PRIMARY KEY, origin TEXT NOT NULL UNIQUE, chat_id TEXT NOT NULL, sender_id TEXT NOT NULL,
    role TEXT NOT NULL, received_at TEXT NOT NULL, fields TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS feishu_event_deferrals (
    event_id TEXT PRIMARY KEY, retry_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS feishu_membership_jobs (
    event_id TEXT PRIMARY KEY, action TEXT NOT NULL, display_name TEXT, attempts INTEGER NOT NULL DEFAULT 0,
    due_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS feishu_proposal_revisions (
    proposal_id TEXT NOT NULL, version INTEGER NOT NULL, summary_id TEXT NOT NULL, body TEXT NOT NULL,
    replaced_at TEXT NOT NULL, PRIMARY KEY(proposal_id,version)
  );
  CREATE TABLE IF NOT EXISTS feishu_chat_turns (
    response_id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, sender_id TEXT NOT NULL,
    session_id TEXT NOT NULL, user_text TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS feishu_chat_member ON feishu_chat_turns(chat_id,sender_id,created_at);
  CREATE INDEX IF NOT EXISTS feishu_chat_expiry ON feishu_chat_turns(created_at);
  CREATE INDEX IF NOT EXISTS feishu_workflow_event_status ON feishu_workflow_events(status,seq);
  CREATE INDEX IF NOT EXISTS feishu_workflow_messages_status ON feishu_workflow_messages(status,due_at,seq);`);
  transaction(() => {
    for (const [table,column] of [['feishu_formal_report_scopes','sections'],['feishu_model_report_jobs','model_component'],
      ['feishu_formal_report_scopes','group_keys'],['feishu_model_report_jobs','group_keys']]) {
      if (!db.prepare('PRAGMA table_info('+table+')').all().some(row=>row.name===column)) {
        db.exec('ALTER TABLE '+table+' ADD COLUMN '+column+' TEXT');
      }
    }
    if (!db.prepare('PRAGMA table_info(feishu_workflow_events)').all().some(column => column.name === 'directed_to_bot')) {
      db.exec('ALTER TABLE feishu_workflow_events ADD COLUMN directed_to_bot INTEGER NOT NULL DEFAULT 0');
    }
    // A custom webhook lacks Feishu's idempotency UUID. A crash after dispatch leaves delivery uncertain.
    db.prepare("UPDATE feishu_workflow_messages SET status='uncertain',error=? WHERE kind IN ('formal_report','group_report') AND status='sending_webhook'")
      .run('群报表可能已送达，连接恢复后请按需重新查询。');
    const names = new Set(db.prepare('PRAGMA table_info(feishu_workflow_proposals)').all().map(column => column.name));
    const columns = {
      revision:'INTEGER NOT NULL DEFAULT 1', reminder_due_at:'INTEGER', demo_only:'INTEGER NOT NULL DEFAULT 0',
      formal_id:'TEXT', decision_id:'TEXT', trade_id:'TEXT', formal_error:'TEXT',
      formal_attempts:'INTEGER NOT NULL DEFAULT 0', formal_due_at:'INTEGER NOT NULL DEFAULT 0',
    };
    for (const [name, type] of Object.entries(columns)) {
      if (!names.has(name)) db.exec(`ALTER TABLE feishu_workflow_proposals ADD COLUMN ${name} ${type}`);
    }
    const messageColumns = new Set(db.prepare('PRAGMA table_info(feishu_workflow_messages)').all().map(c => c.name));
    for (const [name,type] of Object.entries({chat_source_id:'TEXT',chat_question:'TEXT',chat_at:'INTEGER',scope_sections:'TEXT',scope_owner:'TEXT'})) {
      if (!messageColumns.has(name)) db.exec(`ALTER TABLE feishu_workflow_messages ADD COLUMN ${name} ${type}`);
    }
    db.exec('CREATE INDEX IF NOT EXISTS feishu_read_turn_time ON feishu_workflow_messages(chat_id,chat_at) WHERE chat_at IS NOT NULL');
    if (!messageColumns.has('chat_source_id')) {
      // Older inboxes cleared the original question. Recover only known delivered read results, using a factual label.
      db.prepare(`UPDATE feishu_workflow_messages SET chat_source_id=id,chat_at=first_attempt_at,chat_question=CASE kind
        WHEN 'formal_report' THEN '查看正式报表' WHEN 'analyst_roster' THEN '查看本群分析师名单' ELSE '查看 PM 待办' END
        WHERE status='sent' AND first_attempt_at>=? AND (kind='analyst_roster' OR
        (kind='formal_report' AND id IN (SELECT message_id FROM feishu_formal_report_scopes)) OR
        (kind='assistant_reply' AND (text='本群暂无待你确认的提案。' OR text LIKE '本群待确认 %· 第 1/%')))`).run(now()-chatWindow);
    }
  });

  const settings = () => {
    const current = (typeof config === 'function' ? config() : config) ?? {};
    validateAnalystAliases(current);
    return current;
  };
  const roleFor = (current, sender) => {
    const mapping = current.analystBySender;
    return mapping && Object.hasOwn(mapping, sender) && typeof mapping[sender] === 'string' ? mapping[sender] : null;
  };
  const demoOnlyRole = (current, role) => Array.isArray(current.demoOnlyRoles) && current.demoOnlyRoles.includes(role);
  const isApprover = (current, sender) => Array.isArray(current.approverIds) && current.approverIds.includes(sender);
  function eventTime(event) {
    const createdAt = typeof event.createdAt === 'string' ? Date.parse(event.createdAt) : NaN;
    const receivedAt = now();
    return new Date(Number.isFinite(createdAt) && createdAt <= receivedAt + 60_000 ? createdAt : receivedAt).toISOString();
  }
  const saveEvent = db.prepare(`INSERT INTO feishu_workflow_events
    (event_id,message_id,chat_id,sender_id,parent_id,kind,text,received_at,directed_to_bot) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`);
  const nextEvent = db.prepare(`SELECT * FROM feishu_workflow_events e WHERE status='pending' AND kind NOT IN ('chat','formal_report','group_report')
    AND NOT EXISTS (SELECT 1 FROM feishu_membership_jobs j WHERE j.event_id=e.event_id)
    AND NOT EXISTS (SELECT 1 FROM feishu_event_deferrals d WHERE d.event_id=e.event_id AND d.retry_at>?) ORDER BY seq LIMIT 1`);
  const nextChatEvent = db.prepare("SELECT * FROM feishu_workflow_events WHERE status='pending' AND kind='chat' ORDER BY seq LIMIT 1");
  const nextReportEvent = db.prepare("SELECT * FROM feishu_workflow_events WHERE status='pending' AND kind IN ('formal_report','group_report') ORDER BY seq LIMIT 1");
  const saveReportJob = db.prepare('INSERT INTO feishu_model_report_jobs (event_id,owner_id,analyst_key,sections,source_id,model_component,group_keys) VALUES (?,?,?,?,?,?,?)');
  const reportJob = db.prepare('SELECT * FROM feishu_model_report_jobs WHERE event_id=?');
  const finishReportJob = db.prepare('DELETE FROM feishu_model_report_jobs WHERE event_id=?');
  const moveToChat = db.prepare("UPDATE feishu_workflow_events SET kind='chat' WHERE seq=?");
  const finishEvent = db.prepare('UPDATE feishu_workflow_events SET status=?,text=\'\' WHERE seq=?');
  const inputById = db.prepare('SELECT * FROM feishu_workflow_events WHERE event_id=?');
  const approvalsForSummary = db.prepare(`SELECT * FROM feishu_workflow_events
    WHERE chat_id=? AND parent_id=? AND kind='approval' AND status='pending' ORDER BY seq`);
  const earlierReply = db.prepare(`SELECT 1 FROM feishu_workflow_events WHERE chat_id=? AND parent_id=? AND
    seq<? AND status='pending' AND kind IN ('proposal_followup','assistant_command','approval') LIMIT 1`);
  const nextFormalWrite = db.prepare(`SELECT * FROM feishu_workflow_proposals WHERE formal_status='pending_formal_sync'
    AND formal_due_at<=? ORDER BY rowid LIMIT 1`);
  const nextReceipt = db.prepare(`SELECT * FROM feishu_workflow_messages WHERE status='pending' AND due_at<=?
    AND kind IN ('input_receipt','approval_receipt') ORDER BY seq LIMIT 1`);
  const proposalReplies = "('summary','clarification','formal_result','result')";
  const nextProposalReply = db.prepare(`SELECT * FROM feishu_workflow_messages WHERE status='pending' AND due_at<=?
    AND kind IN ${proposalReplies} ORDER BY seq LIMIT 1`);
  const nextReportReply = db.prepare(`SELECT * FROM feishu_workflow_messages WHERE status='pending' AND due_at<=?
    AND kind IN ('formal_report','group_report') ORDER BY seq LIMIT 1`);
  const nextDelivery = db.prepare(`SELECT * FROM feishu_workflow_messages WHERE status='pending' AND due_at<=?
    ${wake ? "AND kind NOT IN ('input_receipt','approval_receipt','formal_report','group_report') AND kind NOT IN " + proposalReplies : ''} ORDER BY seq LIMIT 1`);
  const saveReportScope = db.prepare('INSERT INTO feishu_formal_report_scopes (message_id,requester_id,owner_id,analyst_key,sections,group_keys) VALUES (?,?,?,?,?,?)');
  const readReportScope = db.prepare('SELECT * FROM feishu_formal_report_scopes WHERE message_id=?');
  const ownReportAt = db.prepare(`SELECT 1 FROM feishu_workflow_messages m
    JOIN feishu_workflow_events e ON e.chat_id=m.chat_id AND e.message_id=m.reply_to
    WHERE m.kind='formal_report' AND m.status='sent' AND m.chat_id=? AND m.message_id=? AND e.sender_id=?`);
  const rosterRequester = db.prepare('SELECT sender_id FROM feishu_workflow_events WHERE chat_id=? AND message_id=?');
  const ownBotMessage = db.prepare(`SELECT 1 FROM feishu_workflow_messages m JOIN feishu_workflow_events e
    ON e.chat_id=m.chat_id AND e.message_id=m.reply_to WHERE m.status='sent' AND m.chat_id=? AND m.message_id=? AND e.sender_id=?`);
  const queueMessage = db.prepare(`INSERT INTO feishu_workflow_messages (id,chat_id,reply_to,text,kind,proposal_id)
    VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`);
  const nextDemo = db.prepare(`SELECT * FROM feishu_workflow_proposals WHERE demo_status='pending'
    AND due_at<=? ${register ? '' : 'AND demo_only=1'} ORDER BY rowid LIMIT 1`);
  const proposalById = db.prepare('SELECT * FROM feishu_workflow_proposals WHERE id=?');
  const proposalAtMessage = db.prepare(`SELECT p.* FROM feishu_workflow_messages m
    JOIN feishu_workflow_proposals p ON p.id=m.proposal_id AND p.chat_id=m.chat_id
    WHERE m.chat_id=? AND m.message_id=?`);
  const notificationStates = db.prepare(`SELECT kind,status FROM feishu_workflow_messages
    WHERE proposal_id=? AND kind IN ('summary','result','formal_result') ORDER BY seq DESC`);
  const proposalBySummary = db.prepare('SELECT * FROM feishu_workflow_proposals WHERE chat_id=? AND summary_id=?');
  const publicProposalAt = db.prepare(`SELECT p.* FROM feishu_workflow_messages m
    JOIN feishu_workflow_proposals p ON p.id=m.proposal_id AND p.chat_id=m.chat_id
    WHERE m.chat_id=? AND m.message_id=? AND m.status='sent' AND m.kind IN ('summary','formal_result')`);
  const publicProposalById = db.prepare(`SELECT * FROM feishu_workflow_proposals
    WHERE chat_id=? AND id=? AND summary_id IS NOT NULL`);
  const rememberRead = db.prepare('UPDATE feishu_workflow_messages SET chat_source_id=id,chat_question=?,chat_at=? WHERE id=?');
  const readSource = db.prepare(`SELECT m.kind,m.text,m.chat_question,s.owner_id,s.analyst_key,s.sections,s.group_keys FROM feishu_workflow_messages m
    JOIN feishu_workflow_events e ON e.chat_id=m.chat_id AND e.message_id=m.reply_to
    LEFT JOIN feishu_formal_report_scopes s ON s.message_id=m.id
    WHERE m.chat_id=? AND e.sender_id=? AND m.id=? AND m.chat_source_id=m.id AND m.status='sent' AND m.chat_at>=?`);
  const chatReply = db.prepare(`SELECT coalesce(t.session_id,m.chat_source_id) AS session_id,m.proposal_id,m.chat_source_id,
    CASE WHEN t.response_id IS NOT NULL THEN m.scope_sections END AS scope_sections,m.scope_owner FROM feishu_workflow_messages m
    JOIN feishu_workflow_events e ON e.message_id=m.reply_to AND e.chat_id=m.chat_id
    LEFT JOIN feishu_chat_turns t ON t.response_id=m.id AND t.created_at>=?
    WHERE m.status='sent' AND (m.kind='chat' OR (m.chat_source_id=m.id AND m.chat_at>=?1))
    AND m.chat_id=?2 AND m.message_id=?3 AND e.sender_id=?4`);
  const recentChat = db.prepare(`SELECT session_id,chat_source_id,scope_sections,scope_owner FROM (
    SELECT t.session_id,m.chat_source_id,m.scope_sections,m.scope_owner,t.created_at,m.seq FROM feishu_chat_turns t
      JOIN feishu_workflow_messages m ON m.id=t.response_id AND m.proposal_id IS NULL AND m.status='sent'
      WHERE t.chat_id=?1 AND t.sender_id=?2 AND t.created_at>=?3
    UNION ALL
    SELECT m.id,m.id,NULL,NULL,m.chat_at,m.seq FROM feishu_workflow_messages m
      JOIN feishu_workflow_events e ON e.message_id=m.reply_to AND e.chat_id=m.chat_id
      WHERE m.chat_id=?1 AND e.sender_id=?2 AND m.chat_source_id=m.id AND m.chat_at>=?3 AND m.status='sent'
    ) ORDER BY created_at DESC,seq DESC LIMIT 1`);
  const recentTurns = db.prepare(`SELECT t.user_text,m.text AS reply FROM feishu_chat_turns t
    JOIN feishu_workflow_messages m ON m.id=t.response_id AND m.status='sent'
    WHERE t.chat_id=? AND t.sender_id=? AND t.session_id=? AND t.created_at>=?
    ORDER BY t.created_at DESC,t.rowid DESC LIMIT 3`);
  const saveChatTurn = db.prepare('INSERT INTO feishu_chat_turns VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING');
  const pruneChatTurns = db.prepare(`DELETE FROM feishu_chat_turns WHERE chat_id=? AND sender_id=? AND rowid NOT IN
    (SELECT rowid FROM feishu_chat_turns WHERE chat_id=? AND sender_id=? ORDER BY created_at DESC,rowid DESC LIMIT 8)`);
  const expireChatTurns = db.prepare('DELETE FROM feishu_chat_turns WHERE created_at<?');
  const clarification = db.prepare(`SELECT m.proposal_id,d.* FROM feishu_workflow_messages m
    LEFT JOIN feishu_workflow_drafts d ON d.id=m.proposal_id
    WHERE m.chat_id=? AND m.message_id=? AND m.kind='clarification'`);
  const draftByOrigin = db.prepare('SELECT * FROM feishu_workflow_drafts WHERE chat_id=? AND origin=?');
  const recentDrafts = db.prepare(`SELECT * FROM feishu_workflow_drafts
    WHERE chat_id=? AND sender_id=? AND role=? AND received_at>=? ORDER BY received_at DESC LIMIT 2`);
  const draftForAnchor = (chat, anchor) => clarification.get(chat,anchor) ?? draftByOrigin.get(chat,anchor);
  const pendingClarification = db.prepare(`SELECT 1 FROM feishu_workflow_drafts d
    JOIN feishu_workflow_messages m ON m.proposal_id=d.id AND m.kind='clarification' AND m.status='pending'
    WHERE d.chat_id=? AND d.sender_id=? LIMIT 1`);
  const saveDraft = db.prepare(`INSERT INTO feishu_workflow_drafts(id,origin,chat_id,sender_id,role,received_at,fields)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET fields=excluded.fields`);
  const withdrawProposal = db.prepare(`UPDATE feishu_workflow_proposals SET demo_status='withdrawn', formal_status='withdrawn',
    simulation_status=CASE WHEN simulation_status='not_requested' THEN simulation_status ELSE 'withdrawn' END
    WHERE id=? AND approval IS NULL AND demo_status='awaiting_approval'`);

  function removeDraft(id) {
    db.prepare('DELETE FROM feishu_workflow_drafts WHERE id=?').run(id);
    db.prepare("UPDATE feishu_workflow_messages SET status='superseded' WHERE proposal_id=? AND kind='clarification' AND status='pending'").run(id);
  }

  function receive(event) {
    if (!event || ![event.eventId,event.messageId,event.chatId,event.senderId].every(identifier) ||
        typeof event.text !== 'string' || event.text.length > 12_000) return {accepted:false};
    const current = settings();
    const content = event.text.trim();
    let kind, anchor, resumedReport;
    if (!content) {
      if (respondToChat && current.chatId === event.chatId && event.directedToBot === true) kind = 'greeting';
    } else if (/^\/?(?:绑定|联调)$/.test(content) && (!current.chatId || current.chatId === event.chatId)) {
      kind = 'pair';
    } else if (current.chatId === event.chatId) {
      const role = roleFor(current,event.senderId);
      const hasParent = identifier(event.parentId);
      const ownChat = Boolean(respondToChat && hasParent && chatReply.get(now()-chatWindow,event.chatId,event.parentId,event.senderId));
      const addressed = event.directedToBot === true || ownChat;
      const publicProposal = respondToChat && hasParent && publicProposalAt.get(event.chatId,event.parentId);
      if (queryFormal && addressed && content.length<=160 && content!=='同意') {
        const prior=chatScope({chat_id:event.chatId,sender_id:event.senderId,parent_id:event.parentId,message_id:event.messageId},now()-chatWindow);
        if (prior.scopeSections && prior.scopeOwner===confirmedAccount(current) &&
            (!prior.sourceId || allowedRead(event.chatId,event.senderId,prior.sourceId,now()-chatWindow,current))) {
          const choice=reportScopeAnswer(content,current);
          if (choice) resumedReport={request:{...choice,sections:JSON.parse(prior.scopeSections)},sourceId:prior.sourceId};
        }
      }
      if (content === '同意') {
        if (hasParent && !ownChat && isApprover(current,event.senderId) &&
            (!publicProposal || publicProposal.summary_id === event.parentId)) {
          kind = 'approval';
          anchor = event.parentId;
        }
      } else if (event.directedToBot === true && directGroupReport(content)) {
        kind='group_report';
      } else if (resumedReport) {
        kind='formal_report';
        if (hasParent) anchor=event.parentId;
      } else if (isAnalystRosterQuestion(content) && (event.directedToBot === true ||
          (hasParent && ownBotMessage.get(event.chatId,event.parentId,event.senderId)))) {
        kind = 'analyst_roster';
      } else if (queryFormal && (addressed || (hasParent && ownReportAt.get(event.chatId,event.parentId,event.senderId))) &&
          requestsNewReport(event,content,current)) {
        kind = 'formal_report';
        if (hasParent) anchor=event.parentId;
      } else if (classifyAssistantCommand && (addressed || (hasParent && proposalAtMessage.get(event.chatId,event.parentId))) &&
          isAssistantCommandCandidate(content,hasParent)) {
        kind = 'assistant_command';
        if (hasParent) anchor = event.parentId;
      } else if (ownChat && role) {
        kind = 'proposal_ai';
        anchor = event.parentId;
      } else if (role) {
        const proposal = hasParent && proposalBySummary.get(event.chatId,event.parentId);
        const parentDraft = hasParent && draftForAnchor(event.chatId,event.parentId);
        const rootDraft = !parentDraft && identifier(event.rootId) && draftForAnchor(event.chatId,event.rootId);
        const prompt = parentDraft || rootDraft;
        if (proposal) {
          if (proposal.sender_id === event.senderId && proposal.role === role) {
            kind = 'proposal_followup';
            anchor = event.parentId;
          }
        } else if (prompt) {
          if (prompt.sender_id === event.senderId && prompt.role === role) {
            kind = 'supplement';
            anchor = parentDraft ? event.parentId : event.rootId;
          }
        } else if (hasParent && pendingClarification.get(event.chatId,event.senderId)) {
          // The user can reply before Feishu returns the outgoing prompt's message ID.
          kind = 'supplement';
          anchor = event.parentId;
        } else if (event.directedToBot === true) {
          kind = 'proposal_ai';
          if (hasParent) anchor = event.parentId;
        }
      }
      if (!kind && current.demoMembershipUnavailable && !role && event.directedToBot && content !== '同意' &&
          !isApprover(current,event.senderId)) {
        // Returning normally would acknowledge a legitimate Demo analyst's submission as chat.
        throw Error('Demo 身份映射暂不可读，请重投本次消息。');
      }
      if (!kind && respondToChat && (ownChat || event.directedToBot === true ||
          (publicProposal && isApprover(current,event.senderId)))) {
        kind = 'chat';
        if (hasParent) anchor = event.parentId;
      }
    }
    if (!kind) return {accepted:false};
    return transaction(() => {
      const result = saveEvent.run(event.eventId,event.messageId,event.chatId,event.senderId,anchor ?? null,kind,content,eventTime(event),Number(event.directedToBot === true));
      if (result.changes && kind==='group_report') {
        const stored=inputById.get(event.eventId);
        const outcome=queuePublishedReport(stored,current);
        if (outcome!=='report_pending') finishEvent.run(outcome,stored.seq);
      }
      else if (result.changes && resumedReport) {
        const stored=inputById.get(event.eventId);
        const auth=reportAuthorization(stored,current,resumedReport.request);
        if (auth.ownerId) persistReportJob(stored,auth,resumedReport.sourceId,null);
        else {
          if (auth.scopeQuestion) askReportScope(stored,current,auth.error,auth.sections,resumedReport.sourceId);
          else notice(stored,'chat',auth.error);
          finishEvent.run('responded',stored.seq);
        }
      }
      if (result.changes && wake && (proposalKinds.has(kind) || kind === 'approval')) {
        const stored = inputById.get(event.eventId);
        if (kind === 'approval') {
          processKnownApproval(stored,current);
        } else {
          // Intent is not known until inference. A receipt must never claim a proposal or trade exists.
          notice(stored,'input_receipt',kind === 'supplement' ? '收到补充，正在核对。' : '收到，正在处理这条消息。');
        }
      }
      return {accepted:true, duplicate:result.changes === 0};
    });
  }

  function processKnownApproval(event,current) {
    const proposal = proposalBySummary.get(event.chat_id,event.parent_id);
    if (!proposal) return;
    if (!(proposal.demo_only && current.demoMembershipUnavailable) &&
        !earlierReply.get(event.chat_id,event.parent_id,event.seq)) {
      finishEvent.run(handleEvent(event,null),event.seq);
    } else if (current.chatId===event.chat_id && isApprover(current,event.sender_id) &&
        !proposal.approval && proposal.sender_id!==event.sender_id && roleFor(current,proposal.sender_id)===proposal.role) {
      notice(event,'input_receipt','收到确认请求，正在核对这条摘要。');
    }
  }

  function notice(event, kind, text, proposalId = null) {
    const id = stableId('feishu-reply',event.message_id,kind);
    queueMessage.run(id,event.chat_id,event.message_id,text,kind,proposalId);
    wake?.();
    return id;
  }

  function readNotice(event,kind,text) {
    const id = notice(event,kind,text);
    rememberRead.run(event.text.slice(0,1800),now(),id);
    return id;
  }

  function requestDetails(event, id, message) {
    notice(event,'clarification',message + '\n可以直接回复这条消息，我会接着处理。',id);
  }

  function chatScope(event,since) {
    const context = event.parent_id ? chatReply.get(since,event.chat_id,event.parent_id,event.sender_id) :
      recentChat.get(event.chat_id,event.sender_id,since);
    const session = context?.session_id ?? event.message_id;
    const proposal = event.parent_id && (publicProposalAt.get(event.chat_id,event.parent_id) ??
      (context?.proposal_id && publicProposalById.get(event.chat_id,context.proposal_id)));
    return {session,proposal,sourceId:context?.chat_source_id,scopeSections:context?.scope_sections,scopeOwner:context?.scope_owner};
  }

  function allowedRead(chat,sender,id,since,current) {
    const read = readSource.get(chat,sender,id,since);
    if (!read || current.chatId !== chat) return null;
    if (read.kind === 'formal_report') return queryFormal && reportAllowed(current,sender,read.owner_id,read.analyst_key,read.group_keys) ? read : null;
    if (read.kind === 'analyst_roster') return (isApprover(current,sender) || roleFor(current,sender)) &&
      read.text === analystRosterText(current) ? read : null;
    if (read.kind === 'assistant_reply' && isApprover(current,sender) &&
        read.text === pendingList(current,sender,read.chat_question)) return read;
    return null;
  }

  function requestsNewReport(event,content,current) {
    const intent = formalReportIntent(content,current);
    if (!intent) return false;
    if (respondToChat && !directFormalRead(content,intent)) return false;
    if (respondToChat && !intent.analystKey && !intent.everyone && !intent.self) {
      const currentEvent={chat_id:event.chatId,sender_id:event.senderId,message_id:event.messageId,parent_id:event.parentId};
      const {sourceId,session,proposal}=chatScope(currentEvent,now()-chatWindow);
      // A fresh request can use the current topic, or ask about the report that was just shown.
      // Let the model decide which; an omitted subject must never widen a contextual request to the whole account.
      if (isContextualReportQuestion(content) || sourceId || proposal || session!==event.messageId) return false;
    }
    return true;
  }

  function chatContext(event,since,{forExtraction = false} = {}) {
    const {session,proposal,sourceId,scopeSections,scopeOwner} = chatScope(event,since);
    const current=settings();
    const source = sourceId && allowedRead(event.chat_id,event.sender_id,sourceId,since,current);
    let readContext;
    if (source?.kind==='formal_report') {
      const label=source.analyst_key && publicAnalystDirectory(current).find(row=>row.role===source.analyst_key)?.label;
      readContext={source:'formal_report',scope:source.analyst_key?'named':'all',
        ...(label && {analyst:label}),...(source.sections && {sections:JSON.parse(source.sections)})};
    }
    if (scopeSections && scopeOwner===confirmedAccount(current) && (!sourceId || source)) {
      readContext={source:'report_scope_question',sections:JSON.parse(scopeSections)};
    }
    if (sourceId && (!source || forExtraction)) return {session:event.message_id,history:[],proposal,readTopic:Boolean(forExtraction),readContext};
    const recent = recentTurns.all(event.chat_id,event.sender_id,session,since).reverse();
    const turns = source ? recent.slice(-2) : recent;
    if (source) turns.unshift({user_text:source.chat_question,reply:source.text});
    const history = turns.flatMap(turn => [
      {role:'user',content:turn.user_text},{role:'assistant',content:turn.reply},
    ]);
    return {session,history,proposal,sourceId,readContext};
  }

  // Monitoring is best-effort and runs outside business transactions.
  function observeSafely(callback) {
    if (monitor) try { callback(); } catch { /* The workflow must continue if local diagnostics are unavailable. */ }
  }

  function formalGroupKeys(current) {
    return [...new Set(Object.values(current.analystBySender ?? {}).filter(role=>
      typeof role==='string' && role.trim() && !demoOnlyRole(current,role)))].sort();
  }

  function reportAllowed(current,sender,ownerId,analystKey,groupKeys) {
    if (!ownerId || confirmedAccount(current) !== ownerId) return false;
    if (analystKey===null) return isApprover(current,sender) && groupKeys===JSON.stringify(formalGroupKeys(current));
    return formalGroupKeys(current).includes(analystKey) && (isApprover(current,sender) || roleFor(current,sender)===analystKey);
  }

  // These labels are best effort and contain no question or report body. A confirmed send
  // retrieves the existing short-lived input. Uncertain deliveries never become training evidence.
  const readObservations=new Map();
  function scheduleReadObservation(event,readAction,modelComponent) {
    observeSafely(()=>{
      if (!monitor.observeRead) return;
      const topic=chatScope(event,now()-chatWindow);
      const kind=readAction==='group_report'?'group_report':readAction===null?'chat':readAction==='pending'?'assistant_reply':readAction==='analyst_roster'?'analyst_roster':'formal_report';
      const id=stableId('feishu-reply',event.message_id,kind);
      if (readObservations.size>=256) readObservations.delete(readObservations.keys().next().value);
      readObservations.set(id,{chatId:event.chat_id,senderId:event.sender_id,messageId:event.message_id,
        threadId:readAction===null?topic.session:id,relatedThreadId:event.parent_id ? topic.session : undefined,
        readAction,modelSelected:Boolean(modelComponent),modelComponent,
        ...(readAction==='group_report' && {text:event.text.slice(0,1800)})});
    });
  }

  function reportAuthorization(event,current,request) {
    if (current.chatId !== event.chat_id) return {};
    const ownRole = roleFor(current,event.sender_id);
    const pm = isApprover(current,event.sender_id);
    if (!pm && (!ownRole || demoOnlyRole(current,ownRole))) return {error:'正式报表仅向本群已绑定的正式分析师和 PM 提供查询。'};
    if (!request?.sections) return {error:request?.error ?? '请说明要查询建议、评分还是模拟成交。'};
    const ownerId = confirmedAccount(current);
    if (!ownerId) return {error:'当前群尚未绑定已确认的正式模拟账户。'};
    if (request.self && !request.analystKey && pm && !ownRole) {
      return {error:'你当前以 PM 身份查询。请指定分析师名字，或说「全组」。',scopeQuestion:true,sections:request.sections};
    }
    const analystKey = request.analystKey ?? ((!pm || request.self) ? ownRole : null);
    const groupKeys=analystKey===null ? JSON.stringify(formalGroupKeys(current)) : null;
    if ((!pm && request.everyone) || !reportAllowed(current,event.sender_id,ownerId,analystKey,groupKeys)) {
      return {error:'分析师可以查本人的正式记录。跨分析师查询请由本群 PM 发起。'};
    }
    return {ownerId,analystKey,sections:request.sections,groupKeys};
  }

  function persistReportJob(event,authorized,sourceId,component) {
    saveReportJob.run(event.event_id,authorized.ownerId,authorized.analystKey,JSON.stringify(authorized.sections),
      sourceId ?? null,component,authorized.groupKeys);
  }

  function queuePublishedReport(event,current,component=null) {
    if (event.directed_to_bot!==1 || current.chatId!==event.chat_id) {
      notice(event,'chat','请在本群 @助手生成群分析报告。');
      return 'responded';
    }
    const ownerId=confirmedAccount(current);
    if (!queryGroupReport || !ownerId) {
      notice(event,'chat','本群报告暂时无法读取正式数据。');
      return 'responded';
    }
    persistReportJob(event,{ownerId,analystKey:null,sections:['recommendations','scores','trades'],
      groupKeys:JSON.stringify(formalGroupKeys(current))},null,component);
    if (event.kind!=='group_report') db.prepare("UPDATE feishu_workflow_events SET kind='group_report' WHERE seq=?").run(event.seq);
    wake?.();
    return 'report_pending';
  }

  function publishedScopeAllowed(current,scope) {
    return Boolean(queryGroupReport && scope?.owner_id && confirmedAccount(current)===scope.owner_id &&
      scope.analyst_key===null && scope.group_keys===JSON.stringify(formalGroupKeys(current)));
  }

  async function publishGroupReport(event,job) {
    const allowed=current=>event.directed_to_bot===1 && current.chatId===event.chat_id && publishedScopeAllowed(current,job);
    let text, successful=false;
    if (allowed(settings())) {
      try {
        text=await queryGroupReport({chatId:event.chat_id,expectedOwnerId:job.owner_id,analystKeys:JSON.parse(job.group_keys)});
        if (typeof text!=='string' || !text.trim() || text.length>10000) throw Error('Invalid group report');
        successful=true;
      } catch {
        text='本次未能生成正式群分析报告，请稍后重新查询。';
      }
    }
    transaction(()=>{
      const publish=text && allowed(settings());
      if (publish) {
        // A fixed public report has no individual lookup or private conversational read scope.
        const id=notice(event,'group_report',text);
        saveReportScope.run(id,event.sender_id,job.owner_id,null,job.sections,job.group_keys);
        if (successful) scheduleReadObservation(event,'group_report',job.model_component);
      }
      finishEvent.run(publish?'responded':'ignored',event.seq);
      finishReportJob.run(event.event_id);
    });
  }

  function askReportScope(event,current,message,sections,sourceId) {
    const id=notice(event,'chat',message);
    db.prepare('UPDATE feishu_workflow_messages SET scope_sections=?,scope_owner=?,chat_source_id=? WHERE id=?')
      .run(JSON.stringify(sections),confirmedAccount(current),sourceId ?? null,id);
    saveChatTurn.run(id,event.chat_id,event.sender_id,event.message_id,event.text.slice(0,1800),now());
    pruneChatTurns.run(event.chat_id,event.sender_id,event.chat_id,event.sender_id);
  }

  async function readFormalReport(event,job) {
    const current=settings();
    if (current.chatId!==event.chat_id) return {};
    const authorized=job ? {ownerId:job.owner_id,analystKey:job.analyst_key,sections:JSON.parse(job.sections),groupKeys:job.group_keys} :
      reportAuthorization(event,current,formalReportIntent(event.text,current));
    if (!authorized.ownerId) return authorized;
    const {ownerId,analystKey,sections,groupKeys}=authorized;
    if (!reportAllowed(current,event.sender_id,ownerId,analystKey,groupKeys) ||
        (job?.source_id && !allowedRead(event.chat_id,event.sender_id,job.source_id,now()-chatWindow,current))) return {};
    if (!queryFormal) return {error:'正式报表查询当前未接通。'};
    try {
      const text = await queryFormal({expectedOwnerId:ownerId,analystKey,sections,...(analystKey===null && {analystKeys:JSON.parse(groupKeys)})});
      if (typeof text !== 'string' || !text.trim() || text.length > 10000) throw Error('Invalid report');
      return {text,ownerId,analystKey,sections,groupKeys};
    } catch {
      return {error:'这次未能读取正式系统的数据，请稍后重新查询。'};
    }
  }

  async function getInterpretation(event,trace) {
    async function extract(input) {
      if (!trace) return extractWithModel?.(input);
      trace.input = input;
      try {
        const packet = await extractWithModel?.({...input,onRawPacket:packet => { trace.rawPacket = packet; }});
        trace.packet = packet;
        return packet;
      } catch (error) {
        trace.failed = true;
        throw error;
      }
    }
    if (event.kind === 'assistant_command') {
      if (settings().chatId !== event.chat_id) return null;
      try {
        const command = await classifyAssistantCommand({text:event.text,hasParent:Boolean(event.parent_id)});
        return {command};
      } catch {
        return {};
      }
    }
    if (!proposalKinds.has(event.kind)) return null;
    const current = settings();
    const role = roleFor(current,event.sender_id);
    if (current.chatId !== event.chat_id || !role) return null;
    if (event.kind === 'proposal_followup') {
      const proposal = proposalBySummary.get(event.chat_id,event.parent_id);
      if (!proposal || proposal.sender_id !== event.sender_id || proposal.role !== role) return null;
      if (isAdviceOnlyCommand(event.text)) return {role,packet:{intent:'proposal',fields:{}}};
      const {recommendation,simulation} = JSON.parse(proposal.body);
      try {
        const packet = await extract({text:event.text,receivedAt:event.received_at,
          priorFields:{...recommendation,...simulation},isSupplement:true,pendingApproval:!proposal.approval});
        if (packet?.intent==='read') return {role,tool:packet.query};
        if (respondToChat && ['help','other'].includes(packet?.intent)) return {role,chat:true};
        return {role,packet};
      } catch {
        return {role};
      }
    }
    const threaded = event.kind === 'supplement' ? draftForAnchor(event.chat_id,event.parent_id) : null;
    if (event.kind === 'supplement' && (threaded?.sender_id !== event.sender_id || threaded.role !== role)) return null;
    const chat = respondToChat && !threaded && chatContext(event,now()-chatWindow,{forExtraction:true});
    const conversation = chat?.history ?? [];
    const talking = respondToChat && (event.parent_id || conversation.length || chat?.readTopic);
    const recent = !threaded && !talking && event.kind === 'proposal_ai' ? recentDrafts.all(event.chat_id,event.sender_id,role,
      new Date(Date.parse(event.received_at)-recentDraftWindow).toISOString()) : [];
    let draft = threaded ?? (recent.length === 1 ? recent[0] : null);
    if (draft && isAdviceOnlyCommand(event.text)) return {role,draft,packet:{intent:'proposal',fields:{}}};
    try {
      let priorFields = draft ? JSON.parse(draft.fields) : {};
      const packet = await extract({text:event.text,receivedAt:draft?.received_at ?? event.received_at,
        priorFields,pendingFields:draft ? missingFields(priorFields) : [],isSupplement:Boolean(draft),
        ...(conversation.length && {conversation}),...(chat?.readContext && {readContext:chat.readContext})});
      if (packet?.intent==='read') return {role,tool:packet.query};
      const completeNew = packet?.fields?.action && (packet.fields.ticker || packet.fields.securityName);
      if (!threaded && packet?.intent === 'proposal' && (completeNew || (draft && !isUnlinkedSupplement(packet,priorFields)))) {
        draft = null;
        priorFields = {};
      }
      if (respondToChat && event.kind === 'proposal_ai') {
        const explicit = groundedQuote(event.text,packet?.fields?.action?.evidence) || groundedQuote(event.text,packet?.intentEvidence);
        const newProposal = ['proposal','ambiguous'].includes(packet?.intent) && explicit;
        if (packet?.intent === 'other' || packet?.intent === 'help' || (!draft && !newProposal && packet?.intent !== 'cancel')) {
          return {role,chat:true};
        }
      }
      if (!threaded && recent.length > 1 && (packet?.intent === 'cancel' || (packet?.intent === 'proposal' && !completeNew))) {
        return {role,packet,chooseDraft:true};
      }
      const query = searchSecurity && packet?.intent === 'proposal' && proposalSecurityQuery(event.text,packet,priorFields);
      const catalogue = query ? await searchSecurity(query).catch(() => []) : undefined;
      return {role,packet,draft,catalogue};
    } catch {
      if (respondToChat && event.kind === 'proposal_ai' && !draft) return {role,chat:true};
      return {role,draft};
    }
  }

  function groundedCancellation(event, packet) {
    return packet?.intent === 'cancel' && groundedQuote(event.text,packet.intentEvidence);
  }

  function displayName(current, role) {
    const names = current.analystNamesByRole ?? {};
    return Object.hasOwn(names,role) ? names[role] : ['A','B'].includes(role) ? '分析师 ' + role : null;
  }

  function queueProposal(event, role, id, body, name, accountId, origin = event.message_id, warnings = []) {
    const demoOnly = demoOnlyRole(settings(),role);
    db.prepare(`INSERT INTO feishu_workflow_proposals
      (id,origin,chat_id,sender_id,role,body,simulation_status,simulation_account,demo_only) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id,origin,event.chat_id,event.sender_id,role,JSON.stringify(body),
        body.simulation ? 'awaiting_approval' : 'not_requested',accountId,Number(demoOnly));
    notice(event,'summary',[summary(body,id,name ?? role,accountId),...warnings].join('\n'),id);
  }

  function handleProposalFollowup(event, current, inference) {
    const proposal = proposalBySummary.get(event.chat_id,event.parent_id);
    if (!proposal || proposal.sender_id !== event.sender_id || roleFor(current,event.sender_id) !== proposal.role || inference?.role !== proposal.role) return 'ignored';
    const packet = inference.packet;
    const adviceOnly = isAdviceOnlyCommand(event.text) || modelExecutionMode(event.text,packet) === 'advice_only';
    const cancel = groundedCancellation(event,packet);
    if (!packet) {
      notice(event,'help','我暂时无法识别这条回复。请直接回复原摘要重试。');
      return 'responded';
    }
    const proposedChange = packet.intent === 'proposal' && Object.keys(packet.fields ?? {}).length > 0;
    if (!cancel && !adviceOnly && packet.intent !== 'help' && !proposedChange) return 'ignored';
    if (proposal.approval || proposal.demo_status === 'withdrawn') {
      notice(event,'help',proposal.approval ? '这条建议已收到 PM 确认。变更请联系 PM 核对登记结果。' : '这条建议已经撤回。');
      return 'responded';
    }
    if (!cancel && !adviceOnly) {
      const waiting = '这条建议正在等 PM 回复「同意」。';
      notice(event,'help',packet.helpTopic === 'investment' ? investmentHelp : waiting +
        (proposedChange ? '如果要修改，请先回复原摘要撤回这条建议，再发一条新的。' : ''));
      return 'responded';
    }
    const body = JSON.parse(proposal.body);
    if (!cancel && !body.simulation) {
      notice(event,'help','这条摘要已经是仅登记建议，正在等 PM 确认。');
      return 'responded';
    }
    if (!withdrawProposal.run(proposal.id).changes) return 'ignored';
    if (cancel) {
      notice(event,'withdrawal','已撤回这条待确认建议，原摘要停止接受确认。',proposal.id);
    } else {
      const id = stableId('feishu-proposal',event.chat_id,event.message_id);
      queueProposal(event,proposal.role,id,{...body,simulation:null},displayName(current,proposal.role),
        proposal.simulation_account,event.message_id,['已取消模拟成交。请 PM 确认这条新摘要。']);
    }
    return 'withdrawn';
  }

  function handleProposal(event, current, inference) {
    const role = roleFor(current,event.sender_id);
    if (!role || inference?.role !== role) return 'ignored';
    const draft = inference.draft;
    if (event.kind === 'supplement' && (draft?.sender_id !== event.sender_id || draft.role !== role)) return 'ignored';

    const origin = draft?.origin ?? event.message_id;
    const receivedAt = draft?.received_at ?? event.received_at;
    const id = draft?.id ?? stableId('feishu-proposal',event.chat_id,origin);
    const name = displayName(current,role);
    const aliases = current.analystAliasesByRole ?? {};
    const interpretation = inference.packet;
    if (inference.chooseDraft) {
      notice(event,'help','你有几条待补充建议。请直接回复对应的追问，我就能补到那一条。');
      return 'awaiting_details';
    }
    const priorFields = draft ? JSON.parse(draft.fields) : {};
    if (interpretation?.intent === 'cancel') {
      if (!groundedCancellation(event,interpretation)) return 'ignored';
      if (!draft || event.kind !== 'supplement') {
        notice(event,'help','请直接回复要撤回的待确认摘要或补充提示，我会定位到那条建议。');
        return 'responded';
      }
      removeDraft(id);
      notice(event,'withdrawal','已撤回这条草稿。',id);
      return 'withdrawn';
    }
    if (interpretation?.intent === 'help' || interpretation?.intent === 'other') {
      if (interpretation.helpTopic === 'investment' || interpretation.helpTopic === 'usage') {
        notice(event,'help',interpretation.helpTopic === 'investment' ? investmentHelp : usageHelp);
      } else if (draft) {
        const missing = missingLabels(priorFields);
        const pendingFill = missing.some(item => item.startsWith('模拟成交'));
        const example = missing.includes('模拟成交价') ?
          (priceExamples[priorFields.market] ? `模拟成交价 ${priceExamples[priorFields.market]}` : '模拟成交价 150（注明币种）') : '200 股';
        requestDetails(event,id,`这条建议还差${missing.join('、')}。` + (pendingFill ?
          `请提供你确认的成交信息，例如「${example}」。若只记建议，可以回复「仅登记建议」。` : '直接补充即可，已经识别的内容会保留。'));
      } else if (interpretation.intent === 'help') {
        notice(event,'help',usageHelp);
      } else {
        return 'ignored';
      }
      return 'responded';
    }
    if (interpretation?.intent === 'ambiguous') {
      if (!draft) saveDraft.run(id,origin,event.chat_id,event.sender_id,role,receivedAt,'{}');
      requestDetails(event,id,'这句话存在歧义，请明确要登记的单条建议。');
      return 'awaiting_details';
    }
    if (interpretation?.intent !== 'proposal' || !interpretation.fields || typeof interpretation.fields !== 'object' ||
        Array.isArray(interpretation.fields)) {
      if (!draft) saveDraft.run(id,origin,event.chat_id,event.sender_id,role,receivedAt,'{}');
      requestDetails(event,id,'建议识别模型暂时不可用。请直接回复原句重试。');
      return 'awaiting_details';
    }
    if (!draft && !interpretation.fields.action && !interpretation.fields.ticker && !interpretation.fields.securityName &&
        (isAdviceOnlyCommand(event.text) || modelExecutionMode(event.text,interpretation) === 'advice_only')) {
      notice(event,'help','请直接回复那条补充提示或待确认摘要，我会按你的意思仅登记建议。');
      return 'responded';
    }
    let parsed;
    try {
      parsed = evaluateProposal(role,name,event.text,receivedAt,Object.hasOwn(aliases,role) ? aliases[role] : [],
        priorFields,interpretation,inference.catalogue);
    } catch (error) {
      if (error.status !== 400 && error.status !== 403) throw error;
      if (draft) {
        requestDetails(event,id,error.message);
      } else {
        // Ambiguous first messages have no reliable set of fields to carry forward.
        saveDraft.run(id,origin,event.chat_id,event.sender_id,role,receivedAt,'{}');
        requestDetails(event,id,error.message + ' 请重新描述一条完整建议。');
      }
      return 'rejected';
    }
    const {fields, missing, body, warnings = []} = parsed;
    if (!body) {
      saveDraft.run(id,origin,event.chat_id,event.sender_id,role,receivedAt,JSON.stringify(fields));
      const lines = [`${name ?? role}，这条建议还需要补充${missing.join('、')}。`,...warnings];
      if (missingFields(fields).includes('ticker')) {
        const options = inference.catalogue?.filter(item => !fields.market || item.market === fields.market)
          .map(item => `${item.market === 'A' ? 'A 股' : item.market === 'HK' ? '港股' : '美股'} ${item.ticker}`);
        if (interpretation.fields?.ticker?.requiresListing) lines.push(`我读到了 ${interpretation.fields.ticker.value}，目前无法在证券主表中核实对应代码。请核对代码或稍后重试。`);
        else if (options?.length > 1) lines.push(`「${fields.securityName}」查到 ${options.join('、')}，你指哪一个？`);
        else if (fields.securityName) lines.push(`我读到的标的是「${fields.securityName}」。可以补充上市市场，或把公司名和完整代码一起发来。`);
        else lines.push('可以直接说公司名，也可以填股票代码，例如 00700.HK 或 600519.SH。');
      }
      if (missing.includes('建议动作')) lines.push('可选买入、加仓、减仓、卖出、持有或观望。');
      if (missing.includes('模拟成交价') || missing.includes('模拟成交股数')) {
        if (fields.ticker) lines.push(`已识别标的 ${fields.ticker}。`);
        lines.push('请按本次拟成交的股数和每股价格补充缺项。');
        lines.push('只需登记分析建议时，可回复「仅登记建议」。');
      }
      requestDetails(event,id,lines.join('\n'));
      return 'awaiting_details';
    }
    const demoOnly = demoOnlyRole(current,role);
    const accountId = demoOnly ? null : confirmedAccount(current);
    if (demoOnly && body.simulation) {
      saveDraft.run(id,origin,event.chat_id,event.sender_id,role,receivedAt,JSON.stringify(fields));
      requestDetails(event,id,'你已开通 Demo，正式模拟成交尚未绑定。如要登记本条分析建议，请回复「仅登记建议」。');
      return 'awaiting_details';
    }
    if (!register && !accountId && !(demoOnly && registerDemoOnly)) {
      notice(event,'help','正式模拟账户尚未绑定，请 PM 核对后重新提交。');
      return 'blocked';
    }
    queueProposal(event,role,id,body,name,accountId,origin,warnings);
    if (draft) removeDraft(id);
    return 'processed';
  }

  function pendingList(current,sender,question) {
    const list = db.prepare(`SELECT id,sender_id,role,body FROM feishu_workflow_proposals
      WHERE chat_id=? AND sender_id<>? AND approval IS NULL AND demo_status='awaiting_approval'
      AND summary_id IS NOT NULL ORDER BY rowid`).all(current.chatId,sender)
      .filter(p => roleFor(current,p.sender_id) === p.role);
    if (!list.length) return '本群暂无待你确认的提案。';
    const pages = Math.ceil(list.length/15);
    const requested = Number(question.trim().match(/(?:第\s*)?(\d+)\s*页?$/)?.[1] ?? 1);
    const page = Math.min(pages,Math.max(1,requested));
    return [`本群待确认 ${list.length} 条 · 第 ${page}/${pages} 页`,
      ...list.slice((page-1)*15,page*15).map(p => `${displayName(current,p.role) ?? p.role} · ${JSON.parse(p.body).recommendation.ticker} · ${p.id}`),
      ...(page < pages ? [`发送「待办 第 ${page+1} 页」查看下一页。`] : []),
      '请在对应的最新摘要下回复「同意」。'].join('\n');
  }

  function queueModelRead(event,answer,current) {
    const tool=parseFeishuReadTool(answer);
    const clarify = message => {
      notice(event,'chat',message);
      return 'responded';
    };
    if (!tool) return clarify('请说明要查看哪项记录。');
    if (tool.read==='group_report') {
      if (!allowsGroupReportScope(event.text,current)) return clarify('群分析报告汇总本群已绑定分析师的建议、评分和关联成交。需要全组报告时请 @助手生成群分析报告。');
      return queuePublishedReport(event,current,event.kind==='chat'?'chat':'extraction');
    }
    if (tool.read==='analyst_roster') {
      readNotice(event,'analyst_roster','');
      if (isApprover(current,event.sender_id) || roleFor(current,event.sender_id)) scheduleReadObservation(event,tool.read,event.kind==='chat'?'chat':'extraction');
      return 'responded';
    }
    if (tool.read==='pending') {
      if (!isApprover(current,event.sender_id)) return clarify('只有当前群的确认人可以查看 PM 待办。');
      readNotice(event,'assistant_reply',pendingList(current,event.sender_id,event.text));
      scheduleReadObservation(event,tool.read,event.kind==='chat'?'chat':'extraction');
      return 'responded';
    }
    if (!queryFormal) return clarify('正式报表查询当前未接通。');
    const since=now()-chatWindow;
    const {history,proposal,sourceId}=chatContext(event,since);
    const source=sourceId && allowedRead(event.chat_id,event.sender_id,sourceId,since,current);
    const request=groundFormalRead(tool,event.text,current,{ownRole:roleFor(current,event.sender_id),history,proposal,source});
    const authorized=reportAuthorization(event,current,request);
    if (!authorized.ownerId) {
      if ((request.scopeQuestion || authorized.scopeQuestion) && confirmedAccount(current) &&
          (isApprover(current,event.sender_id) || (roleFor(current,event.sender_id) && !demoOnlyRole(current,roleFor(current,event.sender_id))))) {
        askReportScope(event,current,authorized.error,tool.sections,sourceId);
        return 'responded';
      }
      return clarify(authorized.error ?? '当前群没有可查询的正式账户。');
    }
    persistReportJob(event,authorized,sourceId,event.kind==='chat'?'chat':'extraction');
    db.prepare("UPDATE feishu_workflow_events SET kind='formal_report' WHERE seq=?").run(event.seq);
    wake?.();
    return 'report_pending';
  }

  function handleAssistantCommand(event,current,interpretation) {
    const command = interpretation?.command;
    const respond = (text,id) => {
      notice(event,'assistant_reply',text,id);
      return 'responded';
    };
    switch (command?.intent) {
      case 'join':
      case 'membership':
        if (command.intent === 'membership' && db.prepare(`SELECT 1 FROM feishu_membership_jobs j
          JOIN feishu_workflow_events e ON e.event_id=j.event_id WHERE j.action='join' AND e.status='pending'
          AND e.chat_id=? AND e.sender_id=? LIMIT 1`).get(event.chat_id,event.sender_id)) {
          return respond('已收到你的开通申请，正在等待 Demo 建档回执；服务恢复后会自动继续。');
        }
        if (!provisionAnalyst) return respond('Demo 开通服务尚未启用。');
        db.prepare('INSERT INTO feishu_membership_jobs(event_id,action,display_name) VALUES (?,?,?)')
          .run(event.event_id,command.intent,command.displayName ?? null);
        return 'membership_pending';
      case 'pending': {
        if (!isApprover(current,event.sender_id)) return respond('只有当前群的确认人可以查看 PM 待办。');
        readNotice(event,'assistant_reply',pendingList(current,event.sender_id,event.text));
        scheduleReadObservation(event,'pending');
        return 'responded';
      }
      case 'status':
      case 'revise':
        break;
      default:
        return respond('群务助手暂未识别这条请求。可发送「申请成为分析师，署名张三」「查状态」或「待办」。');
    }
    const proposal = command.proposalId && isUuid(command.proposalId)
      ? proposalById.get(command.proposalId)
      : event.parent_id && (proposalAtMessage.get(event.chat_id,event.parent_id) ??
        db.prepare('SELECT * FROM feishu_workflow_proposals WHERE chat_id=? AND origin=?').get(event.chat_id,event.parent_id));
    const owns = proposal && proposal.sender_id === event.sender_id && roleFor(current,event.sender_id) === proposal.role;
    if (!proposal || proposal.chat_id !== event.chat_id || (!owns && !isApprover(current,event.sender_id))) {
      return respond('请回复自己有权查看的提案摘要，或用「查提案 完整提案编号」查询。');
    }
    if (command.intent === 'status') {
      const approver = proposal.approver_id && pairingReference(proposal.chat_id,proposal.approver_id);
      return respond(proposalStatus(proposal,notificationStates.all(proposal.id),'确认人配对编号 '+approver),proposal.id);
    }
    if (!owns) return respond('仅原分析师可修改待确认提案。');
    if (proposal.approval || proposal.demo_status !== 'awaiting_approval') return respond('该提案已确认或已撤回，无法修改。');
    if (!proposal.summary_id || event.parent_id !== proposal.summary_id) return respond('请直接回复当前最新的待确认摘要进行修改。');
    const name = displayName(current,proposal.role) ?? proposal.role;
    let updated;
    try {
      updated = reviseProposal(proposal,event.text,name,event.received_at);
    } catch (error) {
      if (error.status !== 400 && error.status !== 403) throw error;
      return respond(error.message,proposal.id);
    }
    if (proposal.demo_only && updated.body.simulation) return respond('本档案仅开通 Demo，不能申请正式模拟成交。');
    db.prepare('INSERT INTO feishu_proposal_revisions VALUES (?,?,?,?,?)')
      .run(proposal.id,proposal.revision,proposal.summary_id,proposal.body,event.received_at);
    db.prepare(`UPDATE feishu_workflow_proposals SET body=?,revision=revision+1,summary_id=NULL,reminder_due_at=NULL,
      simulation_status=? WHERE id=?`).run(JSON.stringify(updated.body),
        updated.body.simulation ? 'awaiting_approval' : 'not_requested',proposal.id);
    notice(event,'summary',[`已修订至第 ${proposal.revision+1} 版 · ${updated.change}`,
      '之前的摘要已失效。',summary(updated.body,proposal.id,name,proposal.simulation_account)].join('\n'),proposal.id);
    return 'revised';
  }

  function queueDueReminder() {
    if (!classifyAssistantCommand || !(reminderAfterMs > 0)) return;
    const current = settings();
    if (!current.chatId) return;
    const proposal = db.prepare(`SELECT * FROM feishu_workflow_proposals WHERE chat_id=?
      AND reminder_due_at<=? AND approval IS NULL AND demo_status='awaiting_approval'
      AND summary_id IS NOT NULL AND (?=0 OR demo_only=0) ORDER BY reminder_due_at LIMIT 1`).get(current.chatId,now(),Number(Boolean(current.demoMembershipUnavailable)));
    if (!proposal) return;
    transaction(() => {
      db.prepare('UPDATE feishu_workflow_proposals SET reminder_due_at=NULL WHERE id=?').run(proposal.id);
      if (roleFor(current,proposal.sender_id) !== proposal.role || !current.approverIds?.some(id => id !== proposal.sender_id)) return;
      // One delivered reminder per proposal, even across revisions. An unsent reminder for a
      // superseded version may have been suppressed; its delivery token cannot be repurposed.
      const previous = db.prepare("SELECT 1 FROM feishu_workflow_messages WHERE proposal_id=? AND kind='reminder' AND status<>'superseded'")
        .get(proposal.id);
      if (!previous) queueMessage.run(stableId('pm-reminder',proposal.id,proposal.revision),proposal.chat_id,proposal.summary_id,
        `提醒 PM：${JSON.parse(proposal.body).recommendation.ticker} 的提案 ${proposal.id} 仍待确认，请在上方最新摘要回复「同意」。`,
        'reminder',proposal.id);
    });
  }

  function handleEvent(event, interpretation) {
    const current = settings();
    if (event.kind === 'pair' && (!current.chatId || current.chatId === event.chat_id)) {
      const reference = pairingReference(event.chat_id,event.sender_id);
      const destination = register ? 'Demo 的飞书绑定设置' : '正式连接器的飞书绑定设置';
      notice(event, 'pair', `Osborn Alpha 已收到配对消息。配对编号 ${reference}，请 PM 在${destination}中核对。`);
      return 'paired';
    }
    if (current.chatId !== event.chat_id) return 'ignored';
    if (event.kind === 'analyst_roster') {
      // Render against the current membership when the queued reply is delivered.
      readNotice(event,'analyst_roster','');
      if (isApprover(current,event.sender_id) || roleFor(current,event.sender_id)) scheduleReadObservation(event,'analyst_roster');
      return 'responded';
    }
    if (interpretation?.tool && roleFor(current,event.sender_id)===interpretation.role) return queueModelRead(event,interpretation.tool,current);
    if (event.kind === 'assistant_command') return handleAssistantCommand(event,current,interpretation);
    if (event.kind === 'greeting' && respondToChat) {
      notice(event,'chat','我在，你想问什么？');
      return 'responded';
    }
    if (interpretation?.chat && ['proposal_ai','proposal_followup'].includes(event.kind) &&
        roleFor(current,event.sender_id) === interpretation.role) return 'chat_pending';
    if (event.kind === 'proposal_followup') return handleProposalFollowup(event,current,interpretation);
    if (proposalKinds.has(event.kind)) return handleProposal(event,current,interpretation);
    if (event.kind !== 'approval' || event.text !== '同意' || !isApprover(current,event.sender_id)) return 'ignored';
    const proposal = proposalBySummary.get(event.chat_id,event.parent_id);
    if (!proposal || proposal.sender_id === event.sender_id || roleFor(current, proposal.sender_id) !== proposal.role) return 'ignored';
    if (proposal.approval) return 'duplicate_approval';
    if (proposal.demo_status !== 'awaiting_approval') return 'ignored';
    const formalStatus = proposal.demo_only ? 'demo_only' : !proposal.simulation_account ? 'awaiting_account' :
      confirmedAccount(current) === proposal.simulation_account ? 'pending_formal_sync' : 'blocked';
    const simulationStatus = proposal.simulation_status === 'not_requested' ? 'not_requested' :
      formalStatus;
    db.prepare(`UPDATE feishu_workflow_proposals SET approval=?,approver_id=?,approved_at=?,demo_status=?,
      formal_status=?,simulation_status=?,formal_error=? WHERE id=? AND demo_status='awaiting_approval' AND approval IS NULL`)
      .run(event.message_id,event.sender_id,event.received_at,(register || (proposal.demo_only && registerDemoOnly)) ? 'pending' : 'not_requested',formalStatus,simulationStatus,
        formalStatus === 'blocked' ? '确认时的模拟账户与摘要显示的账户不一致。' : null,proposal.id);
    if (!register && !proposal.demo_only && formalStatus !== 'pending_formal_sync') {
      notice(event,'formal_result','正式同步已暂停，请 PM 核对摘要上的模拟账户绑定后重发建议。',proposal.id);
    } else if (wake) notice(event,'approval_receipt','已收到你的确认，登记结果会在这条提案下回复。',proposal.id);
    return 'processed';
  }

  function finishProposal(proposal, status, entry, error) {
    transaction(() => {
      db.prepare('UPDATE feishu_workflow_proposals SET demo_status=?,demo_id=?,error=? WHERE id=?')
        .run(status,entry?.id ?? null,error,proposal.id);
      if (entry) trackDemoRecap?.(proposal.id,entry);
      const result = entry ? demoResult(entry) : error;
      let formal = '';
      if (proposal.demo_only) formal = 'Demo 已开通，正式模拟账户尚未绑定。';
      if (proposal.formal_status === 'awaiting_account') formal = '正式系统尚未绑定模拟账户，请联系 PM 核对本提案。';
      if (proposal.formal_status === 'blocked') formal = '正式系统记录暂停，摘要对应的模拟账户已变更，请联系 PM 核对。';
      if (proposal.formal_status === 'pending_formal_sync' && !syncFormal) formal = '正式系统记录等待同步。';
      notice({chat_id:proposal.chat_id,message_id:proposal.summary_id}, 'result',
        [result,formal].filter(Boolean).join('\n'), proposal.id);
    });
  }

  function stillAuthorized(current, proposal) {
    return current.chatId === proposal.chat_id && proposal.sender_id !== proposal.approver_id &&
      roleFor(current, proposal.sender_id) === proposal.role &&
      isApprover(current, proposal.approver_id);
  }

  async function registerProposal(proposal) {
    const current = settings();
    if (proposal.demo_only && current.demoMembershipUnavailable) {
      db.prepare("UPDATE feishu_workflow_proposals SET due_at=?,error=? WHERE id=?")
        .run(now()+5_000,'正在等待 Demo 的身份映射恢复。',proposal.id);
      return;
    }
    if (!stillAuthorized(current, proposal)) {
      db.prepare("UPDATE feishu_workflow_proposals SET demo_status='blocked',error=? WHERE id=?")
        .run('群、分析师或审批人映射已变更。',proposal.id);
      return;
    }
    const {recommendation} = JSON.parse(proposal.body);
    const attempts = proposal.attempts + 1;
    db.prepare('UPDATE feishu_workflow_proposals SET attempts=? WHERE id=?').run(attempts,proposal.id);
    let entry;
    try {
      const writeDemo = proposal.demo_only ? (registerDemoOnly ?? register) : register;
      entry = await writeDemo({role:proposal.role,fields:{...recommendation,requestId:proposal.id},proposalId:proposal.id});
      if (typeof entry?.id !== 'string' || !entry.id) throw new Error('missing registration id');
    } catch (error) {
      if (attempts < 5 && error.retriable !== false && !(error.status >= 400 && error.status < 500 && ![408,429].includes(error.status))) {
        db.prepare('UPDATE feishu_workflow_proposals SET due_at=?,error=? WHERE id=?')
          .run(now() + 2 ** attempts * 1000,'Demo 登记暂不可用，将重试。',proposal.id);
        return;
      }
      const uncertain = error.retriable !== false && !(error.status >= 400 && error.status < 500);
      finishProposal(proposal,uncertain ? 'uncertain' : 'failed',null,uncertain
        ? 'Demo 登记回执待核实，请按原提案编号核对。' : 'Demo 建议登记失败，请检查分析师映射或提案。');
      return;
    }
    finishProposal(proposal,'registered',entry,null);
  }

  function finishFormal(proposal, status, result, error) {
    transaction(() => {
      const requested = proposal.simulation_status !== 'not_requested';
      const simulationStatus = requested ? status : 'not_requested';
      db.prepare(`UPDATE feishu_workflow_proposals SET formal_status=?,simulation_status=?,formal_id=?,
        decision_id=?,trade_id=?,formal_error=? WHERE id=?`).run(status,simulationStatus,
        result?.recommendationId ?? null, result?.decisionId ?? null, result?.tradeId ?? null,error,proposal.id);
      const resultText = result ? [
        `正式系统建议已登记 ${result.recommendationId}`,
        result.tradeId && `正式系统模拟成交已登记 ${result.tradeId}`,
      ].filter(Boolean).join('\n') : error;
      notice({chat_id:proposal.chat_id,message_id:proposal.summary_id},'formal_result',resultText,proposal.id);
    });
  }

  async function syncProposal(proposal) {
    const current = settings();
    if (proposal.demo_only || demoOnlyRole(current,proposal.role) || !stillAuthorized(current,proposal) || confirmedAccount(current) !== proposal.simulation_account) {
      finishFormal(proposal,'blocked',null,'正式系统同步暂停，群成员或确认时绑定的模拟账户已变更。');
      return;
    }
    const {recommendation,simulation} = JSON.parse(proposal.body);
    const {direction, ...execution} = simulation ?? {};
    const attempts = proposal.formal_attempts + 1;
    db.prepare('UPDATE feishu_workflow_proposals SET formal_attempts=? WHERE id=?').run(attempts,proposal.id);
    let result;
    try {
      result = await syncFormal({sourceId:proposal.id,analystKey:proposal.role,recommendation,
        approvedAt:proposal.approved_at,expectedOwnerId:proposal.simulation_account,
        ...(simulation ? {execution:{...execution,executed_at:proposal.approved_at}} : {}),
      });
      if (!isUuid(result?.recommendationId) || (simulation && (!isUuid(result?.decisionId) || !isUuid(result?.tradeId)))) {
        throw new Error('missing formal record IDs');
      }
    } catch (error) {
      const retry = error.retriable !== false && attempts < 5 &&
        !(error.status >= 400 && error.status < 500 && ![408,429].includes(error.status));
      if (retry) {
        db.prepare('UPDATE feishu_workflow_proposals SET formal_due_at=?,formal_error=? WHERE id=?')
          .run(now() + 2 ** attempts * 1000,'正式系统暂不可用，将重试。',proposal.id);
        return;
      }
      const uncertain = error.retriable !== false && !(error.status >= 400 && error.status < 500);
      finishFormal(proposal,uncertain ? 'uncertain' : 'failed',null,
        uncertain ? '正式系统同步待核实，请在原模拟账户按提案编号核对。' :
          (error.displayMessage ?? '正式系统拒绝同步，请检查模拟账户和建议设置。'));
      return;
    }
    finishFormal(proposal,'registered',result,null);
  }

  async function deliver(message) {
    const current = settings();
    if (current.chatId !== message.chat_id && !(message.kind === 'pair' && !current.chatId)) {
      db.prepare("UPDATE feishu_workflow_messages SET status='blocked',error=? WHERE seq=?")
        .run('目标群映射已变更。',message.seq);
      return;
    }
    if (message.kind === 'input_receipt' || message.kind === 'approval_receipt') {
      const origin = db.prepare('SELECT sender_id,status FROM feishu_workflow_events WHERE chat_id=? AND message_id=?')
        .get(message.chat_id,message.reply_to);
      const authorized = origin && (roleFor(current,origin.sender_id) || isApprover(current,origin.sender_id));
      if (!authorized || (message.kind === 'input_receipt' && origin.status !== 'pending') ||
          (message.kind === 'approval_receipt' && message.attempts > 0 &&
           db.prepare("SELECT 1 FROM feishu_workflow_messages WHERE proposal_id=? AND kind IN ('formal_result','result') AND status='sent'").get(message.proposal_id))) {
        db.prepare("UPDATE feishu_workflow_messages SET status='superseded' WHERE seq=?").run(message.seq);
        return;
      }
    }
    const sender = (message.chat_source_id || message.kind === 'analyst_roster') &&
      rosterRequester.get(message.chat_id,message.reply_to)?.sender_id;
    if (message.chat_source_id && message.id !== message.chat_source_id &&
        !allowedRead(message.chat_id,sender,message.chat_source_id,now()-chatWindow,current)) {
      db.prepare("UPDATE feishu_workflow_messages SET status='blocked',text='',error=? WHERE seq=?")
        .run('对话引用的查询已失效。',message.seq);
      return;
    }
    if (message.kind === 'analyst_roster') {
      message.text=sender && (isApprover(current,sender) || roleFor(current,sender))
        ? analystRosterText(current)
        : '当前群的 PM 和已绑定分析师可以查看分析师名单。';
      db.prepare('UPDATE feishu_workflow_messages SET text=? WHERE seq=?').run(message.text,message.seq);
    } else if (message.kind === 'assistant_reply' && message.chat_source_id === message.id) {
      message.text=isApprover(current,sender) ? pendingList(current,sender,message.chat_question) : '只有当前群的确认人可以查看 PM 待办。';
      db.prepare('UPDATE feishu_workflow_messages SET text=? WHERE seq=?').run(message.text,message.seq);
    }
    const report = message.kind === 'formal_report' || message.kind === 'group_report';
    const webhook = report && sendMessage.formalReportWebhook === true;
    if (report) {
      const scope = readReportScope.get(message.id);
      const permitted = message.kind==='group_report' ? publishedScopeAllowed(current,scope) :
        queryFormal && (scope ? reportAllowed(current,scope.requester_id,scope.owner_id,scope.analyst_key,scope.group_keys) :
          message.chat_source_id!==message.id);
      if (!permitted) {
        db.prepare("UPDATE feishu_workflow_messages SET status='blocked', text='', error=? WHERE seq=?")
          .run('正式报表查询已停用或成员及账户绑定已变更。',message.seq);
        return;
      }
    }
    if (message.kind === 'reminder' || message.kind === 'demo_recap') {
      const proposal = proposalById.get(message.proposal_id);
      if (proposal?.demo_only && current.demoMembershipUnavailable) {
        db.prepare("UPDATE feishu_workflow_messages SET due_at=? WHERE seq=?").run(now()+5_000,message.seq);
        return;
      }
      const active = proposal && proposal.summary_id === message.reply_to && (message.kind === 'demo_recap'
        ? proposal.demo_status === 'registered' && stillAuthorized(current,proposal)
        : proposal.demo_status === 'awaiting_approval' && !proposal.approval &&
          roleFor(current,proposal.sender_id) === proposal.role && current.approverIds?.some(id => id !== proposal.sender_id));
      if (!active) {
        db.prepare('UPDATE feishu_workflow_messages SET status=? WHERE seq=?')
          .run(message.kind === 'demo_recap' ? 'blocked' : 'superseded',message.seq);
        return;
      }
    }
    const firstAttempt = message.first_attempt_at ?? now();
    if (now() - firstAttempt > 15 * 60_000) {
      db.prepare("UPDATE feishu_workflow_messages SET status='uncertain',error=? WHERE seq=?")
        .run('消息送达待核实。',message.seq);
      return;
    }
    const attempts = message.attempts + 1;
    db.prepare('UPDATE feishu_workflow_messages SET attempts=?,first_attempt_at=?,status=? WHERE seq=?')
      .run(attempts,firstAttempt,webhook ? 'sending_webhook' : 'pending',message.seq);
    let result;
    try {
      result = await sendMessage({chatId:message.chat_id,text:message.text,uuid:message.id,replyTo:message.reply_to,
        ...(report && {formalReport:true})});
      if (!(webhook && result?.deliveredToWebhook === true) && !identifier(result?.messageId)) throw new Error('missing message id');
    } catch (error) {
      const uncertain = webhook && (error.uncertain === true || error.retriable === undefined);
      const retry = !uncertain && error.retriable !== false && attempts < 5;
      db.prepare('UPDATE feishu_workflow_messages SET status=?,due_at=?,error=? WHERE seq=?')
        .run(retry ? 'pending' : !uncertain && error.retriable === false ? 'failed' : 'uncertain',
          retry ? now() + 2 ** attempts * 1000 : 0, retry ? '群消息暂不可用，将重试。' : '群消息送达待核实。',message.seq);
      return;
    }
    transaction(() => {
      db.prepare(`UPDATE feishu_workflow_messages SET message_id=?,status='sent',error=NULL,
        chat_at=CASE WHEN chat_source_id=id THEN ? END WHERE seq=?`).run(result.messageId ?? null,now(),message.seq);
      if (message.kind === 'summary') {
        db.prepare('UPDATE feishu_workflow_proposals SET summary_id=?,reminder_due_at=? WHERE id=?')
          .run(result.messageId, classifyAssistantCommand && reminderAfterMs > 0 ? now()+reminderAfterMs : null,message.proposal_id);
        // Feishu can show the summary and deliver a PM reply before returning its outgoing message ID.
        if (wake) for (const event of approvalsForSummary.all(message.chat_id,result.messageId)) {
          processKnownApproval(event,settings());
        }
      }
    });
    observeSafely(()=>{
      const observation=readObservations.get(message.id);
      if (!observation) return;
      readObservations.delete(message.id);
      const latest=settings();
      if (observation.readAction==='group_report') {
        if (message.chat_id===latest.chatId && publishedScopeAllowed(latest,readReportScope.get(message.id))) monitor.observeRead(observation,latest);
        return;
      }
      if (observation.readAction!==null && !allowedRead(message.chat_id,observation.senderId,message.id,now()-chatWindow,latest)) return;
      const text=message.chat_question ?? db.prepare('SELECT user_text FROM feishu_chat_turns WHERE response_id=?').get(message.id)?.user_text;
      if (text) monitor.observeRead({...observation,text},latest);
    });
  }

  function observeInterpretation(event,current,inference,trace,outcome) {
    if (!inference?.role || roleFor(current,event.sender_id)!==inference.role || !outcome ||
        ['blocked','ignored'].includes(outcome)) return;
    const message = outcome !== 'chat_pending' && db.prepare(`SELECT kind,text,proposal_id FROM feishu_workflow_messages
      WHERE chat_id=? AND reply_to=? ORDER BY seq DESC LIMIT 1`).get(event.chat_id,event.message_id);
    const context = chatScope(event,now()-chatWindow);
    const threadId = message?.proposal_id ?? inference.draft?.id ?? context.proposal?.id ?? context.session;
    const draft = message?.kind === 'clarification' &&
      db.prepare('SELECT fields FROM feishu_workflow_drafts WHERE id=?').get(threadId);
    const status = {processed:'pm_summary',chat_pending:'routed_chat',responded:'help'}[outcome] ?? outcome;
    monitor.observe({component:'extraction',chatId:event.chat_id,senderId:event.sender_id,messageId:event.message_id,
      threadId,relatedThreadId:event.parent_id ? context.session : undefined,user:event.text,assistant:message?.text,
      outcome:trace.failed?'model_failure':status,input:trace.input,packet:trace.packet ?? inference.packet,
      rawPacket:trace.rawPacket,missing:draft ? missingFields(JSON.parse(draft.fields)) : undefined},current);
  }

  async function runPrimary() {
    observeSafely(() => monitor.prune());
    for (let count = 0; count < 50; count++) {
      const event = nextEvent.get(now());
      if (event) {
        const current = settings();
        const approval = event.kind === 'approval' && proposalBySummary.get(event.chat_id,event.parent_id);
        if (current.demoMembershipUnavailable && (approval?.demo_only ||
            (proposalKinds.has(event.kind) && !roleFor(current,event.sender_id)))) {
          db.prepare('INSERT INTO feishu_event_deferrals VALUES (?,?) ON CONFLICT(event_id) DO UPDATE SET retry_at=excluded.retry_at')
            .run(event.event_id,now()+5_000);
          continue;
        }
        db.prepare('DELETE FROM feishu_event_deferrals WHERE event_id=?').run(event.event_id);
        const trace = monitor && proposalKinds.has(event.kind) ? {} : undefined;
        const interpretation = await getInterpretation(event,trace);
        let outcome;
        transaction(() => {
          if (event.kind==='approval' && inputById.get(event.event_id)?.status!=='pending') return;
          if (event.kind === 'supplement' && !draftForAnchor(event.chat_id,event.parent_id) &&
              pendingClarification.get(event.chat_id,event.sender_id)) return;
          if (event.kind !== 'approval' || proposalBySummary.get(event.chat_id,event.parent_id)) {
            outcome = handleEvent(event,interpretation);
            if (outcome === 'chat_pending') {
              moveToChat.run(event.seq);
              wake?.();
            }
            else if (outcome !== 'membership_pending' && outcome !== 'report_pending') finishEvent.run(outcome,event.seq);
          } else {
            // A reply can be delivered while the summary send is still awaiting its HTTP response.
            const pending = db.prepare(`SELECT 1 FROM feishu_workflow_messages WHERE chat_id=? AND kind='summary'
              AND status='pending' LIMIT 1`).get(event.chat_id);
            if (!pending) finishEvent.run('ignored',event.seq);
          }
        });
        if (trace) observeSafely(() => observeInterpretation(event,settings(),interpretation,trace,outcome));
      }
      queueDueReminder();
      const formal = !wake && syncFormal && nextFormalWrite.get(now());
      if (formal) await syncProposal(formal);
      const message = !wake && nextDelivery.get(now());
      if (message) await deliver(message);
      if (!formal && !message && (!event || nextEvent.get(now())?.seq === event.seq)) return;
    }
  }

  let nextChatCleanup = 0;
  async function runChat() {
    const time = now();
    const since = time-chatWindow;
    if (time >= nextChatCleanup) {
      expireChatTurns.run(since);
      db.prepare(`UPDATE feishu_workflow_messages SET chat_question=NULL,chat_at=NULL WHERE chat_at<?
        AND status NOT IN ('pending','sending_webhook')`).run(since);
      nextChatCleanup = time+60_000;
    }
    const event = nextChatEvent.get();
    if (!event) return;
    const current = settings();
    if (current.chatId !== event.chat_id) {
      finishEvent.run('ignored',event.seq);
      return;
    }
    const {session,history,proposal,sourceId,readContext} = chatContext(event,since);
    const proposalContext = proposal && publicProposalContext(proposal);
    const text = event.text.slice(0,3000);
    let reply, tool, sentHistory, modelErrorCode, modelHttpStatus;
    try {
      const answer = await respondToChat({text,history,...(readContext && {readContext}),
        ...(monitor && {onSentHistory:sent => { sentHistory = sent; }}),isAnalyst:Boolean(roleFor(current,event.sender_id)),
        isApprover:isApprover(current,event.sender_id),...(proposalContext && {proposalContext})});
      if (typeof answer === 'string' && answer.trim()) reply = answer.trim().slice(0,800);
      else if (answer?.read) tool=answer;
    } catch (error) {
      modelErrorCode = error?.code;
      modelHttpStatus = error?.status;
    }
    const fallback = modelErrorCode === 'MODEL_TIMEOUT' ? '这次聊天模型响应超时，请稍后再试。' :
      modelErrorCode === 'MODEL_TRUNCATED' ? '这次模型在生成完整答复前达到了长度上限，你可以再问一次。' : chatUnavailable;
    const modelReplied = Boolean(reply);
    let observedContext = proposalContext, responded = false;
    transaction(() => {
      const latestSettings = settings();
      if (latestSettings.chatId !== event.chat_id) {
        finishEvent.run('ignored',event.seq);
        return;
      }
      if (sourceId && !allowedRead(event.chat_id,event.sender_id,sourceId,now()-chatWindow,latestSettings)) {
        notice(event,'chat','刚才引用的查询结果已失效，请重新查询。');
        finishEvent.run('responded',event.seq);
        return;
      }
      if (tool) {
        const outcome=queueModelRead(event,tool,latestSettings);
        if (outcome!=='report_pending') finishEvent.run(outcome,event.seq);
        return;
      }
      if (proposalContext) {
        const latest = publicProposalById.get(event.chat_id,proposal.id) ?? proposal;
        observedContext = publicProposalContext(latest);
        if (!reply || latest.formal_status !== proposalContext.status) reply = proposalFacts(latest,observedContext);
      }
      const id = notice(event,'chat',reply ?? fallback,proposal?.id);
      if (sourceId) db.prepare('UPDATE feishu_workflow_messages SET chat_source_id=? WHERE id=?').run(sourceId,id);
      if (reply) {
        saveChatTurn.run(id,event.chat_id,event.sender_id,session,text,now());
        pruneChatTurns.run(event.chat_id,event.sender_id,event.chat_id,event.sender_id);
      }
      finishEvent.run('responded',event.seq);
      if (modelReplied) scheduleReadObservation(event,null,'chat');
      responded = true;
    });
    // Explanations of the group's records can contain report data. Keep them out of the offline prompt-learning archive.
    if (responded && !sourceId && text.trim()!=='同意') observeSafely(() => monitor.observe({component:'chat',chatId:event.chat_id,senderId:event.sender_id,
      messageId:event.message_id,threadId:proposal?.id ?? session,user:text,assistant:reply ?? fallback,
      outcome:modelReplied ? 'chat' : 'chat_fallback',proposalContext:observedContext,sentHistory,modelErrorCode,modelHttpStatus},settings()));
  }

  const nextMember = db.prepare(`SELECT e.*,j.action,j.display_name,j.attempts FROM feishu_membership_jobs j
    JOIN feishu_workflow_events e ON e.event_id=j.event_id WHERE e.status='pending' AND j.due_at<=? ORDER BY e.seq LIMIT 1`);
  async function runMembership(event) {
    const finish = (status,message) => transaction(() => {
      if (message && settings().chatId === event.chat_id) notice(event,'assistant_reply',message);
      db.prepare('DELETE FROM feishu_membership_jobs WHERE event_id=?').run(event.event_id);
      finishEvent.run(status,event.seq);
    });
    if (settings().chatId !== event.chat_id) return finish('ignored');
    try {
      const result = await provisionAnalyst({chatId:event.chat_id,senderId:event.sender_id,eventId:event.event_id,
        messageId:event.message_id,displayName:event.display_name,action:event.action});
      if (typeof result?.text !== 'string' || !result.text.trim()) throw Error('missing onboarding receipt');
      finish('responded',result.text);
    } catch (error) {
      if (event.action === 'membership' || error.retriable === false) {
        return finish('responded','暂时无法核对开通结果，请稍后查询我的开通进度。');
      }
      transaction(() => {
        const attempts = event.attempts+1;
        const delay = Math.min(15 * 60_000, 2000 * 2 ** Math.min(10,attempts-1));
        db.prepare('UPDATE feishu_membership_jobs SET attempts=?,due_at=? WHERE event_id=?')
          .run(attempts,now()+delay,event.event_id);
        if (attempts === 1 && settings().chatId === event.chat_id) {
          notice(event,'onboarding_pending','已保存你的开通申请，Demo 暂时无法返回回执，恢复后会自动继续。');
        }
      });
    }
  }

  let primaryWorker, demoWorker, chatWorker, membershipWorker, reportWorker;
  async function runReports() {
    for (let count=0;count<50;count++) {
      const event=nextReportEvent.get();
      if (!event) break;
      const job=reportJob.get(event.event_id);
      if (event.kind==='group_report') {
        await publishGroupReport(event,job);
        wake?.();
        continue;
      }
      const report=await readFormalReport(event,job);
      transaction(()=>{
        const current=settings();
        const authorized=current.chatId===event.chat_id && (!job?.source_id ||
          allowedRead(event.chat_id,event.sender_id,job.source_id,now()-chatWindow,current));
        let outcome='ignored';
        if (authorized && report.error) {
          if (report.scopeQuestion) askReportScope(event,current,report.error,report.sections,job?.source_id);
          else notice(event,queryFormal?'formal_report':'chat',report.error);
          outcome='responded';
        } else if (authorized && report.text && reportAllowed(current,event.sender_id,report.ownerId,report.analystKey,report.groupKeys)) {
          const id=readNotice(event,'formal_report',report.text);
          saveReportScope.run(id,event.sender_id,report.ownerId,report.analystKey,JSON.stringify(report.sections),report.groupKeys);
          if (report.sections.length===1) scheduleReadObservation(event,report.sections[0],job?.model_component);
          outcome='responded';
        }
        finishEvent.run(outcome,event.seq);
        finishReportJob.run(event.event_id);
      });
      wake?.();
    }
  }
  function drainReads() {
    if (!reportWorker) reportWorker=runReports().finally(()=>{reportWorker=null;});
    return reportWorker;
  }
  // Each lane owns its rows. A slow model, group post or formal API cannot hold the receipt lane.
  function queueWorker(next,work) {
    let active;
    return () => {
      if (!active) active = (async () => {
        for (let i=0;i<50;i++) {
          const row = next.get(now());
          if (!row) break;
          await work(row);
        }
      })().finally(() => { active = undefined; });
      return active;
    };
  }
  const realtimeWorkers = wake ? {
    drainReceipts:queueWorker(nextReceipt,deliver),
    drainProposalReplies:queueWorker(nextProposalReply,deliver),
    drainReportReplies:queueWorker(nextReportReply,deliver),
    drainDelivery:queueWorker(nextDelivery,deliver),
    ...(syncFormal && {drainFormal:queueWorker(nextFormalWrite,syncProposal)}),
  } : {};
  function drainMembership() {
    if (!provisionAnalyst) return Promise.resolve();
    if (!membershipWorker) {
      const event = nextMember.get(now());
      if (!event) return Promise.resolve();
      membershipWorker = runMembership(event).finally(() => { membershipWorker = null; });
    }
    return membershipWorker;
  }
  function drainPrimary() {
    if (!primaryWorker) primaryWorker = runPrimary().finally(() => { primaryWorker = null; });
    return primaryWorker;
  }

  function drainDemo() {
    if (!register && !registerDemoOnly) return Promise.resolve();
    if (!demoWorker) {
      const proposal = nextDemo.get(now());
      if (!proposal) return Promise.resolve();
      demoWorker = registerProposal(proposal).finally(() => { demoWorker = null; });
    }
    return demoWorker;
  }

  function drainChat() {
    if (!respondToChat) return Promise.resolve();
    if (!chatWorker) chatWorker = runChat().finally(() => { chatWorker = null; });
    return chatWorker;
  }

  async function drain() {
    for (let count = 0; count < 50; count++) {
      await drainPrimary();
      await Promise.all(Object.values(realtimeWorkers).map(run=>run()));
      const demo = (register || registerDemoOnly) && nextDemo.get(now());
      const chat = respondToChat && nextChatEvent.get();
      const member = provisionAnalyst && nextMember.get(now());
      const report = nextReportEvent.get();
      if (!demo && !chat && !member && !report) {
        if (wake && (nextReceipt.get(now()) || nextProposalReply.get(now()) || nextReportReply.get(now()) || nextDelivery.get(now()))) continue;
        return;
      }
      await Promise.all([demo && drainDemo(),chat && drainChat(),member && drainMembership(),report && drainReads()]);
    }
    await drainPrimary();
  }

  function view() {
    const current = settings();
    return {
      configured: Boolean(current.chatId),
      pairings:db.prepare(`SELECT chat_id AS chatId,sender_id AS senderId,MAX(received_at) AS receivedAt
        FROM feishu_workflow_events WHERE status='paired' GROUP BY chat_id,sender_id ORDER BY receivedAt DESC LIMIT 30`).all()
        .map(pair => ({...pair,reference:pairingReference(pair.chatId,pair.senderId)})),
      proposals:db.prepare(`SELECT p.id,p.role,p.revision,p.demo_only AS demoOnly,p.summary_id AS summaryId,p.approved_at AS approvedAt,
        p.demo_status AS demoStatus,p.demo_id AS demoId,p.formal_status AS formalStatus,
        p.simulation_status AS simulationStatus,p.formal_id AS formalId,p.decision_id AS decisionId,p.trade_id AS tradeId,
        p.error,p.formal_error AS formalError,m.status AS summaryStatus,r.status AS resultStatus,
        f.status AS formalResultStatus
        FROM feishu_workflow_proposals p LEFT JOIN feishu_workflow_messages m ON m.seq=(
          SELECT MAX(sm.seq) FROM feishu_workflow_messages sm WHERE sm.proposal_id=p.id AND sm.kind='summary')
        LEFT JOIN feishu_workflow_messages r ON r.proposal_id=p.id AND r.kind='result'
        LEFT JOIN feishu_workflow_messages f ON f.proposal_id=p.id AND f.kind='formal_result' ORDER BY p.rowid DESC LIMIT 100`).all(),
    };
  }

  return {receive, drain, drainPrimary, drainDemo, drainChat, drainMembership, drainReads, ...realtimeWorkers, view};
}
