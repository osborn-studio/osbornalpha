import {checkJournalInstance} from './journal-instance-check';
import {checkFenceTransport} from './fence-transport-check';
import {checkJournalRecovery} from './journal-recovery-check';
import {createPrivateKey,createPublicKey,randomUUID,sign} from 'node:crypto';
import {applyRevocationPage} from '../../src/lib/research/revocation/consumer';
import {chromium,expect} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Pool} from 'pg';
import {setDefaultResultOrder} from 'node:dns';
setDefaultResultOrder('ipv4first');
import {localSessionToken} from '../../src/lib/research/s4/auth';
import {replayObservation} from 'dsh-trade-strategy-evaluator/engine';
const state=JSON.parse(readFileSync(process.argv[2],'utf8')),web=JSON.parse(readFileSync(join(state.directory,'web-state.json'),'utf8')),demo=JSON.parse(readFileSync(join(state.directory,'s6-demo.json'),'utf8'));
async function main(){
 const db=new Pool({connectionString:state.adminUrl}),server=await chromium.launchServer({headless:true,args:['--host-resolver-rules=MAP localhost 127.0.0.1']});
 writeFileSync(join(state.directory,'chromium-pid.json'),JSON.stringify({pid:server.process().pid}),{mode:0o600});
 const browser=await chromium.connect(server.wsEndpoint());
 try{
  await checkJournalRecovery(browser,web.origin);
  const ctx=await browser.newContext({viewport:{width:1280,height:1000}});await ctx.addCookies([{name:'alpha_s4_local_session',value:localSessionToken(demo.actor.userId,web.secret,Date.now()+3600000),url:web.origin,httpOnly:true,sameSite:'Strict'}]);
  const page=await ctx.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===web.origin?r.continue():r.abort());
  await page.goto(web.origin+'/research/observations');await page.getByLabel('选择候选',{exact:true}).selectOption(demo.candidateId);
  await page.getByRole('button',{name:'查看 / 刷新历史'}).click();await page.getByRole('button',{name:'查看计算报告'}).click();
  await expect(page.getByText('尚无计算版本。没有行情时可登记等待状态。')).toBeVisible();
  await page.getByRole('button',{name:'计算当前观察'}).click();await expect(page.getByText('计算版本已保存；缺行情或未到期会如实显示。')).toBeVisible();
  await expect(page.getByRole('heading',{name:'等待起点',exact:true})).toBeVisible();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'校验并导出 Replay'}).click();
  const file=join(state.directory,'s6-replay.json');await (await download).saveAs(file);
  const replay=JSON.parse(readFileSync(file,'utf8'));expect(replayObservation(replay.input,replay.outcome).matches).toBe(true);
  await page.screenshot({path:join(state.directory,'s6-desktop.png'),fullPage:true});
  await page.setViewportSize({width:320,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:join(state.directory,'s6-mobile.png'),fullPage:true});
  await page.reload();await page.getByLabel('选择候选',{exact:true}).selectOption(demo.candidateId);await page.getByRole('button',{name:'查看 / 刷新历史'}).click();await page.getByRole('button',{name:'查看计算报告'}).click();await expect(page.getByRole('heading',{name:'等待起点',exact:true})).toBeVisible();
  const count=(await db.query('select count(*) from research_s6_evaluations where user_id=$1',[demo.actor.userId])).rows[0].count;expect(count).toBe('1');
  // Delay authentic server responses across unmount/remount. This manipulates
  // delivery timing only: response bodies and server authorization are real.
  await page.evaluate(()=>{
   const original=HTMLAnchorElement.prototype.click;
   (window as unknown as {replayClicks:number}).replayClicks=0;
   HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith('-replay.json'))(window as unknown as {replayClicks:number}).replayClicks++;return original.call(this);};
  });
  let unexpectedDownloads=0,evaluateRequests=0;
  const onDownload=()=>{unexpectedDownloads++;};page.on('download',onDownload);
  page.on('request',r=>{if(r.url().includes('/api/research/s6/observations/')&&r.postDataJSON()?.action==='evaluate')evaluateRequests++;});
  for(const action of ['prepare','replay']){
   let ready=false,release:()=>void=()=>{};
   const gate=new Promise<void>(resolve=>{release=resolve;});
   const pattern='**/api/research/s6/observations/'+demo.observationId;
   const delayed=async(route:import('@playwright/test').Route)=>{
    if(route.request().postDataJSON()?.action!==action)return route.continue();
    const response=await route.fetch();expect(response.status()).toBe(200);ready=true;
    await gate;await route.fulfill({response});
   };
   await page.route(pattern,delayed);
   try{
    await page.getByRole('button',{name:action==='prepare'?'计算当前观察':'校验并导出 Replay',exact:true}).click();
    await expect.poll(()=>ready).toBe(true);
    await page.getByLabel('选择候选',{exact:true}).selectOption('');
    await expect(page.getByRole('region',{name:'观察计算与回放'})).toHaveCount(0);
    await page.getByLabel('选择候选',{exact:true}).selectOption(demo.candidateId);
    await page.getByRole('button',{name:'查看 / 刷新历史'}).click();
    const arrived=page.waitForResponse(r=>r.url().endsWith('/'+demo.observationId)&&r.request().postDataJSON()?.action===action);
    release();await (await arrived).finished();
    await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,250)));
    expect(await page.evaluate(()=>(window as unknown as {replayClicks:number}).replayClicks)).toBe(0);
    expect(unexpectedDownloads).toBe(0);expect(evaluateRequests).toBe(0);
    await page.getByRole('button',{name:'查看计算报告'}).click();
    await expect(page.getByRole('heading',{name:'等待起点',exact:true})).toBeVisible();
   }finally{release();await page.unroute(pattern,delayed);}
  }
  page.off('download',onDownload);
  expect((await db.query('select count(*) from research_s6_evaluations where user_id=$1',[demo.actor.userId])).rows[0].count).toBe('1');
  // Lost delivery after a real commit must offer the SAME idempotent attempt
  // without first requiring a successful report read.
  const attempts:unknown[]=[];let loseReply=true;
  const evaluationRoute='**/api/research/s6/observations/'+demo.observationId;
  const loseCommittedReply=async(route:import('@playwright/test').Route)=>{
   if(route.request().postDataJSON()?.action!=='evaluate')return route.continue();
   attempts.push(route.request().postDataJSON());
   if(!loseReply)return route.continue();
   loseReply=false;const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');
  };
  await page.route(evaluationRoute,loseCommittedReply);
  try{
   await page.getByRole('button',{name:'计算当前观察',exact:true}).click();
   await expect(page.getByRole('button',{name:'重试同一计算',exact:true})).toBeVisible();
   // Reload loses React memory but the browser-local journal retains the intent.
   await page.reload();await page.getByLabel('选择候选',{exact:true}).selectOption(demo.candidateId);
   await page.getByRole('button',{name:'查看 / 刷新历史'}).click();
   await expect(page.getByText('发现待确认的计算，请重试同一计算核实结果。')).toBeVisible();
   const peer=await ctx.newPage();
   await peer.route('**/*',r=>new URL(r.request().url()).origin===web.origin?r.continue():r.abort());
   await peer.route(evaluationRoute,loseCommittedReply);
   try{
    await peer.goto(web.origin+'/research/observations');await peer.getByLabel('选择候选',{exact:true}).selectOption(demo.candidateId);
    await peer.getByRole('button',{name:'查看 / 刷新历史'}).click();
    await peer.getByRole('button',{name:'重试同一计算',exact:true}).click();
    await expect(peer.getByText('计算版本已保存；缺行情或未到期会如实显示。')).toBeVisible();
    await page.getByRole('button',{name:'重试同一计算',exact:true}).click();
    await expect(page.getByText('本机待确认记录已不存在，已刷新报告。')).toBeVisible();
   }finally{await peer.close();}
   const pendingCount=await page.evaluate(()=>new Promise<number>((resolve,reject)=>{const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onerror=()=>reject(Error('journal_probe'));r.onsuccess=()=>{const db=r.result,tx=db.transaction('pending','readonly'),count=tx.objectStore('pending').count();tx.oncomplete=()=>{db.close();resolve(count.result);};tx.onerror=()=>{db.close();reject(Error('journal_probe'));};};}));
   expect(pendingCount).toBe(0);
   await expect(page.getByRole('button',{name:'计算当前观察',exact:true})).toBeVisible();
   expect(attempts).toHaveLength(2);expect(attempts[1]).toEqual(attempts[0]);
   expect((await db.query('select count(*) from research_s6_evaluations where user_id=$1',[demo.actor.userId])).rows[0].count).toBe('2');
  }finally{await page.unroute(evaluationRoute,loseCommittedReply);}
  // Browser storage failure must never send a new evaluation.
  const breakJournal=()=>page.evaluate(()=>{const w=window as unknown as {savedOpen?:typeof indexedDB.open};w.savedOpen=indexedDB.open;indexedDB.open=()=>{throw new DOMException('Synthetic storage denied','SecurityError');};});
  const restoreJournal=()=>page.evaluate(()=>{const w=window as unknown as {savedOpen?:typeof indexedDB.open};if(w.savedOpen){indexedDB.open=w.savedOpen;delete w.savedOpen;}});
  const beforeStorageFailure=evaluateRequests;
  await breakJournal();
  try{
   await page.getByRole('button',{name:'计算当前观察',exact:true}).click();
   await expect(page.getByText('无法确认本机计算记录，计算已暂停；请重新读取本机记录。')).toBeVisible();
   expect(evaluateRequests).toBe(beforeStorageFailure);
  }finally{await restoreJournal();}
  await page.getByRole('button',{name:'重试读取本机计算记录',exact:true}).click();
  await page.getByRole('button',{name:'查看计算报告'}).click();
  await expect(page.getByRole('button',{name:'计算当前观察',exact:true})).toBeEnabled();
  const beforeStall=evaluateRequests;
  await page.evaluate(()=>{
   const w=window as unknown as {savedOpen?:typeof indexedDB.open;lateCloseCount:number};
   const original=indexedDB.open;w.savedOpen=original;w.lateCloseCount=0;
   indexedDB.open=function(...args:Parameters<typeof indexedDB.open>){
    const fake:{result?:IDBDatabase;onsuccess?:()=>void;onerror?:()=>void}={};
    setTimeout(()=>{const real=original.apply(indexedDB,args);real.onerror=()=>fake.onerror?.();real.onsuccess=()=>{const db=real.result,close=db.close.bind(db);db.close=()=>{w.lateCloseCount++;close();};fake.result=db;fake.onsuccess?.();};},5500);
    return fake as unknown as IDBOpenDBRequest;
   };
  });
  try{
   await page.getByRole('button',{name:'计算当前观察',exact:true}).click();
   await expect(page.getByText('无法确认本机计算记录，计算已暂停；请重新读取本机记录。')).toBeVisible({timeout:7000});
   await expect(page.getByRole('button',{name:'重试读取本机计算记录',exact:true})).toBeEnabled();
   expect(evaluateRequests).toBe(beforeStall);
   await expect.poll(()=>page.evaluate(()=>(window as unknown as {lateCloseCount:number}).lateCloseCount),{timeout:3000}).toBe(1);
   expect(evaluateRequests).toBe(beforeStall);
  }finally{await restoreJournal();}
  await page.getByRole('button',{name:'重试读取本机计算记录',exact:true}).click();await page.getByRole('button',{name:'查看计算报告'}).click();
  await expect(page.getByRole('button',{name:'计算当前观察',exact:true})).toBeEnabled();
  const ackAttempts:unknown[]=[];let breakAck=true;
  const lostAcknowledgement=async(route:import('@playwright/test').Route)=>{
   if(route.request().postDataJSON()?.action!=='evaluate')return route.continue();
   ackAttempts.push(route.request().postDataJSON());
   if(!breakAck)return route.continue();breakAck=false;
   const response=await route.fetch();expect(response.status()).toBe(200);
   await breakJournal();await route.fulfill({response});
  };
  await page.route(evaluationRoute,lostAcknowledgement);
  try{
   await page.getByRole('button',{name:'计算当前观察',exact:true}).click();
   await expect(page.getByText('计算已保存，但本机确认状态未知；请重新读取本机记录，系统不会自动新建。')).toBeVisible();
   await restoreJournal();await page.getByRole('button',{name:'重试读取本机计算记录',exact:true}).click();await page.getByRole('button',{name:'重试同一计算',exact:true}).click();
   await expect(page.getByText('计算版本已保存；缺行情或未到期会如实显示。')).toBeVisible();
   const afterAckCount=await page.evaluate(()=>new Promise<number>((resolve,reject)=>{const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onerror=()=>reject(Error('journal_probe'));r.onsuccess=()=>{const db=r.result,tx=db.transaction('pending','readonly'),count=tx.objectStore('pending').count();tx.oncomplete=()=>{db.close();resolve(count.result);};tx.onerror=()=>{db.close();reject(Error('journal_probe'));};};}));
   expect(afterAckCount).toBe(0);
   expect(ackAttempts).toHaveLength(2);expect(ackAttempts[0]).toEqual(ackAttempts[1]);
   expect((await db.query('select count(*) from research_s6_evaluations where user_id=$1',[demo.actor.userId])).rows[0].count).toBe('3');
  }finally{await restoreJournal();await page.unroute(evaluationRoute,lostAcknowledgement);}
  // A mount-time storage failure keeps its explanation while reports remain usable.
  await page.getByLabel('选择候选',{exact:true}).selectOption('');await breakJournal();
  try{
   await page.getByLabel('选择候选',{exact:true}).selectOption(demo.candidateId);await page.getByRole('button',{name:'查看 / 刷新历史'}).click();
   await expect(page.getByText('无法读取本机计算记录，计算已暂停；仍可查看报告。')).toBeVisible();
   await page.getByRole('button',{name:'查看计算报告'}).click();
   await expect(page.getByText('无法读取本机计算记录，计算已暂停；仍可查看报告。')).toBeVisible();
   await expect(page.getByRole('button',{name:'计算当前观察',exact:true})).toBeDisabled();
  }finally{await restoreJournal();}
  await page.getByRole('button',{name:'重试读取本机计算记录',exact:true}).click();
  await expect(page.getByText('无法读取本机计算记录，计算已暂停；仍可查看报告。')).toHaveCount(0);
  await page.getByRole('button',{name:'查看计算报告'}).click();await expect(page.getByRole('button',{name:'计算当前观察',exact:true})).toBeEnabled();
  // Real authenticated journal context; inject local synthetic damage only.
  const journalContext=await ctx.request.post(web.origin+'/api/research/s6/observations/'+demo.observationId,{headers:{Origin:web.origin},data:{action:'journal-context'}});
  expect(journalContext.status()).toBe(200);const diagnosticScope=(await journalContext.json()).journalScope;
  for(const marker of [false,true,'pending'] as const){
   await page.evaluate(({scope,marker})=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('pending','readwrite');tx.objectStore('pending').delete(scope);tx.objectStore('pending').delete('recovery:'+scope);tx.objectStore('pending').put(marker==='pending'?{action:'recover-evaluation',key:'synthetic-recovery',nonce:'11111111-1111-4111-8111-111111111111',snapshot:'{"synthetic":"private-sentinel"}'}:{synthetic:'private-sentinel'},marker?'recovery:'+scope:scope);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(Error('diagnostic_seed'));};};}),{scope:diagnosticScope,marker});
   await page.getByLabel('选择候选',{exact:true}).selectOption('');await page.getByLabel('选择候选',{exact:true}).selectOption(demo.candidateId);await page.getByRole('button',{name:'查看 / 刷新历史'}).click();
   const explanation=marker==='pending'?'本机记录正在等待恢复确认，计算已暂停；请保留记录，仍可查看报告。':marker?'本机恢复记录格式异常，计算已暂停；请保留记录，仍可查看报告。':'本机待确认记录格式异常，计算已暂停；记录已保留，仍可查看报告。';
   await expect(page.getByText(explanation,{exact:true})).toBeVisible();
   await page.getByRole('button',{name:'查看计算报告'}).click();await expect(page.getByRole('button',{name:'计算当前观察',exact:true})).toBeDisabled();
   await expect(page.getByText(explanation,{exact:true})).toBeVisible();await expect(page.getByText('private-sentinel')).toHaveCount(0);
   await page.getByRole('button',{name:'重试读取本机计算记录',exact:true}).click();await expect(page.getByText(explanation,{exact:true})).toBeVisible();
   await expect(page.getByRole('heading',{name:'等待起点',exact:true}).first()).toBeVisible();
   const stored=await page.evaluate(scope=>new Promise<{pending:unknown;marker:unknown;quarantine:number}>((resolve,reject)=>{const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('pending','readonly'),store=tx.objectStore('pending'),pending=store.get(scope),marker=store.get('recovery:'+scope),q=store.count(IDBKeyRange.bound('quarantine:'+scope+':','quarantine:'+scope+':\uffff'));tx.oncomplete=()=>{db.close();resolve({pending:pending.result,marker:marker.result,quarantine:q.result});};tx.onabort=()=>{db.close();reject(Error('diagnostic_read'));};};}),diagnosticScope);
   expect(stored).toEqual({pending:marker?undefined:{synthetic:'private-sentinel'},marker:marker==='pending'?{action:'recover-evaluation',key:'synthetic-recovery',nonce:'11111111-1111-4111-8111-111111111111',snapshot:'{"synthetic":"private-sentinel"}'}:marker?{synthetic:'private-sentinel'}:undefined,quarantine:0});

  }
  // Test-owned fixture cleanup, never a product purge operation.
  await page.evaluate(scope=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('pending','readwrite');tx.objectStore('pending').delete(scope);tx.objectStore('pending').delete('recovery:'+scope);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(Error('diagnostic_cleanup'));};};}),diagnosticScope);
  await page.getByRole('button',{name:'重试读取本机计算记录',exact:true}).click();await expect(page.getByRole('button',{name:'计算当前观察',exact:true})).toBeEnabled();
  // Recovery is a user-confirmed action, never automatic on damaged mount.
  await page.evaluate(scope=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('pending','readwrite');tx.objectStore('pending').put({synthetic:'ui-damage'},scope);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(Error('ui_damage'));};};}),diagnosticScope);
  await page.getByLabel('选择候选',{exact:true}).selectOption('');await page.getByLabel('选择候选',{exact:true}).selectOption(demo.candidateId);await page.getByRole('button',{name:'查看 / 刷新历史'}).click();
  const recoveryButton=page.getByRole('button',{name:'确认恢复损坏的计算记录',exact:true});await expect(recoveryButton).toBeVisible();
  const uiFenceBefore=Number((await db.query('select revision from research_s4_observation_state where observation_id=$1',[demo.observationId])).rows[0].revision);
  page.once('dialog',dialog=>dialog.dismiss());await recoveryButton.click();
  expect(Number((await db.query('select revision from research_s4_observation_state where observation_id=$1',[demo.observationId])).rows[0].revision)).toBe(uiFenceBefore);await expect(recoveryButton).toBeVisible();
  const inspectUiJournal=async()=>page.evaluate(scope=>new Promise<{pending:unknown;marker:unknown}>((resolve,reject)=>{const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('pending','readonly'),store=tx.objectStore('pending'),pending=store.get(scope),marker=store.get('recovery:'+scope);tx.oncomplete=()=>{db.close();resolve({pending:pending.result,marker:marker.result});};tx.onabort=()=>{db.close();reject(Error('ui_probe'));};};}),diagnosticScope);
  expect(await inspectUiJournal()).toEqual({pending:{synthetic:'ui-damage'},marker:undefined});
  page.once('dialog',async dialog=>{expect(dialog.message()).toContain('不会上传');await dialog.accept();});await recoveryButton.click();
  await expect(page.getByText('恢复已确认，可以重新准备计算。',{exact:true})).toBeVisible();await expect(recoveryButton).toHaveCount(0);await expect(page.getByRole('button',{name:'计算当前观察',exact:true})).toBeEnabled();
  expect(Number((await db.query('select revision from research_s4_observation_state where observation_id=$1',[demo.observationId])).rows[0].revision)).toBe(uiFenceBefore+1);
  expect(await inspectUiJournal()).toEqual({pending:undefined,marker:undefined});
  // Full quarantine fails locally and offers no repeated confirmation loop.
  await page.evaluate(scope=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('pending','readwrite'),store=tx.objectStore('pending');store.put({data:new Date('2026-01-01')},scope);store.put({synthetic:true},'quarantine:'+scope+':fixture-1');store.put({synthetic:true},'quarantine:'+scope+':fixture-2');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(Error('capacity_seed'));};};}),diagnosticScope);
  await page.getByLabel('选择候选',{exact:true}).selectOption('');await page.getByLabel('选择候选',{exact:true}).selectOption(demo.candidateId);await page.getByRole('button',{name:'查看 / 刷新历史'}).click();
  page.once('dialog',dialog=>dialog.accept());await recoveryButton.click();
  await expect(page.getByText('本机隔离记录已达保留上限，计算已暂停；记录未删除，仍可查看报告。',{exact:true}).first()).toBeVisible();await expect(recoveryButton).toHaveCount(0);
  expect(Number((await db.query('select revision from research_s4_observation_state where observation_id=$1',[demo.observationId])).rows[0].revision)).toBe(uiFenceBefore+1);
  expect((await db.query("select count(*) from research_s4_records where user_id=$1 and kind='ControlEvent' and payload->>'type'='evaluation.intent_fence'",[demo.actor.userId])).rows[0].count).toBe('1');
  const quarantineUiState=async()=>page.evaluate(scope=>new Promise<{count:number;pendingDate:boolean}>((resolve,reject)=>{const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('pending','readonly'),store=tx.objectStore('pending'),prefix='quarantine:'+scope+':',count=store.count(IDBKeyRange.bound(prefix,prefix+'\uffff')),pending=store.get(scope);tx.oncomplete=()=>{db.close();resolve({count:count.result,pendingDate:pending.result?.data instanceof Date});};tx.onabort=()=>{db.close();reject(Error('erase_probe'));};};}),diagnosticScope);
  const eraseButton=page.getByRole('button',{name:'删除本机隔离副本',exact:true});await expect(eraseButton).toBeEnabled();
  const cancelEraseDialog=page.waitForEvent('dialog'),cancelEraseClick=eraseButton.click();const cancelDialog=await cancelEraseDialog;expect(cancelDialog.message()).toContain('2 份');await cancelDialog.dismiss();await cancelEraseClick;await expect(eraseButton).toBeEnabled();
  expect(await quarantineUiState()).toEqual({count:2,pendingDate:true});expect(Number((await db.query('select revision from research_s4_observation_state where observation_id=$1',[demo.observationId])).rows[0].revision)).toBe(uiFenceBefore+1);
  await page.getByRole('button',{name:'查看计算报告'}).click();
  const changedEraseDialog=page.waitForEvent('dialog'),changedEraseClick=eraseButton.click();const changedDialog=await changedEraseDialog;
  let changedSelection=false;
  const changeSelection=async(route:import('@playwright/test').Route)=>{
   if(!changedSelection&&route.request().postDataJSON()?.action==='journal-context'){
    changedSelection=true;
    await page.evaluate(scope=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('pending','readwrite');tx.objectStore('pending').delete('quarantine:'+scope+':fixture-2');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(Error('peer_erase'));};};}),diagnosticScope);
   }
   await route.continue();
  };
  await page.route(evaluationRoute,changeSelection);
  try{await changedDialog.accept();await changedEraseClick;await expect(page.getByText('隔离副本已变化，请重新读取后再次确认删除。',{exact:true})).toBeVisible();expect(changedSelection).toBe(true);expect(await quarantineUiState()).toEqual({count:1,pendingDate:true});await expect(page.getByRole('heading',{name:'等待起点',exact:true}).first()).toBeVisible();}
  finally{await page.unroute(evaluationRoute,changeSelection);}
  await page.evaluate(scope=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('pending','readwrite');tx.objectStore('pending').put({synthetic:true},'quarantine:'+scope+':fixture-2');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(Error('restore_fixture'));};};}),diagnosticScope);
  const acceptEraseDialog=page.waitForEvent('dialog'),acceptEraseClick=eraseButton.click();const acceptDialog=await acceptEraseDialog;expect(acceptDialog.message()).toContain('2 份');expect(acceptDialog.message()).toContain('无法恢复');await acceptDialog.accept();await acceptEraseClick;
  await expect(page.getByText('已删除 2 份本机隔离副本；待确认记录和服务器结果未删除。',{exact:true})).toBeVisible();expect(await quarantineUiState()).toEqual({count:0,pendingDate:true});await expect(eraseButton).toHaveCount(0);
  expect(Number((await db.query('select revision from research_s4_observation_state where observation_id=$1',[demo.observationId])).rows[0].revision)).toBe(uiFenceBefore+1);
  await page.evaluate(scope=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('pending','readwrite'),store=tx.objectStore('pending');store.delete(scope);store.delete('quarantine:'+scope+':fixture-1');store.delete('quarantine:'+scope+':fixture-2');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(Error('capacity_cleanup'));};};}),diagnosticScope);
  await page.getByRole('button',{name:'重试读取本机计算记录',exact:true}).click();await page.getByRole('button',{name:'查看计算报告'}).click();await expect(page.getByRole('button',{name:'计算当前观察',exact:true})).toBeEnabled();
  // Remount acceptance only: an old instance must not alter the new view.
  // This does NOT establish same-instance load-counter protection.
  // Both replies are from the real route; denial is produced by omitting the
  // cookie on that request, not by mocking a JSON body.
  for(const oldDenied of [true,false]){
   let release!:()=>void,held=false,delivered=false,loads=0;
   const gate=new Promise<void>(resolve=>{release=resolve;});
   const overlappingContext=async(route:import('@playwright/test').Route)=>{
    if(route.request().postDataJSON()?.action!=='journal-context')return route.continue();
    const first=++loads===1,deny=first?oldDenied:!oldDenied;
    const response=await route.fetch(deny?{headers:{...route.request().headers(),cookie:''}}:{});
    expect(response.status()).toBe(deny?401:200);
    if(first){held=true;await gate;}
    await route.fulfill({response});if(first)delivered=true;
   };
   await page.route(evaluationRoute,overlappingContext);
   try{
    await page.getByLabel('选择候选',{exact:true}).selectOption('');await page.getByLabel('选择候选',{exact:true}).selectOption(demo.candidateId);await page.getByRole('button',{name:'查看 / 刷新历史'}).click();
    await expect.poll(()=>held).toBe(true);
    await page.getByLabel('选择候选',{exact:true}).selectOption('');await expect(page.getByRole('region',{name:'观察计算与回放'})).toHaveCount(0);await page.getByLabel('选择候选',{exact:true}).selectOption(demo.candidateId);await page.getByRole('button',{name:'查看 / 刷新历史'}).click();
    await expect.poll(()=>loads).toBeGreaterThanOrEqual(2);
    await page.getByRole('button',{name:'查看计算报告'}).click();
    if(oldDenied)await expect(page.getByRole('button',{name:'计算当前观察',exact:true})).toBeEnabled();
    else await expect(page.getByRole('button',{name:'计算当前观察',exact:true})).toBeDisabled();
    release();await expect.poll(()=>delivered).toBe(true);
    // Observe stability beyond the journal's five-second operation deadline.
    const stableUntil=Date.now()+6000;
    while(Date.now()<stableUntil){expect(await page.getByRole('button',{name:'计算当前观察',exact:true}).isEnabled()).toBe(oldDenied);await new Promise(resolve=>setTimeout(resolve,100));}
   }finally{release();await page.unroute(evaluationRoute,overlappingContext);}
  }
  await page.getByLabel('选择候选',{exact:true}).selectOption('');await page.getByLabel('选择候选',{exact:true}).selectOption(demo.candidateId);await page.getByRole('button',{name:'查看 / 刷新历史'}).click();await page.getByRole('button',{name:'查看计算报告'}).click();await expect(page.getByRole('button',{name:'计算当前观察',exact:true})).toBeEnabled();
  // Capture an unsent evaluation, resolve it explicitly, then deliver it late.
  let unsent:Record<string,unknown>|undefined;
  const holdUnsent=async(route:import('@playwright/test').Route)=>{if(route.request().postDataJSON()?.action!=='evaluate')return route.continue();unsent=route.request().postDataJSON();await route.abort('failed');};
  await page.route(evaluationRoute,holdUnsent);
  try{await page.getByRole('button',{name:'计算当前观察',exact:true}).click();await expect(page.getByRole('button',{name:'核实结果并取消未保存的计算',exact:true})).toBeVisible();}finally{await page.unroute(evaluationRoute,holdUnsent);}
  const loseResolution=async(route:import('@playwright/test').Route)=>{if(route.request().postDataJSON()?.action!=='resolve-intent')return route.continue();const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');};
  await page.route(evaluationRoute,loseResolution);
  try{await page.getByRole('button',{name:'核实结果并取消未保存的计算',exact:true}).click();await expect(page.getByRole('button',{name:'重试同一计算',exact:true})).toBeEnabled();}finally{await page.unroute(evaluationRoute,loseResolution);}
  await page.getByRole('button',{name:'重试同一计算',exact:true}).click();
  await expect(page.getByText('此计算已取消，不会再保存；请点击核实结果以清理本机待确认记录。')).toBeVisible();
  await page.getByRole('button',{name:'核实结果并取消未保存的计算',exact:true}).click();
  await expect(page.getByText('已取消尚未保存的计算；迟到请求不会新建结果。')).toBeVisible();
  const cancelledAgain=await ctx.request.post(web.origin+'/api/research/s6/observations/'+demo.observationId,{headers:{Origin:web.origin},data:{action:'resolve-intent',key:unsent!.key}});
  expect(cancelledAgain.status()).toBe(200);expect(await cancelledAgain.json()).toEqual({status:'cancelled',key:unsent!.key});
  const lateCommit=await ctx.request.post(web.origin+'/api/research/s6/observations/'+demo.observationId,{headers:{Origin:web.origin},data:unsent});
  expect(lateCommit.status()).toBe(409);expect(await lateCommit.json()).toEqual({error:{code:'evaluation_intent_cancelled'}});
  const committedKey=(ackAttempts[0] as {key:string}).key;
  const committedResolution=await ctx.request.post(web.origin+'/api/research/s6/observations/'+demo.observationId,{headers:{Origin:web.origin},data:{action:'resolve-intent',key:committedKey}});
  expect(committedResolution.status()).toBe(200);expect(await committedResolution.json()).toMatchObject({status:'committed',key:committedKey});
  expect((await db.query('select count(*) from research_s6_evaluations where user_id=$1',[demo.actor.userId])).rows[0].count).toBe('3');
  await checkJournalInstance(browser,ctx,web.origin,demo.observationId);
  const fenceCountBefore=Number((await db.query("select count(*) from research_s4_records where user_id=$1 and kind='ControlEvent' and payload->>'type'='evaluation.intent_fence'",[demo.actor.userId])).rows[0].count);
  const revisionBeforeFence=Number((await db.query('select revision from research_s4_observation_state where observation_id=$1',[demo.observationId])).rows[0].revision);
  const realFenceKey=await checkFenceTransport(page,web.origin,demo.observationId,diagnosticScope);
  await checkFenceTransport(page,web.origin,demo.observationId,diagnosticScope,'date');
  expect(Number((await db.query('select revision from research_s4_observation_state where observation_id=$1',[demo.observationId])).rows[0].revision)).toBe(revisionBeforeFence+2);
  expect((await db.query("select count(*) from research_s4_records where user_id=$1 and kind='ControlEvent' and payload->>'type'='evaluation.intent_fence'",[demo.actor.userId])).rows[0].count).toBe(String(fenceCountBefore+2));
  await page.getByLabel('选择候选',{exact:true}).selectOption(demo.candidateId);await page.getByRole('button',{name:'查看 / 刷新历史'}).click();await page.getByRole('button',{name:'查看计算报告'}).click();
  const assertFenceUnchanged=async()=>{
   expect(Number((await db.query('select revision from research_s4_observation_state where observation_id=$1',[demo.observationId])).rows[0].revision)).toBe(revisionBeforeFence+2);
   expect((await db.query("select count(*) from research_s4_records where user_id=$1 and kind='ControlEvent' and payload->>'type'='evaluation.intent_fence'",[demo.actor.userId])).rows[0].count).toBe(String(fenceCountBefore+2));
  };
  const other=await browser.newContext(),otherUser=randomUUID();
  try{
   await db.query('insert into auth.users(id) values($1)',[otherUser]);await db.query("update profiles set role='admin' where id=$1",[otherUser]);
   await other.addCookies([{name:'alpha_s4_local_session',value:localSessionToken(otherUser,web.secret,Date.now()+3600000),url:web.origin,httpOnly:true,sameSite:'Strict'}]);
   const deniedScope=await other.request.post(web.origin+'/api/research/s6/observations/'+demo.observationId,{headers:{Origin:web.origin},data:{action:'journal-context'}});
   expect((await other.request.post(web.origin+'/api/research/s6/observations/'+demo.observationId,{headers:{Origin:web.origin},data:{action:'fence-intents',key:realFenceKey}})).status()).toBe(404);
   expect(deniedScope.status()).toBe(404);expect(await deniedScope.json()).toEqual({error:{code:'not_found'}});
  }finally{await other.close();}
  const unauth=await browser.newContext();expect((await unauth.request.post(web.origin+'/api/research/s6/observations/'+demo.observationId,{headers:{Origin:web.origin},data:{action:'read'}})).status()).toBe(401);
  expect((await unauth.request.post(web.origin+'/api/research/s6/observations/'+demo.observationId,{headers:{Origin:web.origin},data:{action:'journal-context'}})).status()).toBe(401);
  expect((await unauth.request.post(web.origin+'/api/research/s6/observations/'+demo.observationId,{headers:{Origin:web.origin},data:{action:'fence-intents',key:'anonymous-fence-key'}})).status()).toBe(401);
  await assertFenceUnchanged();
  if(demo.revocation){
   writeFileSync(join(state.directory,'stop-feed'),'stop');await new Promise(r=>setTimeout(r,6000));
   await db.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '61 seconds' where feed_id=$1",[demo.revocation.feedId]);
   const stale=await ctx.request.post(web.origin+'/api/research/s6/observations/'+demo.observationId,{headers:{Origin:web.origin},data:{action:'read'}});expect(stale.status()).toBe(503);expect(await stale.json()).toEqual({error:{code:'revocation_check_unavailable'}});
   await page.getByRole('button',{name:'查看计算报告'}).click();await expect(page.getByText('暂时无法核实材料权限，请稍后重新查看报告。')).toBeVisible();
   await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp() where feed_id=$1',[demo.revocation.feedId]);
   await page.getByRole('button',{name:'查看计算报告'}).click();await expect(page.getByRole('heading',{name:'等待起点',exact:true}).first()).toBeVisible();
   // Leave storage recovery available, then revoke: the next context load must
   // report authority denial rather than blame IndexedDB.
   await breakJournal();try{await page.getByRole('button',{name:'计算当前观察',exact:true}).click();await expect(page.getByRole('button',{name:'重试读取本机计算记录',exact:true})).toBeVisible();}finally{await restoreJournal();}
   const r=demo.revocation,at=new Date().toISOString(),key=createPrivateKey(r.privateKey),raw=Buffer.from(JSON.stringify({protocol_version:'pa-revocation/v1',feed_id:r.feedId,owner_scope:r.scope,from_seq:'0',through_seq:'1',latest_seq:'1',published_at:at,events:[{revocation_id:randomUUID(),monotonic_seq:'1',source_id:r.sourceId,grant_id:r.grantId,grant_version:1,effective_at:at}]}));
   await applyRevocationPage(db,{feedId:r.feedId,localOwner:demo.actor.userId,scope:r.scope,key:createPublicKey(key)},raw,sign(null,raw,key).toString('hex'));
  }else await db.query('update research_s4_bindings set revoked=true where user_id=$1',[demo.actor.userId]);
  for(const key of [realFenceKey,'revoked-fresh-fence']){
   const deniedFence=await ctx.request.post(web.origin+'/api/research/s6/observations/'+demo.observationId,{headers:{Origin:web.origin},data:{action:'fence-intents',key}});
   expect(deniedFence.status()).toBe(403);expect(await deniedFence.json()).toEqual({error:{code:'revocation_access_denied'}});
  }
  await assertFenceUnchanged();
  const denied=await ctx.request.post(web.origin+'/api/research/s6/observations/'+demo.observationId,{headers:{Origin:web.origin},data:{action:'read'}});expect(denied.status()).toBe(403);expect(await denied.json()).toEqual({error:{code:'revocation_access_denied'}});
  expect((await unauth.request.post(web.origin+'/api/research/s6/observations/'+demo.observationId,{headers:{Origin:web.origin},data:{action:'fence-intents',key:'anonymous-fence-key'}})).status()).toBe(401);
  await assertFenceUnchanged();
  if(demo.revocation){
   await page.getByRole('button',{name:'重试读取本机计算记录',exact:true}).click();
   await expect(page.getByText('材料权限已撤回或当前账号无权访问。')).toBeVisible();
   await expect(page.getByText('无法读取本机计算记录，计算已暂停；仍可查看报告。')).toHaveCount(0);
   await expect(page.getByRole('button',{name:'重试读取本机计算记录',exact:true})).toHaveCount(0);
  }
  await page.getByRole('button',{name:'查看计算报告'}).click();await expect(page.getByText('材料权限已撤回或当前账号无权访问。')).toBeVisible();await expect(page.getByRole('button',{name:'校验并导出 Replay'})).toHaveCount(0);
  expect(errors).toEqual([]);
  const evidence={child_checks_passed:true,synthetic:true,real_next:true,serve_mode:web.serveMode||'development',research_runtime:'local',production_deployment_verified:false,signed_revocation:!!demo.revocation,real_postgres:true,mocked_api_responses:0,delayed_real_responses:4,aborted_committed_response:3,checks:['same_instance_id_change_stale_context_both_orders','isolated_stale_guard_mutants_killed_both_orders','remounted_journal_context_stable_after_old_response_both_orders','ui_quarantine_changed_selection_retains_report','ui_quarantine_erase_cancel_preserves','ui_quarantine_erase_confirmed_pending_preserved','ui_quarantine_full_no_fence_or_confirmation_loop','ui_recovery_confirmation_cancel_no_mutation','ui_recovery_confirmed_ready','fence_denials_mutation_free','revoked_owner_fence_replay_denied','unsupported_damage_quarantine_after_real_fence','real_fence_transport_lost_reply_reload_ack','fence_request_minimal_body','fence_replay_once_revision','fence_foreign_owner_404','fence_anonymous_401','journal_damaged_preserved_report_allowed','recovery_marker_damaged_preserved_report_allowed','recovery_pending_preserved_report_allowed','isolated_indexeddb_recovery_claim_reload_peer_cas','lost_resolution_reply_recovers_cancelled_intent','intent_resolution_committed_or_cancelled','cancelled_intent_late_delivery_denied','journal_context_denial_not_storage_error','journal_timeout_and_late_open_no_dispatch','journal_storage_failure_no_dispatch','journal_ack_failure_same_key','journal_mount_failure_manual_recovery','journal_context_foreign_owner_404','journal_context_unauthenticated_401','cross_tab_ack_does_not_resurrect_key','journal_empty_after_ack','reload_lost_commit_retries_durable_key','unmounted_prepare_does_not_evaluate','unmounted_replay_does_not_download','synthetic_candidate','report_exposure','pending_start_persisted','offline_replay','reload_persistence','320px_no_overflow','revocation_clears_report','unauthenticated_401','no_uncaught_page_errors']};
  writeFileSync(join(state.directory,'s6-browser-result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }finally{await db.end();await browser.close();await server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
