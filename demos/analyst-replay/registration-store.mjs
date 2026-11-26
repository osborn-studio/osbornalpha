import { createHash, randomUUID } from 'node:crypto';
import { exchangeDate } from '../../src/lib/scoring/forward.ts';
import {
  defaultAnalystProfiles, parseRegistration, scoreRegistration, registrationView, registrationEvent, registrationForView, reviewEvent,
} from './registrations.mjs';
import { FINAL_SCORING_DAY } from './demo-score.mjs';
import { enqueue, getWebhookInfo } from './delivery.mjs';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hasCheckpointUpdate(previous, current) {
  if (current.status === 'pending') return false;
  if (current.status !== previous.status) return true;
  const before = previous.evidence;
  const after = current.evidence;
  return ['baseClose','d5Date','d5Close','d10Date','d10Close'].some(field => before[field] !== after[field]);
}

export function openRegistrationDesk(db, transaction, loadWindow, listProfiles = () => defaultAnalystProfiles, boundAnalystRoles = () => []) {
  db.exec(`CREATE TABLE IF NOT EXISTS registration_desk (id INTEGER PRIMARY KEY CHECK(id=1), session TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS registrations (
      seq INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, role TEXT NOT NULL, pair_no INTEGER NOT NULL,
      request_id TEXT NOT NULL, fingerprint TEXT NOT NULL, entry TEXT NOT NULL,
      UNIQUE(role,pair_no), UNIQUE(role,request_id));
    CREATE TABLE IF NOT EXISTS registration_groups (pair_no INTEGER PRIMARY KEY, member_ids TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS registration_windows (key TEXT PRIMARY KEY, window TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS registration_reviews (
      seq INTEGER PRIMARY KEY, pair_no INTEGER NOT NULL, evidence_ids TEXT NOT NULL, decision TEXT NOT NULL,
      note TEXT NOT NULL, at TEXT NOT NULL, UNIQUE(pair_no,evidence_ids));`);
  db.prepare('INSERT OR IGNORE INTO registration_desk VALUES (1,?)').run('OA-R-' + randomUUID().slice(0,8).toUpperCase());
  db.prepare(`INSERT OR IGNORE INTO registration_groups (pair_no,member_ids)
    SELECT DISTINCT pair_no, ? FROM registrations`).run(JSON.stringify(defaultAnalystProfiles.map(profile => profile.id)));
  const sessionId = db.prepare('SELECT session FROM registration_desk').get().session;
  const entries = () => db.prepare('SELECT entry FROM registrations ORDER BY seq').all().map(row => JSON.parse(row.entry));
  const cohorts = () => db.prepare('SELECT pair_no AS pairNo,member_ids FROM registration_groups ORDER BY pair_no').all()
    .map(row => ({pairNo:row.pairNo, memberIds:JSON.parse(row.member_ids)}));
  const context = () => ({profiles:listProfiles(), cohorts:cohorts()});
  const keyFor = input => [FINAL_SCORING_DAY, input.market, input.ticker, exchangeDate(input.recommended_at, input.market)].join(':');

  function enqueueNotice(id, notice) {
    if (Buffer.byteLength(notice.title + notice.text) <= 16_000) {
      enqueue(db,sessionId,id,notice);
      return;
    }
    // Larger groups can exceed the Feishu card size. Break at line boundaries,
    // leaving room for the card wrapper and section number.
    const sections = [];
    let section = '';
    for (const line of notice.text.split('\n')) {
      if (section && Buffer.byteLength(section + '\n' + line) > 12_000) {
        sections.push(section);
        section = '';
      }
      section += section ? '\n' + line : line;
    }
    sections.push(section);
    for (const [index,text] of sections.entries()) {
      const part = index + 1;
      enqueue(db,sessionId,`${id}-${part}`,{title:`${notice.title}（${part}/${sections.length}）`,text});
    }
  }

  function assignGroup(role) {
    const current = db.prepare(`SELECT g.pair_no FROM registration_groups g
      WHERE EXISTS (SELECT 1 FROM json_each(g.member_ids) WHERE value=?)
      AND NOT EXISTS (SELECT 1 FROM registrations r WHERE r.pair_no=g.pair_no AND r.role=?)
      ORDER BY g.pair_no LIMIT 1`).get(role,role);
    if (current) return current.pair_no;

    // Existing groups above retain their membership when PM updates the bindings.
    // A newly created group contains either the target chat's analysts or the other profiles.
    const bound = new Set(boundAnalystRoles());
    const inTarget = bound.has(role);
    const memberIds = listProfiles().map(profile => profile.id).filter(id => bound.has(id) === inTarget).sort();
    if (!memberIds.includes(role)) fail(403,'只有分析师可以登记本人的建议。');
    const pairNo = db.prepare('SELECT COALESCE(MAX(pair_no),0)+1 AS n FROM registration_groups').get().n;
    db.prepare('INSERT INTO registration_groups (pair_no,member_ids) VALUES (?,?)').run(pairNo,JSON.stringify(memberIds));
    return pairNo;
  }

  async function getWindow(input) {
    const stored = db.prepare('SELECT window FROM registration_windows WHERE key=?').get(keyFor(input));
    return stored ? JSON.parse(stored.window) : loadWindow(input);
  }
  // All analysts use the same completed series, even after restarting the server.
  function lockWindow(input, window) {
    if (!window.d10Date) return window;
    const key = keyFor(input);
    db.prepare('INSERT OR IGNORE INTO registration_windows VALUES (?,?)').run(key, JSON.stringify(window));
    return JSON.parse(db.prepare('SELECT window FROM registration_windows WHERE key=?').get(key).window);
  }
  function replayRequest(role, requestId, fingerprint) {
    const row = db.prepare('SELECT fingerprint,entry FROM registrations WHERE role=? AND request_id=?').get(role,requestId);
    if (row && row.fingerprint !== fingerprint) fail(409, '登记内容已变更，请重新提交。');
    return row && registrationForView(JSON.parse(row.entry));
  }
  async function register(role, fields, {fromFeishu = false} = {}) {
    if (!listProfiles().some(profile => profile.id === role)) fail(403,'只有分析师可以登记本人的建议。');
    const input = parseRegistration(role, fields);
    const { requestId } = fields;
    if (typeof requestId !== 'string' || !uuid.test(requestId)) fail(400, '登记请求编号无效，请刷新页面。');
    const fingerprint = createHash('sha256').update(JSON.stringify({
      ...input, recommended_at: fields.recommended_at == null ? null : input.recommended_at,
    })).digest('hex');
    const existing = replayRequest(role, requestId, fingerprint);
    if (existing) return existing;
    const createdAt = new Date().toISOString();
    let window;
    try {
      window = await getWindow(input);
    } catch (error) {
      if (!['price_unavailable','before_window'].includes(error.code)) throw error;
      const coverage = error.code === 'before_window';
      window = {
        market:input.market, ticker:input.ticker, name:input.ticker, source:'行情暂缺', mode:'unavailable',
        reason:coverage ? '当前行情源未覆盖建议日。' : '本次未能取得可核对的已收盘日线。',
        fetchedAt:new Date().toISOString(), snapshotId:'pending-' + error.code, bars:[],
        baseDate:null, d5Date:null, d10Date:null,
      };
    }
    return transaction(() => {
      const retry = replayRequest(role, requestId, fingerprint);
      if (retry) return retry;
      const pairNo = assignGroup(role);
      const id = randomUUID();
      const entry = scoreRegistration(input, lockWindow(input,window), {id, createdAt, pairNo});
      db.prepare('INSERT INTO registrations(id,role,pair_no,request_id,fingerprint,entry) VALUES (?,?,?,?,?,?)')
        .run(id, role, pairNo, requestId, fingerprint, JSON.stringify(entry));
      // The app already replies with the individual score in the same group.
      const appReplies = fromFeishu && getWebhookInfo(db).mode === 'app';
      if (!appReplies || completeGroup(pairNo)?.length > 1) {
        enqueueNotice('REG-' + id, registrationEvent(entries(), entry, false, context()));
      }
      return entry;
    });
  }
  function completeGroup(pairNo) {
    const group = db.prepare('SELECT member_ids FROM registration_groups WHERE pair_no=?').get(pairNo);
    if (!group) return null;
    const members = JSON.parse(group.member_ids);
    const byRole = new Map(db.prepare('SELECT role,entry FROM registrations WHERE pair_no=?').all(pairNo)
      .map(({role,entry}) => [role, JSON.parse(entry)]));
    return members.every(member => byRole.has(member)) ? members.map(member => byRole.get(member)) : null;
  }
  function evidenceKey(pair) {
    return JSON.stringify(pair.map(entry => entry.evidence.snapshotId));
  }
  function view(role) {
    const data = registrationView(entries(),role,context());
    const reviews = db.prepare('SELECT pair_no AS pairNo,evidence_ids,decision,note,at FROM registration_reviews ORDER BY seq').all();
    const pairKeys = new Map();
    for (const entry of data.entries) {
      const pair = pairKeys.get(entry.pairNo) || new Map();
      pair.set(entry.role, entry.evidence.snapshotId);
      pairKeys.set(entry.pairNo, pair);
    }
    const groupById = new Map(data.groups.map(group => [group.pairNo, group]));
    return {...data,sessionId,reviews:reviews.filter(row => {
      const key = pairKeys.get(row.pairNo);
      const group = groupById.get(row.pairNo);
      return group?.complete && key?.size === group.memberIds.length &&
        JSON.stringify(group.memberIds.map(member => key.get(member))) === row.evidence_ids;
    }).map(({evidence_ids, ...review}) => review)};
  }
  function review(role, {pairNo, decision, note, evidenceIds}) {
    if (role !== 'PM') fail(403,'仅 PM 可验收建议。');
    if (!Number.isSafeInteger(pairNo) || pairNo < 1 || !['accept','return'].includes(decision) ||
        typeof note !== 'string' || !note.trim() || note.trim().length > 500) fail(400,'请选择建议组、验收决定并填写 1–500 字说明。');
    return transaction(() => {
      const pair = completeGroup(pairNo);
      if (!pair) fail(409,'请等待本组所有分析师完成登记。');
      if (decision === 'accept' && pair.some(e => e.status === 'pending')) {
        fail(409,'本组还有建议未满 5 个交易日，可先退回或待评分后验收。');
      }
      const key = evidenceKey(pair);
      if (JSON.stringify(evidenceIds) !== key) fail(409,'行情证据已更新，请重新核对本组评分。');
      const at = new Date().toISOString();
      const row = db.prepare('SELECT decision,note,at FROM registration_reviews WHERE pair_no=? AND evidence_ids=?').get(pairNo,key);
      if (row) {
        if (row.decision !== decision || row.note !== note.trim()) fail(409,'当前评分版本已经验收。');
        return {pairNo,...row};
      }
      db.prepare('INSERT INTO registration_reviews(pair_no,evidence_ids,decision,note,at) VALUES (?,?,?,?,?)')
        .run(pairNo,key,decision,note.trim(),at);
      const result = {pairNo,decision,note:note.trim(),at};
      enqueueNotice('REV-' + randomUUID(),reviewEvent(pair, result, listProfiles()));
      return result;
    });
  }
  async function refresh(role, id, {forRecap = false} = {}) {
    if (typeof id !== 'string' || !uuid.test(id)) fail(400,'建议编号无效。');
    const read = () => {
      const row = db.prepare('SELECT entry FROM registrations WHERE id=?').get(id);
      if (!row) fail(404, '找不到建议。');
      return JSON.parse(row.entry);
    };
    const old = read();
    if (role !== old.role && !(role === 'PM' && completeGroup(old.pairNo))) fail(403,'没有权限刷新这条建议。');
    if (old.status === 'final') return registrationForView(old);
    const input = parseRegistration(old.role, old.recommendation);
    const window = await getWindow(input);
    return transaction(() => {
      const current = read();
      if (current.status === 'final') return registrationForView(current);
      const updated = scoreRegistration(input, lockWindow(input,window), {
        id, pairNo:current.pairNo, createdAt:current.recommendation.created_at,
      });
      if (current.evidence.baseDate && updated.evidence.baseDate !== current.evidence.baseDate) {
        fail(409,'新行情的基准日与登记时不符，请稍后重试。');
      }
      const newlyFinal = updated.status === 'final';
      if (current.evidence.baseDate && !newlyFinal && updated.evidence.completedDays <= current.evidence.completedDays) {
        return registrationForView(current);
      }
      if (!updated.evidence.baseDate && current.evidence.mode !== 'unavailable') return registrationForView(current);
      if (current.recommendation.fill_price != null) {
        updated.recommendation.fill_price = current.recommendation.fill_price;
        updated.recommendation.fill_date = current.recommendation.fill_date;
      }
      db.prepare('UPDATE registrations SET entry=? WHERE id=?').run(JSON.stringify(updated),id);
      if (!forRecap && hasCheckpointUpdate(current, updated)) {
        enqueueNotice('UPDATE-' + id + '-' + updated.evidence.snapshotId,
          registrationEvent(entries(),updated,true,context()));
      }
      return updated;
    });
  }
  return {sessionId,register,refresh,review,view};
}
