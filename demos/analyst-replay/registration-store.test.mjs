import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openFeishuAdmin } from './feishu-admin.mjs';
import { setupDelivery, getNotifications } from './delivery.mjs';
import { openRegistrationDesk } from './registration-store.mjs';
import { defaultAnalystProfiles } from './registrations.mjs';

const snapshot = JSON.parse(readFileSync(new URL('./tencent-hk00700.json',import.meta.url)));
const start = snapshot.bars.findIndex(([date]) => date === '2026-06-16');
function sample(n) {
  const bars = snapshot.bars.slice(start,start+n).map(([time,close]) => ({time,close}));
  return {...snapshot,ticker:'00700.HK',mode:'snapshot',fetchedAt:snapshot.retrievedAt,
    snapshotId:'test-window-' + n, bars, baseDate:bars[0]?.time ?? null,
    d5Date:bars[5]?.time ?? null, d10Date:bars[10]?.time ?? null};
}

function fixture(t, load, listProfiles, boundAnalystRoles) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  setupDelivery(db);
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); db.exec('COMMIT'); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const open = () => openRegistrationDesk(db,transaction,load,listProfiles,boundAnalystRoles);
  return {db,open,desk:open()};
}

const suggestion = () => ({ticker:'00700.HK',market:'HK',action:'buy',confidence:75,
  reference_price:430,rationale:'本人独立判断',recommended_at:'2026-06-16T02:00:00Z',requestId:randomUUID()});

test('concurrent repeats register once, pin the completed window and round-trip the accepted evidence', async t => {
  let calls = 0;
  const {db,desk,open} = fixture(t,async () => { calls++; return sample(11); });
  const fields = suggestion();
  const [entry,repeat] = await Promise.all([desk.register('A',fields),desk.register('A',fields)]);
  assert.deepEqual(entry,repeat);
  assert.deepEqual(desk.view('PM').entries,[]);
  const firstNotices = getNotifications(db,desk.sessionId);
  assert.equal(firstNotices.length,1);
  assert.equal(firstNotices[0].title,'第 1 组 · 分析师 A 评分结果');
  assert.match(firstNotices[0].text,/T\+5 未命中 · 评分 -4\.2｜T\+10 未命中 · 评分 -3\.8/);
  assert.ok(!firstNotices[0].text.includes(fields.rationale));
  await assert.rejects(desk.register('A',{...fields,action:'pass'}),{status:409});
  await assert.rejects(desk.refresh('PM',entry.id),{status:403});
  const previousCalls = calls;
  const afterRestart = open();
  const b = await afterRestart.register('B',{...suggestion(),action:'pass'});
  assert.equal(calls,previousCalls);
  assert.equal(b.pairNo,entry.pairNo);
  assert.equal(afterRestart.view('PM').entries.length,2);
  const decision = {pairNo:1,note:'已核对实际收盘价',decision:'accept',evidenceIds:[entry.evidence.snapshotId,b.evidence.snapshotId]};
  assert.throws(() => desk.review('B',decision),{status:403});
  assert.throws(() => desk.review('PM',{...decision,evidenceIds:[]}),{status:409});
  const review = desk.review('PM',decision);
  assert.deepEqual(desk.review('PM',decision),review);
  assert.deepEqual(open().view('B').reviews,[review]);
  const notices = getNotifications(db,desk.sessionId);
  assert.deepEqual(notices.map(event => event.title),[
    '第 1 组建议 · PM 验收通过', '第 1 组 · 双方登记结果', '第 1 组 · 分析师 A 评分结果',
  ]);
  for (const fragment of [decision.note, '2026-07-02', '评分 -3.8', '评分 +3.8']) {
    assert.ok(notices[0].text.includes(fragment), '验收播报少了 ' + fragment);
  }
  assert.match(notices[1].text,/待 PM 核对验收/);
  assert.ok(notices.every(event => !event.text.includes(fields.rationale)));
});

