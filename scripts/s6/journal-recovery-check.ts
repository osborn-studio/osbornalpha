import {buildSync} from 'esbuild';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
type JournalTestApi=typeof import('../../src/components/research/s4/evaluation-journal') & {confirmEvaluationFence:(ok:boolean,body:unknown,key:string,scope:string,digest:string)=>import('../../src/components/research/s4/evaluation-journal').ConfirmedEvaluationFence};
import {expect,type Browser} from '@playwright/test';
/** Real IndexedDB module tests, separate from served UI acceptance. No server
 * fence is invoked here; end-to-end recovery integration remains a separate gate. */
export async function checkJournalRecovery(browser:Browser,origin:string){
 const context=await browser.newContext();
 // tsx keeps inferred function names inside serialized Playwright callbacks.
 await context.addInitScript("globalThis.__name = (value) => value;");
 try{
  // Test-only facade exposes the private parser for CAS fault injection.
  // Production exports do not include it; transport tests exercise the real API.
  const bundle=buildSync({stdin:{contents:readFileSync('src/components/research/s4/evaluation-journal.ts','utf8')+'\nexport {confirmEvaluationFence};',resolveDir:resolve('src/components/research/s4'),sourcefile:'journal-test-facade.ts',loader:'ts'},bundle:true,write:false,format:'iife',globalName:'journalRecovery',platform:'browser'}).outputFiles[0].text;
  const first=await context.newPage(),peer=await context.newPage();
  for(const page of [first,peer]){await page.goto(origin+'/journal-check-only');await page.addScriptTag({content:bundle});}
  const scope='f'.repeat(64);
  const seed=async(value:unknown)=>first.evaluate(({scope,value})=>new Promise<void>((resolve,reject)=>{
   const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('pending');r.onerror=()=>reject(Error('seed_failed'));r.onsuccess=()=>{const db=r.result,tx=db.transaction('pending','readwrite');tx.objectStore('pending').put(value,scope);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(Error('seed_failed'));};};
  }),{scope,value});
  await seed({action:'evaluate',key:null,revision:0});
  expect(await first.evaluate(async scope=>{const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery;try{await api.pendingEvaluation(scope);return 'unexpected_success';}catch(error){return error instanceof api.EvaluationJournalError?error.code:'unexpected_error';}},scope)).toBe('evaluation_journal_damaged');
  expect(await first.evaluate(()=>{const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery;try{api.confirmEvaluationFence(false,{status:'fenced',key:'test-key',revision:1,recordId:crypto.randomUUID()},'test-key','0'.repeat(64),'0'.repeat(64));return false;}catch{return true;}})).toBe(true);
  const claims=await Promise.all([first,peer].map((page,n)=>page.evaluate(({scope,n})=>(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery.claimEvaluationRecovery(scope,'recovery-key-'+n),{scope,n})));
  expect(claims[0]).not.toBeNull();expect(claims[1]).toEqual(claims[0]);const recovery=claims[0]!;expect(Object.keys(recovery).sort()).toEqual(['action','key','snapshotDigest']);expect(JSON.stringify(recovery)).not.toContain('revision');
  expect(await first.evaluate(recovery=>(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery.evaluationFenceRequest(recovery),recovery)).toEqual({action:'fence-intents',key:recovery.key});
  expect(await first.evaluate(async({scope,recovery})=>{const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery;try{
   // @ts-expect-error Invalid caller: an acknowledgement requires a parsed server confirmation.
   await api.acknowledgeEvaluationRecovery(scope,recovery);return false;
  }catch{return true;}},{scope,recovery})).toBe(true);
  expect(await first.evaluate(({scope,recovery})=>{const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery;return api.acknowledgeEvaluationRecovery(scope,{...recovery,snapshotDigest:'0'.repeat(64)},api.confirmEvaluationFence(true,{status:'fenced',key:recovery.key,revision:1,recordId:crypto.randomUUID()},recovery.key,scope,'0'.repeat(64)));},{scope,recovery})).toEqual({status:'superseded'});
  await first.reload();await first.addScriptTag({content:bundle});
  expect(await first.evaluate(scope=>(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery.claimEvaluationRecovery(scope,'replacement-key'),scope)).toEqual(recovery);
  expect(await peer.evaluate(async scope=>{const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery;try{await api.pendingEvaluation(scope);return 'unexpected_success';}catch(error){return error instanceof api.EvaluationJournalError?error.code:'unexpected_error';}},scope)).toBe('evaluation_recovery_pending');
  // Simulate a newer local record from another writer. Old CAS must preserve it.
  const newer={action:'evaluate' as const,key:'new-valid-key',asOf:new Date().toISOString(),revision:7,marketIds:[]};await seed(newer);
  expect(await first.evaluate(({scope,recovery})=>(()=>{const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery;return api.acknowledgeEvaluationRecovery(scope,recovery,api.confirmEvaluationFence(true,{status:'fenced',key:recovery.key,revision:1,recordId:crypto.randomUUID()},recovery.key,scope,recovery.snapshotDigest));})(),{scope,recovery})).toEqual({status:'record-changed'});
  expect(await peer.evaluate(scope=>(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery.pendingEvaluation(scope),scope)).toEqual(newer);
  await seed({damaged:true});
  const second=await peer.evaluate(scope=>(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery.claimEvaluationRecovery(scope,'second-recovery'),scope);expect(second).not.toBeNull();
  expect(await first.evaluate(({scope,recovery})=>(()=>{const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery;return api.acknowledgeEvaluationRecovery(scope,recovery,api.confirmEvaluationFence(true,{status:'fenced',key:recovery.key,revision:1,recordId:crypto.randomUUID()},recovery.key,scope,recovery.snapshotDigest));})(),{scope,recovery})).toEqual({status:'superseded'});
  expect(await peer.evaluate(({scope,recovery})=>(()=>{const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery;return api.acknowledgeEvaluationRecovery(scope,recovery,api.confirmEvaluationFence(true,{status:'fenced',key:recovery.key,revision:1,recordId:crypto.randomUUID()},recovery.key,scope,recovery.snapshotDigest));})(),{scope,recovery:second!})).toEqual({status:'cleared'});
  expect(await first.evaluate(scope=>(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery.pendingEvaluation(scope),scope)).toBeNull();
  for(const replace of [false,true]){
   await seed({race:'old'});
   const handle=await first.evaluate(scope=>(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery.claimEvaluationRecovery(scope,'held-digest-key'),scope);expect(handle).not.toBeNull();
   await first.evaluate(({scope,handle})=>{
    const w=window as unknown as {journalRecovery:JournalTestApi;releaseHash?:()=>void;hashEntered:boolean;pendingAck?:Promise<unknown>;savedDigest:typeof crypto.subtle.digest};
    w.savedDigest=crypto.subtle.digest.bind(crypto.subtle);w.hashEntered=false;
    crypto.subtle.digest=async(...args:Parameters<typeof crypto.subtle.digest>)=>{w.hashEntered=true;await new Promise<void>(resolve=>{w.releaseHash=resolve;});return w.savedDigest(...args);};
    const ack=w.journalRecovery.confirmEvaluationFence(true,{status:'fenced',key:handle.key,revision:1,recordId:crypto.randomUUID()},handle.key,scope,handle.snapshotDigest);
    w.pendingAck=w.journalRecovery.acknowledgeEvaluationRecovery(scope,handle,ack);
   },{scope,handle:handle!});
   await first.waitForFunction(()=>(window as unknown as {hashEntered:boolean}).hashEntered);
   try{
    await peer.evaluate(async({scope,handle})=>{const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery;await api.acknowledgeEvaluationRecovery(scope,handle,api.confirmEvaluationFence(true,{status:'fenced',key:handle.key,revision:1,recordId:crypto.randomUUID()},handle.key,scope,handle.snapshotDigest));},{scope,handle:handle!});
    if(replace){await seed({race:'old'});const replaced=await peer.evaluate(scope=>(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery.claimEvaluationRecovery(scope,'held-digest-key'),scope);expect(replaced!.snapshotDigest).not.toBe(handle!.snapshotDigest);expect(replaced!.key).not.toBe(handle!.key);}
   }finally{await first.evaluate(()=>{const w=window as unknown as {releaseHash?:()=>void;savedDigest:typeof crypto.subtle.digest};crypto.subtle.digest=w.savedDigest;w.releaseHash?.();});}
   expect(await first.evaluate(()=>(window as unknown as {pendingAck:Promise<unknown>}).pendingAck)).toEqual({status:replace?'superseded':'absent'});
   if(replace){const remaining=await peer.evaluate(scope=>(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery.claimEvaluationRecovery(scope,'different-key'),scope);expect(remaining!.key).toMatch(/^held-digest-key:/);}
  }
  // Unsupported structured-clone damage is atomically quarantined, never
  // flattened to a common sentinel or posted to the server.
  for(const kind of ['date','map','cycle','quota'] as const){
   const qScope=(kind==='date'?'a':kind==='map'?'b':kind==='cycle'?'c':'d').repeat(64);
   const result=await first.evaluate(async({scope,kind})=>{
    const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery;
    const value:Record<string,unknown>={privateSynthetic:'never-send'};
    if(kind==='date'||kind==='quota')value.data=new Date('2026-01-01');
    if(kind==='map')value.data=new Map([['key','value']]);
    if(kind==='cycle')value.self=value;
    const raw=async(write:boolean)=>new Promise<unknown[]>((resolve,reject)=>{
     const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('pending','readwrite'),store=tx.objectStore('pending');let rows:unknown[]=[];
      if(write)store.put(value,scope);else{const req=store.getAll();req.onsuccess=()=>{rows=req.result;};}
      tx.oncomplete=()=>{db.close();resolve(rows);};tx.onabort=()=>{db.close();reject(Error('raw_failed'));};};
    });
    await raw(true);const original=IDBObjectStore.prototype.put;let failed=false,abortWitness=false,failureCode='';
    try{
     if(kind==='quota')IDBObjectStore.prototype.put=function(...args:Parameters<typeof original>){const request=original.apply(this,args);if(args[1]==='recovery:'+scope){const tx=this.transaction;request.addEventListener('success',()=>{abortWitness=true;tx.abort();});}return request;};
     await api.claimEvaluationRecovery(scope,'quarantine-recovery');
    }catch(error){failed=true;failureCode=error instanceof api.EvaluationJournalError?error.code:'unexpected_error';}finally{IDBObjectStore.prototype.put=original;}
    if(kind==='quota'){
     const rows=await raw(false);return {failed,abortWitness,failureCode,originalRetained:rows.some(v=>!!v&&typeof v==='object'&&(v as typeof value).data instanceof Date),markers:rows.filter(v=>(v as {scope?:string})?.scope===scope).length};
    }
    const handle=(await api.claimEvaluationRecovery(scope,'peer-recovery-key'))!;
    const ack=api.confirmEvaluationFence(true,{status:'fenced',key:handle.key,revision:1,recordId:crypto.randomUUID()},handle.key,scope,handle.snapshotDigest);
    const status=await api.acknowledgeEvaluationRecovery(scope,handle,ack);
    const rows=await raw(false),quarantined=rows.filter(v=>(v as {scope?:string})?.scope===scope) as {value:typeof value}[];
    const preserved=quarantined[0]?.value;
    return {failed,status,handleKeys:Object.keys(handle).sort(),count:quarantined.length,preserved:kind==='date'?preserved?.data instanceof Date:kind==='map'?preserved?.data instanceof Map:preserved?.self===preserved,pending:await api.pendingEvaluation(scope)};
   },{scope:qScope,kind});
   expect(result).toEqual(kind==='quota'?{failed:true,abortWitness:true,failureCode:'evaluation_journal_unavailable',originalRetained:true,markers:0}:{failed:false,status:{status:'cleared'},handleKeys:['action','key','snapshotDigest'],count:1,preserved:true,pending:null});
  }
  // Second damage cycle: peer claims share one quarantine identity. A newer
  // valid pending record survives the old acknowledgement; a third damage
  // cycle hits the retention cap without modifying its original or old rows.
  const boundedScope='a'.repeat(64);
  const inspectBounded=async(mode:'damage'|'valid'|'read')=>first.evaluate(({scope,mode})=>new Promise<{count:number;marker:boolean;date:boolean;key?:string}>((resolve,reject)=>{
   const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onsuccess=()=>{
    const db=r.result,tx=db.transaction('pending','readwrite'),store=tx.objectStore('pending');
    if(mode==='damage')store.put({data:new Date('2026-02-01')},scope);
    if(mode==='valid')store.put({action:'evaluate',key:'newer-after-quarantine',asOf:'2026-10-05T00:00:00Z',revision:7,marketIds:[]},scope);
    const prefix='quarantine:'+scope+':',count=store.count(IDBKeyRange.bound(prefix,prefix+'\uffff')),marker=store.get('recovery:'+scope),pending=store.get(scope);
    tx.oncomplete=()=>{db.close();resolve({count:count.result,marker:marker.result!==undefined,date:pending.result?.data instanceof Date,key:pending.result?.key});};tx.onabort=()=>{db.close();reject(Error('inspect_failed'));};
   };
  }),{scope:boundedScope,mode});
  await inspectBounded('damage');
  const peers=await Promise.all([first,peer].map((page,n)=>page.evaluate(({scope,n})=>(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery.claimEvaluationRecovery(scope,'bounded-peer-'+n),{scope:boundedScope,n})));
  expect(peers[0]).not.toBeNull();expect(peers[1]).toEqual(peers[0]);expect((await inspectBounded('read')).count).toBe(2);
  await inspectBounded('valid');
  expect(await first.evaluate(async({scope,handle})=>{const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery;return api.acknowledgeEvaluationRecovery(scope,handle,api.confirmEvaluationFence(true,{status:'fenced',key:handle.key,revision:1,recordId:crypto.randomUUID()},handle.key,scope,handle.snapshotDigest));},{scope:boundedScope,handle:peers[0]!})).toEqual({status:'record-changed'});
  expect(await inspectBounded('read')).toEqual({count:2,marker:false,date:false,key:'newer-after-quarantine'});
  await inspectBounded('damage');
  expect(await peer.evaluate(async scope=>{const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery;try{await api.claimEvaluationRecovery(scope,'third-bounded-key');return 'unexpected_success';}catch(error){return error instanceof api.EvaluationJournalError?error.code:'unexpected_error';}},boundedScope)).toBe('evaluation_quarantine_full');
  expect(await inspectBounded('read')).toEqual({count:2,marker:false,date:true,key:undefined});
  // Erase transactions roll back all deletions on asynchronous failure.
  expect(await first.evaluate(async scope=>{
   const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery,selection=await api.prepareEvaluationQuarantineErase(scope);
   const original=IDBObjectStore.prototype.delete;let witnessed=false,code='';
   try{IDBObjectStore.prototype.delete=function(...args:Parameters<typeof original>){const request=original.apply(this,args),tx=this.transaction;request.addEventListener('success',()=>{if(!witnessed){witnessed=true;tx.abort();}});return request;};await api.eraseEvaluationQuarantine(scope,selection);}catch(error){code=(error as Error).message;}finally{IDBObjectStore.prototype.delete=original;}
   return {witnessed,code,count:await api.evaluationQuarantineCount(scope)};
  },boundedScope)).toEqual({witnessed:true,code:'evaluation_journal_unavailable',count:2});
  await first.evaluate(async scope=>{const w=window as unknown as {journalRecovery:JournalTestApi;staleErase?:import('../../src/components/research/s4/evaluation-journal').QuarantineEraseSelection};w.staleErase=await w.journalRecovery.prepareEvaluationQuarantineErase(scope);},boundedScope);
  // Explicit quarantine erase is scope-limited, preserves current damage and
  // cannot delete evidence while a recovery marker is active.
  expect(await first.evaluate(async scope=>{const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery;const before=await api.evaluationQuarantineCount(scope),erased=await api.eraseEvaluationQuarantine(scope,await api.prepareEvaluationQuarantineErase(scope));return {before,erased,after:await api.evaluationQuarantineCount(scope)};},boundedScope)).toEqual({before:2,erased:2,after:0});
  expect((await inspectBounded('read')).date).toBe(true);
  expect(await first.evaluate(async scope=>{const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery;await api.claimEvaluationRecovery(scope,'after-explicit-erase');try{await api.eraseEvaluationQuarantine(scope,await api.prepareEvaluationQuarantineErase(scope));return 'unexpected';}catch(error){return error instanceof api.EvaluationJournalError?error.code:'wrong_error';}},boundedScope)).toBe('evaluation_recovery_pending');
  expect(await first.evaluate(async scope=>{const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery;return {current:await api.evaluationQuarantineCount(scope),other:await api.evaluationQuarantineCount('b'.repeat(64))};},boundedScope)).toEqual({current:1,other:1});
  expect(await first.evaluate(async scope=>{
   const w=window as unknown as {journalRecovery:JournalTestApi;staleErase:import('../../src/components/research/s4/evaluation-journal').QuarantineEraseSelection},api=w.journalRecovery;
   const handle=(await api.claimEvaluationRecovery(scope,'reuse-existing'))!;
   await api.acknowledgeEvaluationRecovery(scope,handle,api.confirmEvaluationFence(true,{status:'fenced',key:handle.key,revision:1,recordId:crypto.randomUUID()},handle.key,scope,handle.snapshotDigest));
   let code='';try{await api.eraseEvaluationQuarantine(scope,w.staleErase);}catch(error){code=(error as Error).message;}
   return {code,count:await api.evaluationQuarantineCount(scope)};
  },boundedScope)).toEqual({code:'evaluation_quarantine_changed',count:1});
  expect(await first.evaluate(async()=>{const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery;try{await api.prepareEvaluationQuarantineErase('invalid-scope');return false;}catch{return true;}})).toBe(true);
  const diagnosticScope='9'.repeat(64);
  expect(await first.evaluate(async scope=>{
   const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery;
   const access=async(key:string,value?:unknown)=>new Promise<unknown>((resolve,reject)=>{const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('pending','readwrite'),store=tx.objectStore('pending');if(value!==undefined)store.put(value,key);const read=store.get(key);tx.oncomplete=()=>{db.close();resolve(read.result);};tx.onabort=()=>{db.close();reject(Error('diagnostic_failed'));};};});
   const proposed={action:'evaluate' as const,key:'diagnostic-key',asOf:'2026-10-05T00:00:00Z',revision:0,marketIds:[]};
   await access(scope,{bad:'synthetic'});
   let claimCode='';try{await api.claimEvaluation(scope,proposed);}catch(error){claimCode=error instanceof api.EvaluationJournalError?error.code:'unexpected';}
   const handle=(await api.claimEvaluationRecovery(scope,'diagnostic-recovery'))!;
   const ack=()=>api.confirmEvaluationFence(true,{status:'fenced',key:handle.key,revision:1,recordId:crypto.randomUUID()},handle.key,scope,handle.snapshotDigest);
   await access(scope,{data:new Date('2026-03-01')});
   const changed=await api.acknowledgeEvaluationRecovery(scope,handle,ack());
   const preserved=(await access(scope) as {data:unknown}).data instanceof Date;
   const reclaimed=await api.claimEvaluationRecovery(scope,'new-damage-recovery');
   const invalid={action:'recover-evaluation',key:'x',nonce:'bad',snapshot:'{never-send'};
   await access('recovery:'+scope,invalid);
   const codes=[];let leaked=false;
   for(const run of [()=>api.pendingEvaluation(scope),()=>api.claimEvaluation(scope,proposed),()=>api.claimEvaluationRecovery(scope,'another-key'),()=>api.acknowledgeEvaluationRecovery(scope,handle,ack()),()=>api.prepareEvaluationQuarantineErase(scope)]){
    try{await run();codes.push('unexpected_success');}catch(error){codes.push(error instanceof api.EvaluationJournalError?error.code:'unexpected_error');leaked ||= JSON.stringify({...error as object,message:(error as Error).message}).includes('never-send');}
   }
   return {claimCode,changed,preserved,reclaimed:reclaimed?.key.startsWith('new-damage-recovery:'),codes,leaked,markerUnchanged:JSON.stringify(await access('recovery:'+scope))===JSON.stringify(invalid)};
  },diagnosticScope)).toEqual({claimCode:'evaluation_journal_damaged',changed:{status:'record-changed'},preserved:true,reclaimed:true,codes:Array(5).fill('evaluation_recovery_damaged'),leaked:false,markerUnchanged:true});
  // A committed transaction whose completion notification arrives after our
  // deadline has an unknown outcome. Reload/readback must recover the SAME key.
  const lateScope='e'.repeat(64);
  expect(await first.evaluate(async scope=>{
   const api=(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery;
   const original=IDBDatabase.prototype.transaction;
   let delayed=false,dispatches=0,committedAt=0,deliveredAt=0;
   const startedAt=performance.now();let deliver!:()=>void;const delivered=new Promise<void>(resolve=>{deliver=resolve;});
   IDBDatabase.prototype.transaction=function(...args:Parameters<typeof original>){
    const tx=original.apply(this,args);
    if(!delayed){delayed=true;tx.addEventListener('complete',event=>{
     event.stopImmediatePropagation();committedAt=performance.now();const callback=tx.oncomplete;
     setTimeout(()=>{callback?.call(tx,event);deliveredAt=performance.now();deliver();},5500);
    });}
    return tx;
   };
   try{
    await api.claimEvaluation(scope,{action:'evaluate',key:'late-durable-key',asOf:'2026-10-05T00:00:00Z',revision:0,marketIds:[]});
    dispatches++;return {rejected:false,dispatches};
   }catch(error){
    const rejectedAt=performance.now();
    await Promise.race([delivered,new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('late_callback_missing')),3000))]);
    return {rejected:true,dispatches,reason:(error as Error).message,deadlineObserved:rejectedAt-startedAt>=4900,committedBeforeDeadline:committedAt>startedAt&&committedAt<rejectedAt,deliveredAfterDeadline:deliveredAt>rejectedAt};
   }
   finally{IDBDatabase.prototype.transaction=original;}
  },lateScope)).toEqual({rejected:true,dispatches:0,reason:'evaluation_journal_unavailable',deadlineObserved:true,committedBeforeDeadline:true,deliveredAfterDeadline:true});
  await first.reload();await first.addScriptTag({content:bundle});
  const retained=await first.evaluate(scope=>(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery.pendingEvaluation(scope),lateScope);
  expect(retained?.key).toBe('late-durable-key');
  expect(await peer.evaluate(scope=>(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery.claimEvaluation(scope,{action:'evaluate',key:'must-not-replace',asOf:'2026-10-05T00:00:00Z',revision:0,marketIds:[]}),lateScope)).toEqual(retained);
  // Crypto failure occurs after durable capture, but cannot delete either row.
  expect(await first.evaluate(async scope=>{const w=window as unknown as {journalRecovery:JournalTestApi};const api=w.journalRecovery,handle=(await api.claimEvaluationRecovery(scope,'unused-key'))!,original=crypto.subtle.digest;
   const ack=api.confirmEvaluationFence(true,{status:'fenced',key:handle.key,revision:1,recordId:crypto.randomUUID()},handle.key,scope,handle.snapshotDigest);
   try{crypto.subtle.digest=async()=>{throw Error('synthetic_crypto_failure');};await api.acknowledgeEvaluationRecovery(scope,handle,ack);return false;}catch{return true;}finally{crypto.subtle.digest=original;}
  },scope)).toBe(true);
  expect((await peer.evaluate(scope=>(window as unknown as {journalRecovery:JournalTestApi}).journalRecovery.claimEvaluationRecovery(scope,'unused-key'),scope))!.key).toMatch(/^held-digest-key:/);
 }finally{await context.close();}
}
