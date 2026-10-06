import {recoverySnapshot} from './evaluation-recovery-snapshot';
/** Browser-local intent journal: normal records contain identifiers only.
 * Unsupported damaged values may contain arbitrary local data; recovery retains
 * those values in local quarantine. They never enter a handle or HTTP request.
 * A pending intent is not permission to execute; the server reauthorizes every retry.
 */
export type EvaluationAttempt={action:'evaluate';asOf:string;key:string;revision:number;marketIds:string[]};
const dbName='alpha-evaluation-intents-v1',table='pending';
function valid(value:unknown):value is EvaluationAttempt{
 if(!value||typeof value!=='object')return false;
 const v=value as EvaluationAttempt;
 return Object.keys(v).sort().join(',')==='action,asOf,key,marketIds,revision'&&v.action==='evaluate'&&typeof v.asOf==='string'&&v.asOf.length<=40&&Number.isFinite(Date.parse(v.asOf))&&typeof v.key==='string'&&/^[A-Za-z0-9:_-]{8,128}$/.test(v.key)&&Number.isSafeInteger(v.revision)&&v.revision>=0&&Array.isArray(v.marketIds)&&v.marketIds.length<=2&&v.marketIds.every(id=>typeof id==='string'&&id.length<=128);
}
export type EvaluationJournalErrorCode='evaluation_journal_unavailable'|'evaluation_journal_damaged'|'evaluation_recovery_pending'|'evaluation_recovery_damaged'|'evaluation_quarantine_full'|'evaluation_quarantine_changed';
export class EvaluationJournalError extends Error{
 constructor(readonly code:EvaluationJournalErrorCode){super(code);this.name='EvaluationJournalError';}
}
const abortReasons=new WeakMap<IDBTransaction,EvaluationJournalErrorCode>();
function abortJournal(store:IDBObjectStore,code:EvaluationJournalErrorCode){abortReasons.set(store.transaction,code);store.transaction.abort();}
function unavailable(){return new EvaluationJournalError('evaluation_journal_unavailable');}
async function transact<T>(id:string,work:(store:IDBObjectStore,done:(value:T)=>void)=>void,allowRecovery=false):Promise<T>{
 if(!/^[0-9a-f]{64}$/.test(id))throw unavailable();
 return new Promise((resolve,reject)=>{
  let settled=false,db:IDBDatabase|undefined,tx:IDBTransaction|undefined;
  const fail=()=>{if(settled)return;settled=true;clearTimeout(timeout);try{tx?.abort();}catch{}db?.close();reject(new EvaluationJournalError(tx?abortReasons.get(tx)??'evaluation_journal_unavailable':'evaluation_journal_unavailable'));};
  // A blocked upgrade or stalled browser must not leave the UI busy forever.
  // A late transaction may have persisted an intent; never dispatch on timeout.
  const timeout=setTimeout(fail,5000);
  let request:IDBOpenDBRequest;try{request=indexedDB.open(dbName,1);}catch{fail();return;}
  request.onupgradeneeded=()=>{if(settled){request.transaction?.abort();return;}request.result.createObjectStore(table);};
  request.onerror=fail;request.onblocked=fail;
  request.onsuccess=()=>{
   db=request.result;if(settled){db.close();return;}db.onversionchange=()=>db?.close();
   try{
    tx=db.transaction(table,'readwrite',{durability:'strict'});let result:T;
    tx.oncomplete=()=>{db?.close();if(settled)return;settled=true;clearTimeout(timeout);resolve(result);};tx.onabort=tx.onerror=fail;
    const store=tx.objectStore(table),run=()=>{try{work(store,value=>{result=value;});}catch{fail();}};
    if(allowRecovery)run();else{const marker=store.get('recovery:'+id);marker.onsuccess=()=>{if(marker.result!==undefined){abortJournal(store,validRecovery(marker.result)?'evaluation_recovery_pending':'evaluation_recovery_damaged');return;}run();};}
   }catch{fail();}
  };
 });
}
export function pendingEvaluation(id:string):Promise<EvaluationAttempt|null>{return transact(id,(store,done)=>{const read=store.get(id);read.onsuccess=()=>{if(read.result!==undefined&&!valid(read.result)){abortJournal(store,'evaluation_journal_damaged');return;}done(read.result??null);};});}
/** Read/write transaction picks one durable key across tabs before any dispatch. */
export function claimEvaluation(id:string,proposed:EvaluationAttempt):Promise<EvaluationAttempt>{
 if(!valid(proposed))return Promise.reject(unavailable());
 return transact(id,(store,done)=>{const read=store.get(id);read.onsuccess=()=>{if(read.result!==undefined){if(!valid(read.result)){abortJournal(store,'evaluation_journal_damaged');return;}done(read.result);}else{store.put(proposed,id);done(proposed);}};});
}
/** A stale acknowledgement cannot remove a newer intent. */
export function acknowledgeEvaluation(id:string,key:string):Promise<void>{return transact(id,(store,done)=>{const read=store.get(id);read.onsuccess=()=>{if(read.result!==undefined&&!valid(read.result)){abortJournal(store,'evaluation_journal_damaged');return;}if(read.result?.key===key)store.delete(id);done();};});}