test('refresh advances only real observed windows and keeps PM acceptance bound to the audited pair', async t => {
  let n = 1;
  const {db,desk} = fixture(t,async () => sample(n));
  const a = await desk.register('A',suggestion());
  const b = await desk.register('B',suggestion());
  assert.equal(a.status,'pending');
  assert.equal(desk.view('A').results[0].n,0);
  const decision = {pairNo:1,note:'观察窗口待满',decision:'accept',evidenceIds:[a.evidence.snapshotId,b.evidence.snapshotId]};
  assert.throws(() => desk.review('PM',decision),{status:409});
  desk.review('PM',{...decision,decision:'return'});
  await assert.rejects(desk.refresh('A',b.id),{status:403});
  n = 6;
  const first = await desk.refresh('PM',a.id);
  assert.equal(first.status,'provisional');
  assert.deepEqual(desk.view('PM').reviews,[]);
  n = 2;
  assert.deepEqual(await desk.refresh('A',a.id), first);
  n = 6;
  const second = await desk.refresh('B',b.id);
  desk.review('PM',{...decision,note:'核对5日暂评',evidenceIds:[first.evidence.snapshotId,second.evidence.snapshotId]});
  n = 11;
  await Promise.all([desk.refresh('A',a.id),desk.refresh('PM',a.id)]);
  const final = await desk.refresh('B',b.id);
  assert.equal(final.status,'final');
  assert.equal(final.recommendation.created_at,b.recommendation.created_at);
  assert.equal(final.recommendation.fill_price,first.recommendation.fill_price);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM registration_reviews').get().n,2);
  assert.deepEqual(desk.view('PM').reviews,[]);
  assert.equal(getNotifications(db,desk.sessionId).filter(row => row.title.includes('行情评分已更新')).length,4);
});

test('source outages preserve registration and a later refresh scores the original suggestion once', async t => {
  let online = false;
  const {desk} = fixture(t,async () => {
    if (!online) throw Object.assign(new Error('unavailable'),{code:'price_unavailable',status:503});
    return sample(11);
  });
  const fields = suggestion();
  const entry = await desk.register('A',fields);
  assert.equal(entry.status,'pending');
  assert.equal(entry.score,null);
  assert.equal(entry.evidence.mode,'unavailable');
  assert.match(entry.evidence.disclosure,/建议已登记/);
  assert.equal(desk.view('A').results[0].n,0);
  assert.equal((await desk.register('A',fields)).id,entry.id);
  online = true;
  const refreshed = await desk.refresh('A',entry.id);
  assert.equal(refreshed.id,entry.id);
  assert.equal(refreshed.recommendation.created_at,entry.recommendation.created_at);
  assert.equal(refreshed.score.score,-3.8);
  assert.equal(desk.view('A').results[0].n,1);
});

test('unpaired registrations announce newly available checkpoints once and skip unchanged scores', async t => {
  let n = 1;
  const {db,desk} = fixture(t,async () => sample(n));
  const first = await desk.register('A',suggestion());
  const notices = () => getNotifications(db,desk.sessionId);
  assert.match(notices()[0].text,/T\+5 待评[\s\S]*T\+10 待评/);

  n = 5;
  assert.equal((await desk.refresh('A',first.id)).status,'pending');
  assert.equal(notices().length,1);

  n = 6;
  await Promise.all([desk.refresh('A',first.id),desk.refresh('A',first.id)]);
  assert.equal(notices().length,2);
  assert.equal(notices()[0].title,'第 1 组 · 行情评分已更新');
  assert.match(notices()[0].text,/T\+5 未命中 · 评分 -4\.2｜T\+10 待评/);
  assert.doesNotMatch(notices()[0].text,/待 PM 核对验收/);

  n = 7;
  assert.equal((await desk.refresh('A',first.id)).status,'provisional');
  assert.equal(notices().length,2);

  n = 11;
  const final = await desk.refresh('A',first.id);
  assert.deepEqual(await desk.refresh('A',first.id),final);
  assert.equal(notices().length,3);
  assert.match(notices()[0].text,/T\+10 未命中 · 评分 -3\.8/);
  assert.deepEqual(desk.view('PM').entries,[]);
});

