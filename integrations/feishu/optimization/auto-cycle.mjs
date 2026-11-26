import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync} from 'node:fs';
import {mkdir, open, readFile, writeFile} from 'node:fs/promises';
import {dirname, join, resolve, sep} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {validatePromptCandidate} from '../feishu-prompt.mjs';
import {checkChatRelease, checkExtractionRelease, publishPrompt} from './publish.mjs';

const scripts=fileURLToPath(new URL('.',import.meta.url));
const repo=resolve(scripts,'../../..');
const experimentRoot=join(repo,'build','feishu-optimization');
const defaultRegistry=join(experimentRoot,'auto-holdouts.sqlite');
const activeFile=resolve(scripts,'../active-prompt.json');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const save=(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});

export function holdoutTextHash(text) {
  return hash(text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]+/gu,''));
}

function reserveHoldout(rows,path,owner) {
  mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const db=new DatabaseSync(path);
  try {
    db.exec('PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS frozen (hash TEXT PRIMARY KEY, owner TEXT NOT NULL); BEGIN IMMEDIATE');
    const insert=db.prepare('INSERT INTO frozen(hash, owner) VALUES (?,?) ON CONFLICT(hash) DO NOTHING');
    for (const row of rows) {
      if (!insert.run(holdoutTextHash(row.input.text),owner).changes) {
        throw Object.assign(Error('独立验收题已经封存过，需要重新抽题。'),{code:'HOLDOUT_REUSED'});
      }
    }
    db.exec('COMMIT');
  } finally { db.close(); }
}

export function usedHoldoutTexts(path=defaultRegistry) {
  if (!existsSync(path)) return new Set();
  const db=new DatabaseSync(path,{readOnly:true});
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='frozen'").get()) return new Set();
    return new Set(db.prepare('SELECT hash FROM frozen').all().map(row=>row.hash));
  } finally { db.close(); }
}

function validateBatch(component,development,holdout,regression,targetIds) {
  if (!['extraction','chat'].includes(component) || !Array.isArray(development) || !Array.isArray(holdout) ||
      development.length>100 || holdout.length<4 || holdout.length>32) throw Error('自动实验样例数量或组件无效。');
  const groups=new Map(), texts=new Map(), ids=new Set();
  for (const [rows,allowed] of [[development,['train','validation']],[holdout,['holdout']]]) {
    for (const row of rows) {
      if (!row || !allowed.includes(row.split) || row.kind!==component || typeof row.id!=='string' || !row.id ||
          typeof row.group!=='string' || !row.group || typeof row.input?.text!=='string' ||
          !row.input.text.trim() || row.input.text.length>2400 || !row.expect || ids.has(row.id)) {
        throw Error('自动实验要求有标签、唯一编号及对话组的同组件样例。');
      }
      const key=holdoutTextHash(row.input.text);
      if ((groups.has(row.group) && groups.get(row.group)!==row.split) ||
          (texts.has(key) && (texts.get(key)!==row.split || row.split==='holdout'))) {
        throw Object.assign(Error('开发和验收对话出现分组或原文重叠。'),{code:row.split==='holdout'?'HOLDOUT_REUSED':'DATASET_OVERLAP'});
      }
      ids.add(row.id); groups.set(row.group,row.split); texts.set(key,row.split);
    }
  }
  if (!development.some(r=>r.split==='train') || !development.some(r=>r.split==='validation')) throw Error('自动优化需要训练和验证数据。');
  const known=new Set(regression.map(r=>holdoutTextHash(r.input.text)));
  const existingIds=new Set(regression.map(r=>r.id)),existingGroups=new Set(regression.map(r=>r.group));
  if (holdout.some(r=>known.has(holdoutTextHash(r.input.text)) || existingIds.has(r.id) || existingGroups.has(r.group))) {
    throw Object.assign(Error('已知回归题不能作为新验收题。'),{code:'HOLDOUT_REUSED'});
  }
  const freshIds=new Set(holdout.map(r=>r.id));
  if (!Array.isArray(targetIds) || !targetIds.length || targetIds.some(id=>!freshIds.has(id))) throw Error('缺少对应问题的独立验收题。');
}

function localSettings(model,baseUrl,timeoutMs) {
  const url=new URL(baseUrl);
  if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || !['http:','https:'].includes(url.protocol) ||
      url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/,'')!=='/v1' ||
      typeof model!=='string' || !model.trim() || model.length>200 || !Number.isInteger(timeoutMs) || timeoutMs<1 || timeoutMs>60000) {
    throw Error('自动优化要求有效的本机模型和调用时限。');
  }
  return {FEISHU_LLM_MODEL:model,FEISHU_LLM_BASE_URL:url.href,FEISHU_LLM_TIMEOUT_MS:String(timeoutMs)};
}