/** Resume never recreates an intent already acknowledged in another tab. */
export function resumeEvaluation(id:string,key:string):Promise<EvaluationAttempt|null>{return transact(id,(store,done)=>{const read=store.get(id);read.onsuccess=()=>{if(read.result!==undefined&&!valid(read.result)){abortJournal(store,'evaluation_journal_damaged');return;}done(read.result?.key===key?read.result:null);};});}

type RecoveryMarker={action:'recover-evaluation';key:string;nonce:string;snapshot:string};
export type EvaluationRecovery={action:'recover-evaluation';key:string;snapshotDigest:string};
async function snapshotDigest(snapshot:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot))),v=>v.toString(16).padStart(2,'0')).join('');}
function validHandle(v:EvaluationRecovery){return !!v&&Object.keys(v).sort().join(',')==='action,key,snapshotDigest'&&v.action==='recover-evaluation'&&typeof v.key==='string'&&/^[A-Za-z0-9:_-]{8,100}$/.test(v.key)&&typeof v.snapshotDigest==='string'&&/^[0-9a-f]{64}$/.test(v.snapshotDigest);}
function validRecovery(value:unknown):value is RecoveryMarker{
 try{const v=value as RecoveryMarker;return !!v&&Object.keys(v).sort().join(',')==='action,key,nonce,snapshot'&&v.action==='recover-evaluation'&&typeof v.key==='string'&&/^[A-Za-z0-9:_-]{8,100}$/.test(v.key)&&typeof v.nonce==='string'&&/^[0-9a-f-]{36}$/.test(v.nonce)&&typeof v.snapshot==='string'&&v.snapshot.length<=8192&&recoverySnapshot(JSON.parse(v.snapshot))===v.snapshot&&!valid(JSON.parse(v.snapshot));}catch{return false;}
}
/** The supplied key is a diagnostic prefix; each new marker appends its own
 * random nonce, so server idempotency never reuses an older generation.
 * Same-store atomic claim: competing tabs retain the first recovery key. No HTTP
 * is allowed until this strict-durability transaction completes successfully. */