test('a legacy pending 20-day policy can settle at 10 days, even with a shorter stored bar count', async t => {
  let n = 6;
  const {db,desk} = fixture(t,async () => sample(n));
  const a = await desk.register('A',suggestion());
  const provisional = {...a, evidence: {...a.evidence, d20Date:null, d20Close:null, completedDays:15,
    disclosure:'第 20 日结算'}};
  delete provisional.evidence.finalDay;
  db.prepare('UPDATE registrations SET entry=? WHERE id=?').run(JSON.stringify(provisional),a.id);
  // Old complete cached windows must not be read as 10-day evidence.
  db.prepare('INSERT INTO registration_windows VALUES (?,?)').run('HK:00700.HK:2026-06-16',JSON.stringify({...sample(21),d10Date:undefined,d20Date:'2026-07-16'}));
  n = 11;
  const final = await desk.refresh('A', a.id);
  assert.equal(final.id,a.id);
  assert.equal(final.status,'final');
  assert.equal(final.evidence.finalDay,10);
  assert.equal(final.evidence.d10Date,'2026-07-02');
  assert.equal(final.evidence.completedDays,10);
});

test('new analysts join a new group while legacy membership and PM evidence stay intact', async t => {
  const profiles = [...defaultAnalystProfiles];
  const third = {id:'analyst-' + randomUUID(),display_name:'分析师 丙'};
  const {db,desk,open} = fixture(t,async () => sample(11),() => profiles);
  const a1 = await desk.register('A',suggestion());
  // Simulate a record written before the service kept membership separately.
  db.exec('DROP TABLE registration_groups');
  profiles.push(third);
  const upgraded = open();
  const c2 = await upgraded.register(third.id,suggestion());
  assert.equal(c2.pairNo,2);
  assert.equal(c2.recommendation.analyst_id,third.id.slice('analyst-'.length));
  assert.deepEqual(upgraded.view('PM').groups,[
    {pairNo:1,memberIds:['A','B'],submittedIds:['A'],complete:false},
    {pairNo:2,memberIds:['A','B',third.id],submittedIds:[third.id],complete:false},
  ]);
  assert.equal(upgraded.view(third.id).books[third.id].summary.avg_score,-3.8);
  assert.match(getNotifications(db,desk.sessionId)[0].text,/分析师 丙｜00700\.HK/);
  const b1 = await upgraded.register('B',suggestion());
  assert.equal(b1.pairNo,a1.pairNo);
  assert.deepEqual(upgraded.view(third.id).entries.map(entry => entry.id),[c2.id]);
  const acceptLegacy = {pairNo:1,decision:'accept',note:'原组已核对',evidenceIds:[a1.evidence.snapshotId,b1.evidence.snapshotId]};
  const oldReview = upgraded.review('PM',acceptLegacy);
  const a2 = await upgraded.register('A',suggestion());
  assert.equal(a2.pairNo,c2.pairNo);
  assert.throws(() => upgraded.review('PM',{...acceptLegacy,pairNo:2}),{status:409});
  assert.throws(() => upgraded.review(third.id,acceptLegacy),{status:403});
  const b2 = await upgraded.register('B',{...suggestion(),action:'pass'});
  assert.equal(b2.pairNo,c2.pairNo);
  const notice = getNotifications(db,desk.sessionId)[0];
  assert.equal(notice.title,'第 2 组 · 全组登记结果');
  assert.match(notice.text,/分析师 A｜00700\.HK[\s\S]*分析师 B｜00700\.HK[\s\S]*分析师 丙｜00700\.HK/);
  assert.doesNotMatch(notice.text,/本人独立判断/);
  const decision = {pairNo:2,decision:'accept',note:'三人证据已核对',evidenceIds:[a2,b2,c2].map(entry => entry.evidence.snapshotId)};
  const newReview = upgraded.review('PM',decision);
  assert.deepEqual(open().view('PM').reviews,[oldReview,newReview]);
  assert.deepEqual(open().view(third.id).reviews,[newReview]);
  assert.deepEqual(open().view('PM').submitted,{A:2,B:2,[third.id]:1});
  await assert.rejects(upgraded.register('analyst-' + randomUUID(),suggestion()),{status:403});
});

