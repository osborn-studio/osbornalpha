import { createHash } from 'node:crypto';
import { isUuid } from '../../src/lib/portfolio/validate.ts';
import { pairingReference, validateAnalystAliases } from './feishu-pairing.mjs';
import { proposalIntent, canInterpretWithModel, evaluateProposal, summary } from './feishu-workflow-command.mjs';
import { beijingDateTime, marketCalendarLabel } from './public/beijing-time.mjs';

const identifier = value => typeof value === 'string' && /^[\w:-]{1,160}$/.test(value);

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

export function openFeishuWorkflow(db, transaction, {register, sendMessage, syncFormal, extractWithModel, config, now = Date.now}) {
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
  CREATE TABLE IF NOT EXISTS feishu_workflow_drafts (
    id TEXT PRIMARY KEY, origin TEXT NOT NULL UNIQUE, chat_id TEXT NOT NULL, sender_id TEXT NOT NULL,
    role TEXT NOT NULL, received_at TEXT NOT NULL, fields TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS feishu_workflow_event_status ON feishu_workflow_events(status,seq);
  CREATE INDEX IF NOT EXISTS feishu_workflow_messages_status ON feishu_workflow_messages(status,due_at,seq);`);
  transaction(() => {
    const names = new Set(db.prepare('PRAGMA table_info(feishu_workflow_proposals)').all().map(column => column.name));
    const columns = {
      formal_id:'TEXT', decision_id:'TEXT', trade_id:'TEXT', formal_error:'TEXT',
      formal_attempts:'INTEGER NOT NULL DEFAULT 0', formal_due_at:'INTEGER NOT NULL DEFAULT 0',
    };
    for (const [name, type] of Object.entries(columns)) {
      if (!names.has(name)) db.exec(`ALTER TABLE feishu_workflow_proposals ADD COLUMN ${name} ${type}`);
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
  const isApprover = (current, sender) => Array.isArray(current.approverIds) && current.approverIds.includes(sender);
  function eventTime(event) {
    const createdAt = typeof event.createdAt === 'string' ? Date.parse(event.createdAt) : NaN;
    const receivedAt = now();
    return new Date(Number.isFinite(createdAt) && createdAt <= receivedAt + 60_000 ? createdAt : receivedAt).toISOString();
  }
  const saveEvent = db.prepare(`INSERT INTO feishu_workflow_events
    (event_id,message_id,chat_id,sender_id,parent_id,kind,text,received_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`);
  const nextEvent = db.prepare("SELECT * FROM feishu_workflow_events WHERE status='pending' ORDER BY seq LIMIT 1");
  const finishEvent = db.prepare('UPDATE feishu_workflow_events SET status=?,text=\'\' WHERE seq=?');
  const queueMessage = db.prepare(`INSERT INTO feishu_workflow_messages (id,chat_id,reply_to,text,kind,proposal_id)
    VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`);
  const proposalById = db.prepare('SELECT * FROM feishu_workflow_proposals WHERE id=?');
  const proposalBySummary = db.prepare('SELECT * FROM feishu_workflow_proposals WHERE chat_id=? AND summary_id=?');
  const clarification = db.prepare(`SELECT m.proposal_id,d.* FROM feishu_workflow_messages m
    LEFT JOIN feishu_workflow_drafts d ON d.id=m.proposal_id
    WHERE m.chat_id=? AND m.message_id=? AND m.kind='clarification'`);
  const pendingClarification = db.prepare(`SELECT 1 FROM feishu_workflow_drafts d
    JOIN feishu_workflow_messages m ON m.proposal_id=d.id AND m.kind='clarification' AND m.status='pending'
    WHERE d.chat_id=? AND d.sender_id=? LIMIT 1`);
  const saveDraft = db.prepare(`INSERT INTO feishu_workflow_drafts(id,origin,chat_id,sender_id,role,received_at,fields)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET fields=excluded.fields`);

  function receive(event) {
    if (!event || ![event.eventId,event.messageId,event.chatId,event.senderId].every(identifier) ||
        typeof event.text !== 'string' || event.text.length > 12_000) return {accepted:false};
    const current = settings();
    const content = event.text.trim();
    let kind;
    if (/^\/?(?:绑定|联调)$/.test(content) && (!current.chatId || current.chatId === event.chatId)) {
      kind = 'pair';
    } else if (current.chatId === event.chatId) {
      const role = roleFor(current,event.senderId);
      const hasParent = identifier(event.parentId);
      if (content === '同意') {
        if (hasParent && isApprover(current,event.senderId)) kind = 'approval';
      } else if (role) {
        const prompt = hasParent && clarification.get(event.chatId,event.parentId);
        if (prompt) {
          if (prompt.sender_id === event.senderId && prompt.role === role) kind = 'supplement';
        } else if (hasParent && pendingClarification.get(event.chatId,event.senderId)) {
          // The user can reply before Feishu returns the outgoing prompt's message ID.
          kind = 'supplement';
        } else if (extractWithModel && event.directedToBot === true && canInterpretWithModel(content)) {
          kind = 'proposal_ai';
        } else if (proposalIntent(content,event.directedToBot === true)) kind = 'proposal';
      }
    }
    if (!kind) return {accepted:false};
    const result = saveEvent.run(event.eventId,event.messageId,event.chatId,event.senderId,
      ['approval','supplement'].includes(kind) ? event.parentId : null,kind,content,eventTime(event));
    return {accepted:true, duplicate:result.changes === 0};
  }

  function notice(event, kind, text, proposalId = null) {
    queueMessage.run(stableId('feishu-reply',event.message_id,kind),event.chat_id,event.message_id,text,kind,proposalId);
  }

  function requestDetails(event, id, message) {
    notice(event,'clarification',message + '\n请直接回复这条消息，@机器人 后补充。',id);
  }

  async function getInterpretation(event) {
    if (!extractWithModel || !canInterpretWithModel(event.text) || !['proposal_ai','supplement'].includes(event.kind)) return null;
    const current = settings();
    const role = roleFor(current,event.sender_id);
    if (current.chatId !== event.chat_id || !role) return null;
    const draft = event.kind === 'supplement' ? clarification.get(event.chat_id,event.parent_id) : null;
    if (event.kind === 'supplement' && (draft?.sender_id !== event.sender_id || draft.role !== role)) return null;
    try {
      return await extractWithModel({text:event.text,receivedAt:draft?.received_at ?? event.received_at,
        priorFields:draft ? JSON.parse(draft.fields) : {},isSupplement:Boolean(draft)});
    } catch {
      return {unavailable:true};
    }
  }

  function handleProposal(event, current, interpretation) {
    const role = roleFor(current,event.sender_id);
    if (!role) return 'ignored';
    const draft = event.kind === 'supplement' ? clarification.get(event.chat_id,event.parent_id) : null;
    if (draft && (draft.sender_id !== event.sender_id || draft.role !== role)) return 'ignored';
    // An unrelated thread reply might have arrived while the send receipt was in flight.
    // It can only start a new proposal if it independently expresses a proposal.
    if (event.kind === 'supplement' && !draft && !proposalIntent(event.text)) return 'ignored';

    const origin = draft?.origin ?? event.message_id;
    const receivedAt = draft?.received_at ?? event.received_at;
    const id = draft?.id ?? stableId('feishu-proposal',event.chat_id,origin);
    const names = current.analystNamesByRole ?? {};
    const name = Object.hasOwn(names,role) ? names[role] : ['A','B'].includes(role) ? '分析师 ' + role : null;
    const aliases = current.analystAliasesByRole ?? {};
    if (interpretation?.intent === 'other') {
      if (draft) requestDetails(event,id,'没有识别到这条建议的补充内容。');
      return 'ignored';
    }
    if (interpretation?.intent === 'ambiguous') {
      if (!draft) saveDraft.run(id,origin,event.chat_id,event.sender_id,role,receivedAt,'{}');
      requestDetails(event,id,'这句话存在歧义，请明确要登记的单条建议。');
      return 'awaiting_details';
    }
    if (event.kind === 'proposal_ai' && interpretation?.unavailable && !proposalIntent(event.text,true)) {
      saveDraft.run(id,origin,event.chat_id,event.sender_id,role,receivedAt,'{}');
      requestDetails(event,id,'建议识别模型暂时不可用。请回复原句重试，或直接写明标的和动作。');
      return 'awaiting_details';
    }
    let parsed;
    try {
      parsed = evaluateProposal(role,name,event.text,receivedAt,Object.hasOwn(aliases,role) ? aliases[role] : [],
        draft ? JSON.parse(draft.fields) : undefined, interpretation?.fields ? interpretation : undefined);
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
      if (missing.includes('交易市场或标的代码')) lines.push('请说明「' + fields.securityName + '」的市场，或提供完整股票代码。');
      if (missing.includes('标的代码')) lines.push('可填写带市场的股票代码，例如 00700.HK 或 600519.SH。');
      if (missing.includes('建议动作')) lines.push('可选买入、加仓、减仓、卖出、持有或观望。');
      if (missing.includes('模拟成交价') || missing.includes('模拟成交股数')) {
        lines.push('只需登记分析建议时，可回复「仅登记建议」。');
      }
      requestDetails(event,id,lines.join('\n'));
      return 'awaiting_details';
    }
    const accountId = confirmedAccount(current);
    db.prepare(`INSERT INTO feishu_workflow_proposals
      (id,origin,chat_id,sender_id,role,body,simulation_status,simulation_account) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id,origin,event.chat_id,event.sender_id,role,JSON.stringify(body),
        body.simulation ? 'awaiting_approval' : 'not_requested',accountId);
    if (draft) {
      db.prepare('DELETE FROM feishu_workflow_drafts WHERE id=?').run(id);
      db.prepare("UPDATE feishu_workflow_messages SET status='superseded' WHERE proposal_id=? AND kind='clarification' AND status='pending'").run(id);
    }
    notice(event,'summary',[summary(body,id,name ?? role,accountId),...warnings].join('\n'),id);
    return 'processed';
  }

  function handleEvent(event, interpretation) {
    const current = settings();
    if (event.kind === 'pair' && (!current.chatId || current.chatId === event.chat_id)) {
      const reference = pairingReference(event.chat_id,event.sender_id);
      notice(event, 'pair', `Osborn Alpha 已收到配对消息。配对编号 ${reference}，请 PM 在 Demo 的飞书绑定设置中核对。`);
      return 'paired';
    }
    if (current.chatId !== event.chat_id) return 'ignored';
    if (['proposal','proposal_ai','supplement'].includes(event.kind)) return handleProposal(event,current,interpretation);
    if (!isApprover(current, event.sender_id)) return 'ignored';
    const proposal = proposalBySummary.get(event.chat_id,event.parent_id);
    if (!proposal || proposal.sender_id === event.sender_id || roleFor(current, proposal.sender_id) !== proposal.role) return 'ignored';
    if (proposal.approval) return 'duplicate_approval';
    const formalStatus = !proposal.simulation_account ? 'awaiting_account' :
      confirmedAccount(current) === proposal.simulation_account ? 'pending_formal_sync' : 'blocked';
    const simulationStatus = proposal.simulation_status === 'not_requested' ? 'not_requested' :
      formalStatus;
    db.prepare(`UPDATE feishu_workflow_proposals SET approval=?,approver_id=?,approved_at=?,demo_status='pending',
      formal_status=?,simulation_status=?,formal_error=? WHERE id=?`)
      .run(event.message_id,event.sender_id,event.received_at,formalStatus,simulationStatus,
        formalStatus === 'blocked' ? '确认时的模拟账户与摘要显示的账户不一致。' : null,proposal.id);
    return 'processed';
  }

  function finishProposal(proposal, status, entry, error) {
    transaction(() => {
      db.prepare('UPDATE feishu_workflow_proposals SET demo_status=?,demo_id=?,error=? WHERE id=?')
        .run(status,entry?.id ?? null,error,proposal.id);
      const result = entry ? demoResult(entry) : error;
      let formal = '';
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
    if (!stillAuthorized(settings(), proposal)) {
      db.prepare("UPDATE feishu_workflow_proposals SET demo_status='blocked',error=? WHERE id=?")
        .run('群、分析师或审批人映射已变更。',proposal.id);
      return;
    }
    const {recommendation} = JSON.parse(proposal.body);
    const attempts = proposal.attempts + 1;
    db.prepare('UPDATE feishu_workflow_proposals SET attempts=? WHERE id=?').run(attempts,proposal.id);
    let entry;
    try {
      entry = await register({role:proposal.role,fields:{...recommendation,requestId:proposal.id},proposalId:proposal.id});
      if (typeof entry?.id !== 'string' || !entry.id) throw new Error('missing registration id');
    } catch (error) {
      if (attempts < 5 && error.retriable !== false && !(error.status >= 400 && error.status < 500 && ![408,429].includes(error.status))) {
        db.prepare('UPDATE feishu_workflow_proposals SET due_at=?,error=? WHERE id=?')
          .run(now() + 2 ** attempts * 1000,'Demo 登记暂不可用，将重试。',proposal.id);
        return;
      }
      finishProposal(proposal,'failed',null,'Demo 建议登记失败，请检查分析师映射或提案。');
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
    if (!stillAuthorized(current,proposal) || confirmedAccount(current) !== proposal.simulation_account) {
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
        uncertain ? '正式系统同步待核实，请在原模拟账户按提案编号核对。' : '正式系统拒绝同步，请检查模拟账户和建议设置。');
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
    const firstAttempt = message.first_attempt_at ?? now();
    if (now() - firstAttempt > 15 * 60_000) {
      db.prepare("UPDATE feishu_workflow_messages SET status='uncertain',error=? WHERE seq=?")
        .run('消息送达待核实。',message.seq);
      return;
    }
    const attempts = message.attempts + 1;
    db.prepare('UPDATE feishu_workflow_messages SET attempts=?,first_attempt_at=? WHERE seq=?')
      .run(attempts,firstAttempt,message.seq);
    let result;
    try {
      result = await sendMessage({chatId:message.chat_id,text:message.text,uuid:message.id,replyTo:message.reply_to});
      if (!identifier(result?.messageId)) throw new Error('missing message id');
    } catch (error) {
      const retry = error.retriable !== false && attempts < 5;
      db.prepare('UPDATE feishu_workflow_messages SET status=?,due_at=?,error=? WHERE seq=?')
        .run(retry ? 'pending' : error.retriable === false ? 'failed' : 'uncertain',
          retry ? now() + 2 ** attempts * 1000 : 0, retry ? '群消息暂不可用，将重试。' : '群消息送达待核实。',message.seq);
      return;
    }
    transaction(() => {
      db.prepare("UPDATE feishu_workflow_messages SET message_id=?,status='sent',error=NULL WHERE seq=?")
        .run(result.messageId,message.seq);
      if (message.kind === 'summary') db.prepare('UPDATE feishu_workflow_proposals SET summary_id=? WHERE id=?')
        .run(result.messageId,message.proposal_id);
    });
  }

  async function run() {
    for (let count = 0; count < 50; count++) {
      const event = nextEvent.get();
      if (event) {
        const interpretation = await getInterpretation(event);
        transaction(() => {
          if (event.kind === 'supplement' && !clarification.get(event.chat_id,event.parent_id) &&
              pendingClarification.get(event.chat_id,event.sender_id)) return;
          if (event.kind !== 'approval' || proposalBySummary.get(event.chat_id,event.parent_id)) {
            finishEvent.run(handleEvent(event,interpretation),event.seq);
          } else {
            // A reply can be delivered while the summary send is still awaiting its HTTP response.
            const pending = db.prepare(`SELECT 1 FROM feishu_workflow_messages WHERE chat_id=? AND kind='summary'
              AND status='pending' LIMIT 1`).get(event.chat_id);
            if (!pending) finishEvent.run('ignored',event.seq);
          }
        });
      }
      const proposal = db.prepare("SELECT id FROM feishu_workflow_proposals WHERE demo_status='pending' AND due_at<=? ORDER BY rowid LIMIT 1").get(now());
      if (proposal) await registerProposal(proposalById.get(proposal.id));
      const formal = syncFormal && db.prepare(`SELECT * FROM feishu_workflow_proposals WHERE formal_status='pending_formal_sync'
        AND formal_due_at<=? ORDER BY rowid LIMIT 1`).get(now());
      if (formal) await syncProposal(formal);
      const message = db.prepare("SELECT * FROM feishu_workflow_messages WHERE status='pending' AND due_at<=? ORDER BY seq LIMIT 1").get(now());
      if (message) await deliver(message);
      if (!proposal && !formal && !message && (!event || nextEvent.get()?.seq === event.seq)) return;
    }
  }

  let worker;
  function drain() {
    if (!worker) worker = run().finally(() => { worker = null; });
    return worker;
  }

  function view() {
    const current = settings();
    return {
      configured: Boolean(current.chatId),
      pairings:db.prepare(`SELECT chat_id AS chatId,sender_id AS senderId,MAX(received_at) AS receivedAt
        FROM feishu_workflow_events WHERE status='paired' GROUP BY chat_id,sender_id ORDER BY receivedAt DESC LIMIT 30`).all()
        .map(pair => ({...pair,reference:pairingReference(pair.chatId,pair.senderId)})),
      proposals:db.prepare(`SELECT p.id,p.role,p.summary_id AS summaryId,p.approved_at AS approvedAt,
        p.demo_status AS demoStatus,p.demo_id AS demoId,p.formal_status AS formalStatus,
        p.simulation_status AS simulationStatus,p.formal_id AS formalId,p.decision_id AS decisionId,p.trade_id AS tradeId,
        p.error,p.formal_error AS formalError,m.status AS summaryStatus,r.status AS resultStatus,
        f.status AS formalResultStatus
        FROM feishu_workflow_proposals p LEFT JOIN feishu_workflow_messages m ON m.proposal_id=p.id AND m.kind='summary'
        LEFT JOIN feishu_workflow_messages r ON r.proposal_id=p.id AND r.kind='result'
        LEFT JOIN feishu_workflow_messages f ON f.proposal_id=p.id AND f.kind='formal_result' ORDER BY p.rowid DESC LIMIT 100`).all(),
    };
  }

  return {receive, drain, view};
}