export async function claimEvaluationRecovery(id:string,key:string):Promise<EvaluationRecovery|null>{
 if(typeof key!=='string'||!/^[A-Za-z0-9:_-]{8,100}$/.test(key))return Promise.reject(unavailable());
 const marker=await transact<RecoveryMarker|null>(id,(store,done)=>{
  const marker=store.get('recovery:'+id);marker.onsuccess=()=>{
   if(marker.result!==undefined){if(!validRecovery(marker.result)){abortJournal(store,'evaluation_recovery_damaged');return;}done(marker.result);return;}
   const read=store.get(id);read.onsuccess=()=>{
    if(read.result===undefined||valid(read.result)){done(null);return;}
    try{
     const nonce=crypto.randomUUID(),generationKey=key.slice(0,63)+':'+nonce;let snapshot:string;
     try{snapshot=recoverySnapshot(read.result);}catch{
      // Preserve arbitrary structured-clone damage locally before replacing it
      // with a unique CAS identity. All writes commit or roll back together.
      // No automatic expiry: clearing pending state must not erase evidence.
      const identity={action:'quarantined-evaluation',nonce};
      const prefix='quarantine:'+id+':';
      const count=store.count(IDBKeyRange.bound(prefix,prefix+'\uffff'));
      count.onsuccess=()=>{
       // Keep at most two complete damaged originals per scope. At capacity
       // preserve pending damage and require explicit local retention handling.
       if(count.result>=2){abortJournal(store,'evaluation_quarantine_full');return;}
       try{
        store.add({scope:id,nonce,value:read.result},prefix+nonce);
        store.put(identity,id);
        const recovery:RecoveryMarker={action:'recover-evaluation',key:generationKey,nonce,snapshot:recoverySnapshot(identity)};
        store.put(recovery,'recovery:'+id);done(recovery);
       }catch{store.transaction.abort();}
      };
      return;
     }
     const recovery:RecoveryMarker={action:'recover-evaluation',key:generationKey,nonce,snapshot};
     store.put(recovery,'recovery:'+id);done(recovery);
    }catch{store.transaction.abort();}
   };
  };
 },true);
 return marker?{action:'recover-evaluation',key:marker.key,snapshotDigest:await snapshotDigest(marker.nonce+':'+marker.snapshot)}:null;
}
const confirmedFences=new WeakSet<object>();
declare const fenceBrand:unique symbol;
export type ConfirmedEvaluationFence={readonly scope:string;readonly snapshotDigest:string;readonly key:string;readonly revision:number;readonly recordId:string;readonly [fenceBrand]:true};
/** Only this projection belongs in the HTTP body. Never post the local handle. */
export function evaluationFenceRequest(recovery:EvaluationRecovery){return {action:'fence-intents' as const,key:recovery.key};}
function confirmEvaluationFence(ok:boolean,body:unknown,key:string,scope:string,digest:string):ConfirmedEvaluationFence{
 const b=body as {status?:unknown;key?:unknown;revision?:unknown;recordId?:unknown};
 if(!/^[0-9a-f]{64}$/.test(scope)||!/^[0-9a-f]{64}$/.test(digest)||!ok||!b||b.status!=='fenced'||b.key!==key||!Number.isSafeInteger(b.revision)||(b.revision as number)<1||typeof b.recordId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(b.recordId))throw unavailable();
 const ack=Object.freeze({scope,snapshotDigest:digest,key,revision:b.revision as number,recordId:b.recordId}) as ConfirmedEvaluationFence;confirmedFences.add(ack);return ack;
}
/** Obtain confirmations only from the authenticated same-origin endpoint.
 * No caller-supplied response/parser is accepted by the production API. */
export async function requestEvaluationFence(observationId:string,scope:string,recovery:EvaluationRecovery):Promise<ConfirmedEvaluationFence>{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(observationId)||!/^[0-9a-f]{64}$/.test(scope)||!validHandle(recovery))throw unavailable();
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(`/api/research/s6/observations/${observationId}`,{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(evaluationFenceRequest(recovery)),signal:controller.signal});
  const body=await response.json();
  // The authenticated route must bind its response to the actual actor/scope
  // and observation. Caller-provided scope alone cannot authorize local release.
  if(body?.journalScope!==scope||body?.observationId!==observationId)throw unavailable();
  return confirmEvaluationFence(response.ok,body,recovery.key,scope,recovery.snapshotDigest);
 }catch{throw unavailable();}finally{clearTimeout(timer);}
}
export type RecoveryAcknowledgement={status:'cleared'|'record-changed'|'record-absent'|'superseded'|'absent'};
/** Caller must first receive a positive same-key server fence acknowledgement.
 * An old acknowledgement cannot remove a replacement marker or newer record. */