test('three bound analysts can finish PM review without other profiles posting, and existing groups retain their snapshot', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'osborn-score-cohort-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  const real = [1,2,3].map(n => ({id:'analyst-' + randomUUID(),display_name:'群分析师 ' + n}));
  const ids = real.map(profile => profile.id).sort();
  const profiles = () => [...defaultAnalystProfiles,...real];
  const admin = openFeishuAdmin(directory, profiles);
  const setBindings = settings => writeFile(join(directory,'feishu-bindings.json'),JSON.stringify(settings));
  const analystBySender = Object.fromEntries(real.map(({id},i) => ['ou_fixture_' + i,id]));
  assert.deepEqual(admin.boundAnalystRoles(),[]);
  await setBindings({analystBySender});
  assert.deepEqual(admin.boundAnalystRoles(),[]);
  await setBindings({chatId:'oc_fixture',analystBySender,approverIds:['ou_pm']});
  const {desk,open} = fixture(t,async () => sample(11),profiles,admin.boundAnalystRoles);
  for (const id of ids) await desk.register(id,suggestion());
  const pm = desk.view('PM');
  assert.deepEqual(pm.groups,[{pairNo:1,memberIds:ids,submittedIds:ids,complete:true}]);
  assert.equal(pm.entries.length,3);
  const evidenceIds = ids.map(id => pm.entries.find(entry => entry.role === id).evidence.snapshotId);
  const review = desk.review('PM',{pairNo:1,decision:'accept',note:'三份建议已核对',evidenceIds});
  assert.deepEqual(open().view('PM').reviews,[review]);

  const a = await desk.register('A',suggestion());
  const outside = desk.view('PM').groups.find(group => group.pairNo === a.pairNo);
  assert.deepEqual(outside.memberIds,['A','B']);
  // B subsequently joins the Feishu group but can still complete its existing A/B group.
  await setBindings({chatId:'oc_fixture',analystBySender:{...analystBySender,ou_added:'B'}});
  const reopened = open();
  assert.equal((await reopened.register('B',suggestion())).pairNo,a.pairNo);
  assert.equal(reopened.view('PM').groups.find(group => group.pairNo === a.pairNo).complete,true);
  const next = await reopened.register(ids[0],suggestion());
  assert.deepEqual(reopened.view('PM').groups.find(group => group.pairNo === next.pairNo).memberIds,['B',...ids]);
  assert.deepEqual(reopened.view('PM').reviews,[review]);
});

test('a large roster can finish and review without exceeding the Feishu card size', async t => {
  const profiles = Array.from({length:70}, (_, index) => ({
    id:'analyst-' + randomUUID(), display_name:`第 ${index + 1} 人 ${'试'.repeat(48)}`,
  }));
  const {db,desk} = fixture(t,async () => sample(11),() => profiles);
  for (const profile of profiles) await desk.register(profile.id,suggestion());
  const view = desk.view('PM');
  assert.equal(view.groups[0].complete,true);
  assert.equal(view.entries.length,profiles.length);
  const groupCards = getNotifications(db,desk.sessionId).filter(row => row.title.includes('全组登记结果'));
  assert.ok(groupCards.length > 1);
  assert.ok(groupCards.every(card => Buffer.byteLength(card.title + card.text) <= 16_000));
  const body = groupCards.map(card => card.text).join('\n');
  assert.ok(profiles.every(profile => body.includes(profile.display_name + '｜00700.HK')));
  const evidenceIds = view.groups[0].memberIds.map(member => view.entries.find(entry => entry.role === member).evidence.snapshotId);
  assert.equal(desk.review('PM',{pairNo:1,decision:'accept',note:'已核对',evidenceIds}).decision,'accept');
  const reviews = getNotifications(db,desk.sessionId).filter(row => row.title.includes('PM 验收通过'));
  assert.ok(reviews.length > 1);
  assert.ok(reviews.every(card => Buffer.byteLength(card.title + card.text) <= 16_000));
});
