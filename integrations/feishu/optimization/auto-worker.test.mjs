import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {openFrictionMonitor} from '../feishu-friction.mjs';
import {workerStatus,workerTick} from './auto-worker.mjs';
import {labelIncident} from './friction-label.mjs';

const privateMarkers=['商业项目绝密甲','ou_test_sender_private','我只是问问你的看法'];
const episode={version:1,turns:[
  {user:privateMarkers[0]+'，现在适合买入吗？',assistant:'请确认',intent:'proposal',rawIntent:'proposal',outcome:'pm_summary'},
  {user:privateMarkers[2]+'，不是让你登记。',outcome:'chat'},
]};
const offlineLabel=incident=>labelIncident(incident,{env:{},fetchImpl:()=>assert.fail('tests must remain offline')});
function harness(t) {
  const root=mkdtempSync(join(tmpdir(),'feishu-optimization-worker-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const config={directory:join(root,'optimization'),monitorPath:join(root,'monitor.sqlite'),liveQueuePath:join(root,'workflow.sqlite'),
    baseUrl:'http://127.0.0.1:19999/v1',model:'offline-test',timeoutMs:1000,apply:true,cooldownMs:360000};
  const source=new DatabaseSync(config.monitorPath);
  source.exec('CREATE TABLE friction_incidents(id TEXT PRIMARY KEY,component TEXT,created_at INTEGER,signal TEXT,episode_json TEXT)');
  t.after(()=>source.close());
  const activePath=join(root,'active.json');
  const baseline={chat:'现行聊天',extraction:'现行提取'};
  writeFileSync(activePath,JSON.stringify(baseline));
  let time=Date.UTC(2026,1,10);
  const now=()=>time;
  const advance=ms=>{time+=ms;};
  const insert=(id,component='extraction',signal='misrouted_proposal',data=episode)=>
    source.prepare('INSERT INTO friction_incidents VALUES(?,?,?,?,?)').run(id,component,now(),signal,JSON.stringify(data));
  const tick=(overrides={})=>workerTick(config,{now,queueBusy:()=>false,label:offlineLabel,
    cycle:()=>assert.fail('unexpected optimization'),cycleOptions:{activePath},...overrides});
  const status=()=>workerStatus(config);
  return {root,config,now,advance,insert,tick,status,activePath,baseline};
}

test('group priority, private label projection, idempotent consumption and cooldown hold across separate polls',async t=>{
  const h=harness(t); let labels=0,cycles=0;
  const label=async i=>{labels++;return offlineLabel(i);};
  const cycle=async (batch,opts)=>{
    cycles++;
    for(const marker of privateMarkers)assert.ok(!JSON.stringify(batch).includes(marker));
    assert.equal(batch.component,'extraction');
    assert.ok(batch.development.some(r=>r.group.startsWith('feedback-')&&r.split==='train'));
    assert.ok(batch.holdout.every(r=>r.split==='holdout')); assert.ok(batch.businessFixtures.cases.length);
    assert.equal(opts.liveQueuePath,h.config.liveQueuePath);
    return {status:'no_challenger'};
  };
  h.insert(privateMarkers[1]+'-first');
  assert.equal((await h.tick({queueBusy:()=>true,label,cycle})).state,'deferring_to_group');
  assert.equal(labels,0);
  assert.equal((await h.tick({label,cycle})).state,'no_challenger');
  assert.equal((await h.tick({label,cycle})).state,'watching');
  h.advance(1); h.insert(privateMarkers[1]+'-second');
  assert.equal((await h.tick({label,cycle})).state,'cooldown');
  h.advance(h.config.cooldownMs);
  assert.equal((await h.tick({label,cycle})).state,'no_challenger');
  assert.equal(labels,2); assert.equal(cycles,2);
  assert.deepEqual(h.status().counts,{finished:2});
});

test('both model labeling and worker experiment failures back off and retry exactly once when available',async t=>{
  const h=harness(t); let labels=0,cycles=0;
  const label=async i=>{if(++labels===1)throw Error('temporary local inference failure');return offlineLabel(i);};
  const cycle=()=>{if(++cycles===1)throw Error('temporary offline failure');return {status:'rejected'};};
  h.insert('incident-retry');
  assert.equal((await h.tick({label,cycle})).state,'watching');
  assert.equal((await h.tick({label,cycle})).state,'watching');
  assert.equal(labels,1);assert.equal(cycles,0);
  h.advance(300000);
  assert.equal((await h.tick({label,cycle})).state,'retry_scheduled');
  assert.equal((await h.tick({label,cycle})).state,'watching');
  h.advance(300000);
  assert.equal((await h.tick({label,cycle})).state,'rejected');
  assert.equal((await h.tick({label,cycle})).state,'watching');
  assert.equal(labels,2);assert.equal(cycles,2);
  assert.deepEqual(h.status().counts,{finished:1});
});

test('worker lease excludes a concurrent poll while an experiment is still running',async t=>{
  const h=harness(t); h.insert('incident-lock');
  let accepted,release;
  const entered=new Promise(resolve=>{accepted=resolve;});
  const done=new Promise(resolve=>{release=resolve;});
  const first=h.tick({cycle:async()=>{accepted();await done;return {status:'eligible'};}});
  await entered;
  try {
    assert.equal((await h.tick()).state,'already_running');
  } finally {release();}
  assert.equal((await first).state,'eligible');
  assert.deepEqual(h.status().counts,{finished:1});
});

test('source admission processes records added beyond the first full scan page',async t=>{
  const h=harness(t);
  for(let i=0;i<270;i++)h.insert('incident-'+String(i).padStart(4,'0'),'chat','model_failure',{version:1,turns:[]});
  const label=async ()=>({component:'chat',status:'diagnostic',reason:'runtime_failure',examples:[]});
  for(let i=0;i<30;i++)await h.tick({label});
  assert.deepEqual(h.status().counts,{diagnostic:270});
});

test('safe crash recovery finishes a durable decision and reschedules incomplete or truncated outputs',async t=>{
  const h=harness(t); h.status();
  const db=new DatabaseSync(join(h.config.directory,'worker.sqlite'));
  try{
    for(const [id,file] of [['completed','{"status":"rejected"}'],['interrupted',null],['truncated','{']]){
      db.prepare("INSERT INTO runs(id,started,component,family,status) VALUES(?,?,'chat','casual','running')").run(id,h.now());
      db.prepare("INSERT INTO items(id,created,component,state,run_id) VALUES(?,?,'chat','running',?)").run(id,h.now(),id);
      const path=join(h.config.directory,'runs',id); mkdirSync(path,{recursive:true});
      if(file!==null)writeFileSync(join(path,'decision.json'),file);
    }
    await h.tick();
    const states=db.prepare('SELECT id,status FROM runs ORDER BY id').all().map(({id,status})=>[id,status]);
    assert.deepEqual(states,[['completed','rejected'],['interrupted','retry'],['truncated','retry']]);
    assert.deepEqual(h.status().counts,{finished:1,pending:2});
  }finally{db.close();}
});

test('different causes within one family have their own training batch and independent acceptance target',async t=>{
  const h=harness(t), tasks=[];
  h.insert('cash-case','extraction','member_correction',{version:1,turns:[
    {user:'我建议买入，总预算24万元。',intent:'proposal',rawIntent:'proposal',rawFields:{quantity:24},outcome:'pm_summary'},
    {user:'说的是预算，不是股数。'},
  ]});
  h.insert('share-case','extraction','repeated_clarification',{version:1,turns:[
    {user:'35',outcome:'awaiting_details',isSupplement:true,missing:['quantity'],priorMissing:['quantity'],
      priorFields:{ticker:'TEST',price:47,action:'buy'},intent:'proposal',rawIntent:'proposal',fields:{},rawFields:{}},
  ]});
  const cycle=async batch=>{
    const targets=batch.holdout.filter(row=>batch.targetIds.includes(row.id));
    assert.equal(targets.length,6);
    assert.equal(batch.holdout.length,16);
    const task=batch.targetIds[0].split('-').at(-2);
    assert.ok(targets.every(row=>row.id.includes('-'+task+'-')));
    const newGroups=new Set(batch.development.filter(row=>row.group.startsWith('feedback-')).map(row=>row.group));
    assert.equal(newGroups.size,1);
    tasks.push(task);
    return {status:'rejected'};
  };
  assert.equal((await h.tick({cycle})).incidentCount,1);
  assert.equal((await h.tick({cycle})).incidentCount,1);
  assert.deepEqual(tasks,['cash_budget','share_count']);
});

test('a confirmed tool correction becomes synthetic chat development and separately sealed tool probes',async t=>{
  const h=harness(t);
  h.config.monitorPath=join(h.root,'actual-monitor.sqlite');
  const monitor=openFrictionMonitor(h.config.monitorPath,{now:h.now});
  t.after(()=>monitor.close());
  const group={chatId:'oc_synthetic'};
  const event={chatId:group.chatId,senderId:'ou_fixture_only',threadId:'om_parent'};
  const report=section=>({read:'formal_report',scope:'named',subject:'训练中不可出现的人名',sections:[section]});
  monitor.observeRead({...event,messageId:'first',text:'随口问一下',modelSelected:true,readAction:report('trades')},group);
  monitor.observeRead({...event,messageId:'second',text:'我说的是评分。',modelSelected:false,readAction:report('scores')},group);
  const out=await h.tick({cycle:async batch=>{
    assert.equal(batch.component,'chat');
    assert.doesNotMatch(JSON.stringify(batch),/训练中不可出现的人名|随口问一下|ou_fixture_only|我说的是评分/);
    assert.ok(batch.development.some(r=>r.expect.tool?.sections?.includes('scores')));
    assert.ok(batch.development.some(r=>r.expect.tool?.sections?.includes('trades')));
    const probes=batch.holdout.filter(r=>batch.targetIds.includes(r.id));
    assert.equal(probes.length,6);
    assert.deepEqual(new Set(probes.map(r=>r.expect.tool.scope)),new Set(['named','self','context','all']));
    assert.ok(probes.every(r=>r.expect.tool.sections.join() === 'scores'));
    const trainingTexts=new Set(batch.development.map(r=>r.input.text));
    assert.ok(batch.holdout.every(r=>!trainingTexts.has(r.input.text)));
    return {status:'rejected'};
  }});
  assert.equal(out.state,'rejected');
  assert.equal(out.family,'reads');
});

test('foreground traffic interrupts a running search and its incident remains eligible for the next idle poll',async t=>{
  const h=harness(t);
  h.insert('priority-incident');
  let busy=false;
  const run=h.tick({queueBusy:()=>busy,cycle:async (_batch,{signal})=>{
    busy=true;
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('expected priority cancellation')),1500);
      signal.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});
    });
    throw signal.reason;
  }});
  assert.equal((await run).state,'deferring_to_group');
  assert.equal(h.status().counts.eligible,1);
  assert.equal(h.status().lastRuns[0].status,'deferred');
});

test('an analyst extractor read correction trains that component and includes independent business expectations',async t=>{
  const h=harness(t);
  h.insert('analyst-read','extraction','read_correction',{version:1,turns:[
    {user:'',outcome:'verified_read_correction',previousRead:'scores',expectedRead:'trades'},
  ]});
  const outcome=await h.tick({cycle:async batch=>{
    assert.equal(batch.component,'extraction');
    assert.ok(batch.development.some(r=>r.expect.intent==='read' && r.expect.query.sections.includes('trades')));
    const probes=batch.holdout.filter(r=>batch.targetIds.includes(r.id));
    assert.ok(probes.every(r=>r.expect.intent==='read' && r.expect.query.sections.join()==='trades'));
    assert.ok(batch.businessFixtures.cases.filter(r=>batch.targetIds.includes(r.id)).every(r=>r.expected.route==='read_only'));
    return {status:'no_challenger'};
  }});
  assert.equal(outcome.family,'read_intents');
});