async function runStage(stage,{cwd,env,logPath,signal}) {
  signal.throwIfAborted();
  const log=await open(logPath,'wx',0o600);
  try {
    await new Promise((accept,reject)=>{
      const detached=process.platform!=='win32';
      const child=spawn(stage.command,stage.args,{cwd,env,detached,stdio:['ignore',log.fd,log.fd]});
      // Only the disposable offline process group is killed; this also stops the Python GEPA evaluator's Node worker.
      const stop=()=>{
        if (!child.pid) return;
        try { process.kill(detached?-child.pid:child.pid,'SIGKILL'); }
        catch (error) { if(error.code!=='ESRCH') throw error; }
      };
      signal.addEventListener('abort',stop,{once:true});
      process.once('exit',stop);
      child.once('error',reject);
      child.once('close',code=>{
        signal.removeEventListener('abort',stop);
        process.removeListener('exit',stop);
        if (signal.aborted) reject(signal.reason);
        else if (code!==0) reject(Error('离线阶段 '+stage.name+' 失败，见本轮日志。'));
        else accept();
      });
      if (signal.aborted) stop();
    });
  } finally { await log.close(); }
}

function checkTargets(report,targetIds) {
  const targets=new Set(targetIds);
  const rows=report.rows.filter(r=>targets.has(r.id));
  return rows.length===targets.size*report.repeat &&
    rows.reduce((sum,r)=>sum+r.candidate.score-r.baseline.score,0)>1e-8;
}

function unattendedFailures(comparison) {
  const reasons=[];
  if (comparison.regressedCases.length) reasons.push('存在按样例配对后退化的回答。');
  if (comparison.baseline.all.errors || comparison.candidate.all.errors) reasons.push('对照或候选有模型调用失败，无法自动比较。');
  return reasons;
}