export async function acknowledgeEvaluationRecovery(id:string,recovery:EvaluationRecovery,ack:ConfirmedEvaluationFence):Promise<RecoveryAcknowledgement>{
 if(!validHandle(recovery)||!ack||!confirmedFences.has(ack)||ack.key!==recovery.key||ack.scope!==id||ack.snapshotDigest!==recovery.snapshotDigest)return Promise.reject(unavailable());
 confirmedFences.delete(ack); // Unknown outcome requires a fresh confirmation of the same server key.
 const captured=await transact<RecoveryMarker|null>(id,(store,done)=>{const read=store.get('recovery:'+id);read.onsuccess=()=>{if(read.result!==undefined&&!validRecovery(read.result)){abortJournal(store,'evaluation_recovery_damaged');return;}done(read.result??null);};},true);
 if(!captured)return {status:'absent'};
 if(captured.key!==recovery.key||await snapshotDigest(captured.nonce+':'+captured.snapshot)!==recovery.snapshotDigest)return {status:'superseded'};
 return transact(id,(store,done)=>{
  const marker=store.get('recovery:'+id);marker.onsuccess=()=>{
   if(marker.result===undefined){done({status:'absent'});return;}
   if(!validRecovery(marker.result)){abortJournal(store,'evaluation_recovery_damaged');return;}
   if(marker.result.key!==recovery.key||marker.result.nonce!==captured.nonce||marker.result.snapshot!==captured.snapshot){done({status:'superseded'});return;}
   const read=store.get(id);read.onsuccess=()=>{
    let same=false;
    try{same=read.result!==undefined&&recoverySnapshot(read.result)===captured.snapshot;}catch{
     // Captured snapshots are representable. Unsupported current data is a
     // different record: preserve it, release only this confirmed old marker.
    }
    try{if(same)store.delete(id);store.delete('recovery:'+id);done({status:same?'cleared':read.result===undefined?'record-absent':'record-changed'});
    }catch{store.transaction.abort();}
   };
  };
 },true);
}

/** Count only; original quarantine contents never leave this module. */
export function evaluationQuarantineCount(scope:string):Promise<number>{
 return transact(scope,(store,done)=>{const prefix='quarantine:'+scope+':',read=store.count(IDBKeyRange.bound(prefix,prefix+'\uffff'));read.onsuccess=()=>done(read.result);},true);
}
/** Explicit irreversible local erase, to be called only after user confirmation.
 * The ordinary transaction precheck blocks active or damaged recovery markers.
 * Never remove pending data: a full quarantine can be freed without losing the
 * new damaged record that still requires its own server-confirmed recovery. */
export type QuarantineEraseSelection={readonly count:number};
const eraseSelections=new WeakMap<object,{scope:string;keys:IDBValidKey[]}>();
export async function prepareEvaluationQuarantineErase(scope:string):Promise<QuarantineEraseSelection>{
 const keys=await transact<IDBValidKey[]>(scope,(store,done)=>{const prefix='quarantine:'+scope+':',read=store.getAllKeys(IDBKeyRange.bound(prefix,prefix+'\uffff'));read.onsuccess=()=>done(read.result);});
 const selection=Object.freeze({count:keys.length});eraseSelections.set(selection,{scope,keys});return selection;
}
export function eraseEvaluationQuarantine(scope:string,selection:QuarantineEraseSelection):Promise<number>{
 const captured=selection&&eraseSelections.get(selection);
 if(!captured||captured.scope!==scope)return Promise.reject(unavailable());
 eraseSelections.delete(selection); // A timeout requires fresh inspection/consent.
 return transact(scope,(store,done)=>{const prefix='quarantine:'+scope+':',read=store.getAllKeys(IDBKeyRange.bound(prefix,prefix+'\uffff'));
  read.onsuccess=()=>{
   if(JSON.stringify(read.result)!==JSON.stringify(captured.keys)){abortJournal(store,'evaluation_quarantine_changed');return;}
   for(const key of captured.keys)store.delete(key);done(captured.keys.length);
  };
 });
}
