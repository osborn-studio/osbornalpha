import {DatabaseSync} from 'node:sqlite';
import {createHash, randomUUID} from 'node:crypto';
import {chmodSync, existsSync, mkdirSync, readFileSync, rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {labelIncident} from './friction-label.mjs';
import {runAutoCycle,holdoutTextHash,usedHoldoutTexts} from './auto-cycle.mjs';
import {acceptanceFamilies,freshAcceptance} from './auto-acceptance.mjs';
import {connectorHasPriority} from './offline-queue.mjs';

const here=fileURLToPath(new URL('.',import.meta.url));
const day=86400000;
const load=path=>JSON.parse(readFileSync(path,'utf8'));
const digest=text=>createHash('sha256').update(text).digest('hex');
const clockNow=()=>Date.now();
const terminal=new Set(['published','eligible','rejected','no_challenger']);
const workflowTopics=new Set(Object.keys(acceptanceFamilies));
export const defaultSettings=fileURLToPath(new URL('../../../build/feishu-optimization/auto/settings.json',import.meta.url));

function validateSettings(c){
  const url=new URL(c.baseUrl);
  if(!['http:','https:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||
    url.username||url.password||url.search||url.hash||url.pathname.replace(/\/$/,'')!=='/v1'||
    typeof c.model!=='string'||!c.model.trim()||!Number.isInteger(c.timeoutMs)||c.timeoutMs<100||c.timeoutMs>60000||
    ![c.directory,c.monitorPath].every(p=>typeof p==='string'&&p.startsWith('/'))||typeof c.apply!=='boolean'){
    throw Error('自动优化器配置无效。');
  }
}
function openLedger(dir){
  mkdirSync(dir,{recursive:true,mode:0o700});
  const file=join(dir,'worker.sqlite'), db=new DatabaseSync(file);
  chmodSync(file,0o600);
  db.exec(`PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,created INTEGER NOT NULL,component TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending',reason TEXT,family TEXT,samples TEXT,attempts INTEGER DEFAULT 0,due INTEGER DEFAULT 0,run_id TEXT);
    CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,started INTEGER NOT NULL,ended INTEGER,component TEXT NOT NULL,family TEXT NOT NULL,task TEXT,status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS health(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  const hasTask=()=>db.prepare('PRAGMA table_info(runs)').all().some(column=>column.name==='task');
  if(!hasTask())atomic(db,()=>{if(!hasTask())db.exec('ALTER TABLE runs ADD COLUMN task TEXT');});
  return db;
}
function heartbeat(db,key,value){db.prepare('INSERT OR REPLACE INTO health(key,value) VALUES(?,?)').run(key,String(value));}
function atomic(db,fn){
  db.exec('BEGIN IMMEDIATE');
  try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}
}
function backoff(attempt){return Math.min(6*3600000,300000*2**Math.min(attempt-1,7));}
function retryItem(db,id,now,attempt,reason){
  db.prepare('UPDATE items SET attempts=?,due=?,state=CASE WHEN samples IS NULL THEN \'pending\' ELSE \'eligible\' END,reason=CASE WHEN samples IS NULL THEN ? ELSE reason END,run_id=NULL WHERE id=?')
    .run(attempt,now+backoff(attempt),reason,id);
}
function finish(db,id,outcome,now){
  atomic(db,()=>{
    db.prepare('UPDATE runs SET status=?,ended=? WHERE id=?').run(outcome,now,id);
    db.prepare("UPDATE items SET state='finished',reason=?,run_id=? WHERE run_id=?").run(outcome,id,id);
  });
}
function retryRun(db,id,now){
  atomic(db,()=>{
    for(const item of db.prepare('SELECT id,attempts FROM items WHERE run_id=?').all(id))retryItem(db,item.id,now,item.attempts+1,'offline_retry');
    db.prepare("UPDATE runs SET status='retry',ended=? WHERE id=?").run(now,id);
  });
}
function recover(db,config,now,activePath){
  for(const r of db.prepare("SELECT id FROM runs WHERE status='running'").all()){
    const path=join(config.directory,'runs',r.id);
    let status;
    const readArtifact=name=>{
      try{return load(join(path,name));}catch{return undefined;}
    };
    status=readArtifact('decision.json')?.status;
    if(!terminal.has(status)&&config.apply){
      const trial=readArtifact('trial.json'),baseline=readArtifact('baseline.json');
      let active;
      try{active=load(activePath);}catch{/* Retry an incomplete run when the live version is unavailable. */}
      if(typeof trial?.extraction==='string'&&typeof trial?.chat==='string'&&active&&baseline&&
          trial.extraction===active.extraction&&trial.chat===active.chat&&
          (trial.extraction!==baseline.extraction||trial.chat!==baseline.chat))status='published';
    }
    if(terminal.has(status))finish(db,r.id,status,now); else retryRun(db,r.id,now);
  }
}
function purge(db,dir,now){
  db.prepare("DELETE FROM items WHERE created<? AND state<>'running'").run(now-14*day);
  const runsDir=join(dir,'runs');
  if(!existsSync(runsDir))return;
  const keep=db.prepare('SELECT id FROM runs ORDER BY started DESC LIMIT 16').all().map(v=>v.id);
  for(const r of db.prepare("SELECT id FROM runs WHERE status<>'running' AND ended<?").all(now-14*day)){
    if(keep.includes(r.id)||!/^run-[a-f0-9-]{36}$/.test(r.id))continue;
    rmSync(join(runsDir,r.id),{recursive:true,force:true});
    db.prepare('DELETE FROM runs WHERE id=?').run(r.id);
  }
}
function openSource(path){
  if(!existsSync(path))return;
  const db=new DatabaseSync(path,{readOnly:true});db.exec('PRAGMA busy_timeout=1500');
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='friction_incidents' AND type='table'").get()){db.close();return;}
  return db;
}
function makeDevelopment(batch,component){
  const base=component==='extraction'?load(join(here,'extraction-cases','development.json')):
    load(join(here,'cases.json')).filter(r=>r.kind==='chat'&&r.split!=='holdout');
  // A repeated question can have opposite answers with and without a prior message.
  // Keep those two inputs distinct and reserve validation wording across all training groups.
  const validation=new Set(base.filter(row=>row.split==='validation').map(row=>holdoutTextHash(row.input.text)));
  const inputKey=input=>JSON.stringify(input);
  const learned=new Set(), cases=[];
  for(const event of batch){
    const group='feedback-'+digest(event.id).slice(0,20);
    for(const [i,row] of JSON.parse(event.samples).entries()){
      if(row.kind!==component||row.split!=='train'||typeof row.input?.text!=='string'||!row.expect)throw Error('错例标签无效。');
      const key=inputKey(row.input);
      if(learned.has(key)||validation.has(holdoutTextHash(row.input.text)))continue;
      learned.add(key);
      cases.push({...row,id:group+'-'+i,group});
    }
  }
  if(!cases.length)return null;
  return [...cases,...base.filter(row=>row.split!=='train'||!learned.has(inputKey(row.input)))];
}
function status(db) {
  const health=Object.fromEntries(db.prepare('SELECT key,value FROM health').all().map(row=>[row.key,row.value]));
  for(const key of ['lastChecked','lastCycle']){
    if(health[key])health[key+'At']=new Date(Number(health[key])).toISOString();
  }
  return {
    health,
    counts:Object.fromEntries(db.prepare('SELECT state,count(*) n FROM items GROUP BY state').all().map(row=>[row.state,row.n])),
    diagnostics:db.prepare("SELECT reason,count(*) n FROM items WHERE state IN ('diagnostic','insufficient') GROUP BY reason").all(),
    lastRuns:db.prepare('SELECT id,started,ended,component,family,task,status FROM runs ORDER BY started DESC LIMIT 5').all(),
  };
}
export function workerStatus(config){
  validateSettings(config);const db=openLedger(config.directory);
  try{return status(db);}finally{db.close();}
}

// launchd runs at most one job. The database lock also serializes manual runs and recovers after process death.
export async function workerTick(config,{now=clockNow,label=labelIncident,cycle=runAutoCycle,queueBusy=connectorHasPriority,cycleOptions={},signal}={}){
  validateSettings(config);
  const dir=config.directory, activePath=cycleOptions.activePath??resolve(here,'../active-prompt.json');
  const db=openLedger(dir),lock=new DatabaseSync(join(dir,'worker-lock.sqlite'));
  let source,priorityWatch;
  try{
    try{lock.exec('BEGIN EXCLUSIVE');}catch(err){if(err.errcode===5||err.errcode===6)return {state:'already_running'};throw err;}
    const start=now();
    heartbeat(db,'lastChecked',start);
    recover(db,config,start,activePath);purge(db,dir,start);
    source=openSource(config.monitorPath);
    if(!source){heartbeat(db,'state','waiting_for_connector');return {state:'waiting_for_connector'};}
    const incoming=source.prepare('SELECT id,component,created_at FROM friction_incidents WHERE created_at>=? ORDER BY created_at,id').all(start-14*day);
    const admit=db.prepare('INSERT INTO items(id,created,component) VALUES(?,?,?) ON CONFLICT DO NOTHING');
    atomic(db,()=>{for(const row of incoming)if(workflowTopics.has(row.component))admit.run(row.id,row.created_at,row.component);});
    const pause=()=>config.liveQueuePath && queueBusy(config.liveQueuePath,now(),60000);
    if(pause()){heartbeat(db,'state','deferring_to_group');return {state:'deferring_to_group'};}
    const priority=new AbortController();
    const offlineSignal=signal ? AbortSignal.any([signal,priority.signal]) : priority.signal;
    if(config.liveQueuePath){
      // Stop an in-flight reflection or evaluation as soon as foreground work arrives.
      // Disconnecting the loopback stream lets the model serve the member immediately.
      priorityWatch=setInterval(()=>{
        try { if(pause())priority.abort(); } catch { priority.abort(); }
      },200);
      priorityWatch.unref();
    }
    const offlineFetch=(url,options={})=>fetch(url,{...options,signal:options.signal
      ? AbortSignal.any([offlineSignal,options.signal]) : offlineSignal});
    const waiting=db.prepare("SELECT * FROM items WHERE state='pending' AND due<=? ORDER BY created,id LIMIT 12").all(start);
    for(const item of waiting){
      if(offlineSignal.aborted||pause())break;
      const incident=source.prepare('SELECT signal,episode_json FROM friction_incidents WHERE id=?').get(item.id);
      if(!incident){db.prepare("UPDATE items SET state='expired',reason='source_expired' WHERE id=?").run(item.id);continue;}
      try{
        const result=await label({id:item.id,component:item.component,signal:incident.signal,episode:JSON.parse(incident.episode_json)},{
          fetchImpl:offlineFetch,env:{FEISHU_LLM_BASE_URL:config.baseUrl,FEISHU_LLM_MODEL:config.model,FEISHU_LLM_TIMEOUT_MS:String(config.timeoutMs)}});
        if(!['eligible','diagnostic','insufficient'].includes(result.status)||!workflowTopics.has(result.component))throw Error('无效分类');
        if(result.status==='eligible'&&(!acceptanceFamilies[result.component].includes(result.family)||
          !Array.isArray(result.examples)||!result.examples.length||result.examples.length>12))throw Error('无效训练标签');
        const reason=/^[a-z0-9_-]{1,80}$/i.test(result.reason??'')?result.reason:result.status;
        db.prepare('UPDATE items SET component=?,state=?,reason=?,family=?,samples=?,due=0,attempts=0 WHERE id=?').run(
          result.component,result.status,reason,result.family??null,result.status==='eligible'?JSON.stringify(result.examples):null,item.id);
      }catch{if(offlineSignal.aborted)break;retryItem(db,item.id,now(),item.attempts+1,'label_retry');}
    }
    if(offlineSignal.aborted||pause()){heartbeat(db,'state','deferring_to_group');return {state:'deferring_to_group'};}
    const dueItems=db.prepare("SELECT * FROM items WHERE state='eligible' AND due<=? ORDER BY created,id").all(start);
    const recent=db.prepare(`SELECT 1 FROM runs WHERE component=? AND (task=? OR (task IS NULL AND family=?))
      AND status IN ('published','rejected','eligible','no_challenger') AND ended>? LIMIT 1`);
    const since=start-(config.cooldownMs??6*3600000);
    const item=dueItems.find(row=>!recent.get(row.component,row.reason,row.family,since));
    if(!item){
      const state=dueItems.length?'cooldown':'watching';
      heartbeat(db,'state',state);
      return {state,examined:waiting.length};
    }
    const batch=db.prepare("SELECT * FROM items WHERE state='eligible' AND component=? AND family=? AND reason=? AND due<=? ORDER BY created,id LIMIT 6").all(item.component,item.family,item.reason,start);
    const registryPath=join(dir,'frozen.sqlite'), runId='run-'+randomUUID(),runDirectory=join(dir,'runs',runId);
    const development=makeDevelopment(batch,item.component);
    if(!development){
      atomic(db,()=>{
        const skip=db.prepare("UPDATE items SET state='insufficient',reason='no_independent_training_case' WHERE id=?");
        for(const event of batch)skip.run(event.id);
      });
      heartbeat(db,'state','watching');
      return {state:'watching',examined:waiting.length};
    }
    let sealed;
    try{
      sealed=freshAcceptance(item.component,item.family,{
        task:item.reason,used:usedHoldoutTexts(registryPath),hashText:holdoutTextHash,now:start,
      });
    }catch{
      atomic(db,()=>{
        for(const event of batch)retryItem(db,event.id,now(),event.attempts+1,'probe_retry');
      });
      heartbeat(db,'state','retry_scheduled');
      return {state:'retry_scheduled',reason:'fresh_cases'};
    }
    atomic(db,()=>{
      db.prepare("INSERT INTO runs(id,started,component,family,task,status) VALUES(?,?,?,?,?,'running')").run(runId,start,item.component,item.family,item.reason);
      for(const x of batch)db.prepare("UPDATE items SET state='running',run_id=? WHERE id=?").run(runId,x.id);
      heartbeat(db,'state','optimizing');
    });
    try{
      const outcome=await cycle({component:item.component,development,...sealed,runDirectory,model:config.model,
        baseUrl:config.baseUrl,timeoutMs:config.timeoutMs,budget:config.budget??72,apply:config.apply},
        {...cycleOptions,registryPath,liveQueuePath:config.liveQueuePath,signal:offlineSignal});
      if(!terminal.has(outcome.status))throw Error('无效实验状态');
      finish(db,runId,outcome.status,now());
      heartbeat(db,'state','watching');heartbeat(db,'lastCycle',now());
      return {state:outcome.status,runId,component:item.component,family:item.family,incidentCount:batch.length};
    }catch(err){
      if(priority.signal.aborted){
        atomic(db,()=>{
          db.prepare("UPDATE items SET state='eligible',due=0,run_id=NULL WHERE run_id=?").run(runId);
          db.prepare("UPDATE runs SET status='deferred',ended=? WHERE id=?").run(now(),runId);
          heartbeat(db,'state','deferring_to_group');
        });
        return {state:'deferring_to_group',runId};
      }
      retryRun(db,runId,now());heartbeat(db,'state','retry_scheduled');
      return {state:'retry_scheduled',runId,reason:err.code==='HOLDOUT_REUSED'?'fresh_cases':'offline_job'};
    }
  } finally {clearInterval(priorityWatch);source?.close();lock.close();db.close();}
}

async function main(){
  const {values}=parseArgs({options:{settings:{type:'string',default:defaultSettings},status:{type:'boolean'}}});
  const config=load(values.settings);
  if(values.status){console.log(JSON.stringify(workerStatus(config),null,2));return;}
  const controller=new AbortController();const stop=()=>controller.abort();
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  try{
    const outcome=await workerTick(config,{signal:controller.signal});
    if(!['watching','cooldown','deferring_to_group','already_running','waiting_for_connector'].includes(outcome.state))console.log(JSON.stringify(outcome));
  }finally{process.off('SIGTERM',stop);process.off('SIGINT',stop);}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)main().catch(()=>{
  console.error('自动优化巡检暂未完成，下次将重试。');process.exitCode=1;
});
