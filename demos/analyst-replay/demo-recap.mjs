import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const minute = 60_000;
const day = 24 * 60 * minute;
const stages = {pending:0, provisional:5, final:10};

function authorized(settings, proposal) {
  return proposal.chat_id === settings.chatId && proposal.summary_id && proposal.approval &&
    proposal.sender_id !== proposal.approver_id && Object.hasOwn(settings.analystBySender ?? {}, proposal.sender_id) &&
    settings.analystBySender[proposal.sender_id] === proposal.role &&
    settings.approverIds?.includes(proposal.approver_id);
}

function recapText(entry, previous, proposalId) {
  const {evidence,score,recommendation} = entry;
  const lines = [`Demo 复盘 · ${recommendation.ticker} · ${entry.status === 'final' ? '最终评分' : '暂评'}`];
  for (const horizon of [5,10]) {
    if (horizon <= previous || horizon > stages[entry.status]) continue;
    const closeDate = evidence['d' + horizon + 'Date'];
    const pct = score?.['forward_' + horizon + 'd_pct'];
    const value = score?.['score_' + horizon + 'd'];
    const hit = horizon === 5 ? score?.hit : score?.hit_10d;
    if (!closeDate || !Number.isFinite(pct)) return null;
    const direction = typeof hit === 'boolean' && Number.isFinite(value)
      ? `，${hit ? '命中' : '未命中'}，评分 ${value}` : '，仅观察涨跌';
    lines.push(`T+${horizon}（${closeDate}）标的涨跌 ${pct.toFixed(2)}%${direction}`);
  }
  lines.push(`基准日 ${evidence.baseDate} · 行情 ${evidence.source}`, `提案 ${proposalId}`);
  return lines.join('\n');
}

export function openDemoRecaps(db, transaction, {directory,config,port,now = Date.now,fetchImpl = fetch,log = console.warn}) {
  const replayPath = join(directory,'replay.sqlite');
  // Enrollment is written inside the successful registration transaction. No
  // migration scans past proposals or schedules their scores for announcement.
  db.exec(`CREATE TABLE IF NOT EXISTS feishu_demo_recaps(
    proposal_id TEXT PRIMARY KEY, last_stage INTEGER NOT NULL,
    check_at INTEGER NOT NULL, refresh_at INTEGER NOT NULL
  ); CREATE INDEX IF NOT EXISTS feishu_demo_recaps_due ON feishu_demo_recaps(check_at);`);
  const add = db.prepare('INSERT OR IGNORE INTO feishu_demo_recaps VALUES(?,?,?,?)');
  const remove = db.prepare('DELETE FROM feishu_demo_recaps WHERE proposal_id=?');
  const postpone = db.prepare('UPDATE feishu_demo_recaps SET check_at=? WHERE proposal_id=?');
  let running, closed = false, nextCheck = 0;
  const stop = new AbortController();

  function track(proposalId, entry) {
    if (!['pending','provisional'].includes(entry.status) || entry.evidence?.finalDay !== 10) return;
    const stage = stages[entry.status];
    const firstCheck = now() + minute;
    // This is only a lower bound. The scoring service counts actual completed
    // trading sessions, including holidays and suspensions.
    const recommended = Date.parse(entry.recommendation?.recommended_at);
    const earliest = Number.isFinite(recommended) ? recommended + (stage === 5 ? 10 : 5) * day : firstCheck;
    add.run(proposalId,stage,firstCheck,Math.max(firstCheck,earliest));
  }

  function readEntry(job) {
    if (!existsSync(replayPath)) return null;
    const replay = new DatabaseSync(replayPath,{readOnly:true});
    try {
      const row = replay.prepare('SELECT entry FROM registrations WHERE role=? AND request_id=? AND id=?')
        .get(job.role,job.proposal_id,job.demo_id);
      return row ? JSON.parse(row.entry) : null;
    } finally { replay.close(); }
  }

  async function refresh(job) {
    const base = 'http://127.0.0.1:' + port;
    const headers = {origin:base,'content-type':'application/json'};
    const options = {method:'POST',redirect:'error',signal:AbortSignal.any([stop.signal,AbortSignal.timeout(45_000)])};
    const session = await fetchImpl(base + '/api/demo/role',{...options,headers,body:JSON.stringify({role:job.role})});
    if (!session.ok) throw Error('Demo 角色暂不可用');
    const {key} = await session.json();
    if (!/^[A-Za-z0-9_-]{43}$/.test(key ?? '')) throw Error('Demo 身份无效');
    if (!authorized(config(),job)) return;
    const result = await fetchImpl(base + '/api/registrations/refresh',{...options,
      headers:{...headers,authorization:'Bearer ' + key,'x-demo-registration-source':'feishu-recap'},
      body:JSON.stringify({id:job.demo_id})});
    await result.body?.cancel();
    if (!result.ok) throw Error('Demo 行情暂不可用');
  }

  async function poll() {
    const job = db.prepare(`SELECT w.*, p.role,p.chat_id,p.summary_id,p.approval,p.approver_id,p.sender_id,p.demo_id,p.demo_status
      FROM feishu_demo_recaps w JOIN feishu_workflow_proposals p ON p.id=w.proposal_id
      WHERE w.check_at<=? ORDER BY w.check_at,w.proposal_id LIMIT 1`).get(now());
    if (!job) return;
    const binding = config();
    if (binding.demoMembershipUnavailable) { postpone.run(now()+minute,job.proposal_id); return; }
    if (job.demo_status !== 'registered' || !authorized(binding,job)) { remove.run(job.proposal_id); return; }
    postpone.run(now() + 5 * minute,job.proposal_id);
    let entry = readEntry(job);
    if (!entry || entry.evidence?.finalDay !== 10) return;
    if (stages[entry.status] <= job.last_stage && job.refresh_at <= now()) {
      db.prepare('UPDATE feishu_demo_recaps SET refresh_at=? WHERE proposal_id=?')
        .run(now() + 4 * 60 * minute,job.proposal_id);
      await refresh(job);
      if (closed) return;
      entry = readEntry(job);
    }
    if (!entry || !Object.hasOwn(stages,entry.status) || stages[entry.status] <= job.last_stage) return;
    const fresh = config();
    if (fresh.demoMembershipUnavailable) return;
    if (!authorized(fresh,job)) { remove.run(job.proposal_id); return; }
    const text = recapText(entry,job.last_stage,job.proposal_id);
    if (!text) return;
    transaction(() => {
      db.prepare(`INSERT INTO feishu_workflow_messages(id,chat_id,reply_to,text,kind,proposal_id)
        VALUES(?,?,?,?,'demo_recap',?)`).run(randomUUID(),job.chat_id,job.summary_id,text,job.proposal_id);
      if (entry.status === 'final') remove.run(job.proposal_id);
      else db.prepare('UPDATE feishu_demo_recaps SET last_stage=? WHERE proposal_id=?').run(5,job.proposal_id);
    });
  }

  function tick() {
    if (closed || running || nextCheck > now()) return running;
    nextCheck = now() + 10_000;
    running = poll().catch(() => {
      if (!closed) log('Demo 复盘暂不可用，将按计划重试。');
    }).finally(() => { running = undefined; });
    return running;
  }
  async function close() { closed = true; stop.abort(); await running; }
  return {track,tick,close};
}