// Inputs are already synthetic/trusted labels. No group history, sender ID or Feishu credential is accepted here.
export async function runAutoCycle({component,development,holdout,businessFixtures,targetIds=holdout?.map(r=>r.id),
                                    runDirectory,model,baseUrl='http://127.0.0.1:11434/v1',timeoutMs=35000,
                                    budget=72,apply=false},options={}) {
  const env=localSettings(model,baseUrl,timeoutMs);
  if (options.liveQueuePath) env.FEISHU_OPT_QUEUE_DB=resolve(options.liveQueuePath);
  const dir=resolve(runDirectory);
  const activePath=options.activePath??activeFile;
  const historicalPath=component==='extraction'?join(scripts,'extraction-cases','acceptance.json'):join(scripts,'chat-acceptance.json');
  const historicalFixtures=join(scripts,'extraction-cases','business-fixtures.json');
  const history=await read(historicalPath);
  validateBatch(component,development,holdout,history,targetIds);
  if (!Number.isInteger(budget) || budget<1 || budget>200) throw Error('自动搜索预算无效。');
  const minibatch=Math.min(3,development.filter(r=>r.split==='train').length);
  if (budget<2*(development.filter(r=>r.split==='validation').length+minibatch)) throw Error('预算不足以运行一轮 GEPA。');
  if (component==='extraction') {
    if (!businessFixtures || !Array.isArray(businessFixtures.cases) || businessFixtures.cases.length!==holdout.length) throw Error('独立验收缺少完整业务预期。');
    const hashes=new Map(holdout.map(r=>[r.id,hash(r)]));
    for (const f of businessFixtures.cases) {
      if (!hashes.has(f.id) || hashes.get(f.id)!==f.sha256 || !f.expected?.route) throw Error('业务预期与封存样例不符。');
      hashes.delete(f.id);
    }
  }
  if (dir===repo || (dir.startsWith(repo+sep) && !dir.startsWith(experimentRoot+sep))) throw Error('仓库内的自动实验目录必须位于 build/feishu-optimization 下。');
  const signal=AbortSignal.any([AbortSignal.timeout(30*60*1000),...(options.signal?[options.signal]:[])]);
  signal.throwIfAborted();
  await mkdir(dir,{recursive:true,mode:0o700});
  const at=name=>join(dir,name);
  const baseline=validatePromptCandidate(await read(activePath));
  const manifest={schema:1,createdAt:new Date().toISOString(),component,model,budget,repeat:2,targetIds,
    baselineHash:hash(baseline),developmentHash:hash(development),holdoutHash:hash(holdout),historyHash:hash(history),
    businessHash:component==='extraction'?hash(businessFixtures):null};
  await save(at('manifest.json'),manifest);
  reserveHoldout(holdout,options.registryPath??defaultRegistry,dir);
  await save(at('baseline.json'),baseline);
  await save(at('development.json'),development);
  await save(at('holdout.json'),holdout);
  if (component==='extraction') await save(at('fixtures.json'),businessFixtures);
  const python=options.python??join(experimentRoot,'venv','bin','python'), node=options.node??process.execPath;
  const execute=options.runStage??runStage;
  const stage=(name,command,args)=>{
    signal.throwIfAborted();
    return execute({name,command,args},{cwd:repo,env:{PATH:process.env.PATH??'',LANG:process.env.LANG??'en_US.UTF-8',...env},
      signal,logPath:at(name+'.log')});
  };
  const finish=async (status,details)=>{
    const outcome={status,applied:false,runDirectory:dir,...details};
    await save(at('decision.json'),outcome);
    return outcome;
  };
  await stage('search',python,['-u',join(scripts,'optimize.py'),'--dataset',at('development.json'),'--seed',at('baseline.json'),
    '--output',at('champion.json'),'--pool',at('pool.json'),'--minibatch',String(minibatch),'--budget',String(budget),
    '--explore-ties','--focus-feedback','--model',model,'--base-url',baseUrl,'--node',node]);
  const pool=await read(at('pool.json'));
  if (!Array.isArray(pool.candidates) || !pool.candidates.length) throw Error('GEPA 未返回有效候选池。');
  if (!pool.candidates.slice(1).some(row=>row.candidate[component]!==baseline[component])) {
    return finish('no_challenger',{eligible:false,reasons:['GEPA 没有产生进入验证集的非种子改写。']});
  }
  await stage('challenger',python,[join(scripts,'challenger.py'),'--pool',at('pool.json'),'--baseline',at('baseline.json'),
    '--component',component,'--output',at('trial.json'),'--provenance',at('origin.json')]);
  const candidate=validatePromptCandidate(await read(at('trial.json')));
  async function compare(prefix,datasetPath,fixturePath,expectedHash) {
    const reportPath=at(prefix+'-paired.json'),businessPath=at(prefix+'-business.json');
    await stage(prefix+'-eval',node,[join(scripts,'evaluate.mjs'),'--retry-transport','--kind',component,'--split','holdout','--repeat','2',
      '--dataset',datasetPath,'--baseline',at('baseline.json'),'--candidate',at('trial.json'),'--report',reportPath]);
    const report=await read(reportPath);
    if (report.rows?.some(row=>row.baseline?.transportError || row.candidate?.transportError)) {
      throw Object.assign(Error('本机模型连接中断，本轮比较稍后重试。'),{code:'MODEL_TRANSPORT'});
    }
    if (report.datasetHash!==expectedHash) throw Error('评测样例与搜索前封存的指纹不符。');
    const input={pool,baseline,candidate,report};
    if (component==='extraction') {
      await stage(prefix+'-business',node,['--import','tsx',join(scripts,'workflow-check.mjs'),reportPath,businessPath,
        '--dataset',datasetPath,'--fixtures',fixturePath]);
      input.business=await read(businessPath);
    }
    return {input,decision:component==='extraction'?checkExtractionRelease(input):checkChatRelease(input)};
  }
  const fresh=await compare('fresh',at('holdout.json'),at('fixtures.json'),manifest.holdoutHash);
  const reasons=[...fresh.decision.reasons,...unattendedFailures(fresh.decision.comparison)];
  if (!checkTargets(fresh.input.report,targetIds)) reasons.push('对应问题的独立样例没有改善。');
  if (reasons.length) {
    return finish('rejected',{eligible:false,decision:fresh.decision,reasons});
  }
  const {decision:guard}=await compare('regression',historicalPath,historicalFixtures,manifest.historyHash);
  const regressions=unattendedFailures(guard.comparison);
  if (!guard.comparison.meetsComparisonLimits || guard.business?.regressions.length || guard.business?.dangers.length || regressions.length) {
    return finish('rejected',{eligible:false,decision:fresh.decision,regression:guard,reasons:['已知回归集未通过。',...regressions]});
  }
  signal.throwIfAborted();
  const publication=publishPrompt(fresh.input,{component,apply,activePath,lockPath:options.lockPath});
  return finish(publication.applied?'published':'eligible',{eligible:true,applied:publication.applied,decision:publication,regression:guard});
}
