import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { openFeishuWorkflow } from '../../integrations/feishu/feishu-workflow.mjs';
import { getNotifications, setupDelivery } from './delivery.mjs';
import { openDemoRecaps } from './demo-recap.mjs';
import { openRegistrationDesk } from './registration-store.mjs';

function transaction(db) {
  return fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); db.exec('COMMIT'); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
}

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(),'osborn-feishu-recap-'));
  const db = new DatabaseSync(join(directory,'workflow.sqlite'));
  const replay = new DatabaseSync(join(directory,'replay.sqlite'));
  const snapshot = JSON.parse(readFileSync(new URL('./tencent-hk00700.json',import.meta.url)));
  const start = snapshot.bars.findIndex(([date]) => date === '2026-06-16');
  let barCount = 1, clock = Date.parse('2026-10-12T12:00:00Z'), refreshCalls = 0;
  const tx = transaction(db);
  const bindings = {chatId:'oc_team',analystBySender:{ou_analyst:'A'},approverIds:['ou_pm']};
  openFeishuWorkflow(db,tx,{config:() => bindings});
  setupDelivery(replay);
  const desk = openRegistrationDesk(replay,transaction(replay),() => {
    const bars = snapshot.bars.slice(start,start + barCount).map(([time,close]) => ({time,close}));
    return {...snapshot,market:'HK',ticker:'00700.HK',source:'本地行情快照',mode:'snapshot',snapshotId:'v'+barCount,
      bars,baseDate:bars[0].time,d5Date:bars[5]?.time ?? null,d10Date:bars[10]?.time ?? null};
  });
  const fetchImpl = async (url,{body,headers}) => {
    assert.equal(headers.origin,'http://127.0.0.1:4317');
    if (url.endsWith('/api/demo/role')) {
      assert.deepEqual(JSON.parse(body),{role:'A'});
      return Response.json({key:'x'.repeat(43)});
    }
    assert.equal(url,'http://127.0.0.1:4317/api/registrations/refresh');
    assert.equal(headers['x-demo-registration-source'],'feishu-recap');
    assert.equal(headers.authorization,'Bearer '+'x'.repeat(43));
    refreshCalls++;
    return Response.json({entry:await desk.refresh('A',JSON.parse(body).id,{forRecap:true})});
  };
  const open = () => openDemoRecaps(db,tx,{directory,config:() => bindings,port:4317,now:() => clock,fetchImpl,
    log:message => assert.fail(message)});
  let recaps = open();
  t.after(async () => { await recaps.close(); db.close(); replay.close(); rmSync(directory,{recursive:true,force:true}); });
  async function register() {
    const proposal = randomUUID(), origin = 'om_'+randomUUID(), summary = 'om_'+randomUUID();
    const entry = await desk.register('A',{ticker:'00700.HK',market:'HK',action:'buy',confidence:70,
      recommended_at:'2026-06-16T02:00:00Z',requestId:proposal});
    db.prepare(`INSERT INTO feishu_workflow_proposals
      (id,origin,chat_id,sender_id,role,body,summary_id,approval,approver_id,demo_status,demo_id,simulation_status)
      VALUES(?,?,'oc_team','ou_analyst','A','{}',?,?,'ou_pm','registered',?,'not_requested')`)
      .run(proposal,origin,summary,'om_'+randomUUID(),entry.id);
    return {proposal,entry,summary};
  }
  return { register,bindings, get recaps() { return recaps; }, restart:async () => { await recaps.close(); recaps = open(); },
    advance:minutes => { clock += minutes*60_000; }, mature:n => { barCount=n; },
    get calls() { return refreshCalls; }, desk,
    broadcasts:() => getNotifications(replay,desk.sessionId),
    messages:() => db.prepare("SELECT * FROM feishu_workflow_messages WHERE kind='demo_recap' ORDER BY seq").all(),
  };
}

test('new enrolled registrations publish each mature Demo checkpoint to the original summary and resume after restart', async t => {
  const h = fixture(t);
  await h.register(); // Previously recorded registration without an enrollment.
  const {proposal,entry,summary} = await h.register();
  h.recaps.track(proposal,entry);
  h.recaps.track(proposal,entry);
  const originalBroadcasts = h.broadcasts().length;
  h.advance(1);
  h.mature(6);
  await Promise.all([h.recaps.tick(),h.recaps.tick()]);
  assert.equal(h.calls,1);
  assert.equal(h.broadcasts().length,originalBroadcasts);
  const [first] = h.messages();
  assert.equal(first.reply_to,summary);
  assert.equal(first.chat_id,'oc_team');
  assert.equal(first.proposal_id,proposal);
  assert.match(first.text,/Demo 复盘 · 00700.HK · 暂评[\s\S]*T\+5（2026-06-24）[\s\S]*本地行情快照/);
  await h.restart();
  h.advance(6);
  await h.recaps.tick();
  assert.equal(h.messages().length,1);
  h.mature(11);
  await h.desk.refresh('A',entry.id);
  h.advance(6);
  await h.recaps.tick();
  const messages = h.messages();
  assert.equal(messages.length,2);
  assert.match(messages[1].text,/最终评分[\s\S]*T\+10（2026-07-02）/);
  assert.doesNotMatch(messages[1].text,/T\+5/);
  assert.equal(messages[1].reply_to,summary);
  h.advance(24*60);
  await h.recaps.tick();
  assert.equal(h.messages().length,2);
});

test('changed membership or a finished initial score never triggers a market refresh or recap', async t => {
  const h = fixture(t);
  const pending = await h.register();
  h.recaps.track(pending.proposal,pending.entry);
  h.mature(11);
  const historical = await h.register();
  h.recaps.track(historical.proposal,historical.entry);
  h.bindings.approverIds = [];
  h.advance(2);
  await h.recaps.tick();
  assert.equal(h.calls,0);
  assert.deepEqual(h.messages(),[]);
  h.bindings.approverIds = ['ou_pm'];
  await h.restart();
  h.advance(24*60);
  await h.recaps.tick();
  assert.equal(h.calls,0);
});
