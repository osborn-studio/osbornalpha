import {createHash, randomUUID} from 'node:crypto';
import {mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual, parseArgs} from 'node:util';
import {validatePromptCandidate} from '../feishu-prompt.mjs';
import {pairedSummary} from './evaluate.mjs';

const liveFile = fileURLToPath(new URL('../active-prompt.json',import.meta.url));
const lockFile = fileURLToPath(new URL('../../../build/feishu-optimization/publish-lock.sqlite',import.meta.url));
const hash = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');
const positiveInt = value => Number.isSafeInteger(value) && value>0;
const riskyRoutes = new Set(['pm_advice','pm_simulation','cancel_request']);
const expectedRoutes = new Set([...riskyRoutes,'no_proposal','request_details','clarify_single_proposal']);
const validRoutes = new Set([...expectedRoutes,'unavailable','rejected']);
const insist = (value, message) => { if (!value) throw Error(message); };

function sourceIndex(pool, baseline, candidate, component) {
  insist(pool?.schema_version===1 && Array.isArray(pool.candidates) && pool.candidates.length>1,'需要包含 GEPA 改写的候选池。');
  const other=component==='extraction'?'chat':'extraction';
  insist(candidate[component].trim()!==baseline[component].trim() && candidate[other]===baseline[other],'候选只可变更正在验收的提示段。');
  const matching=[];
  let validationIds;
  for (const [index,entry] of pool.candidates.entries()) {
    insist(entry?.index===index,'候选池索引不连续。');
    validatePromptCandidate(entry.candidate);
    const scores=entry.validation_scores;
    insist(scores && typeof scores==='object' && !Array.isArray(scores),'GEPA 池缺少逐题验证分数。');
    const ids=Object.keys(scores).sort();
    const values=Object.values(scores);
    insist(ids.length && ids.every(Boolean) && (!validationIds || isDeepStrictEqual(ids,validationIds)) &&
      values.every(s=>Number.isFinite(s) && s>=0 && s<=1) && Number.isFinite(entry.validation_mean) &&
      Math.abs(values.reduce((a,b)=>a+b,0)/ids.length-entry.validation_mean)<1e-9,'GEPA 池的验证样例或均分不一致。');
    validationIds=ids;
    if (index===0) {
      insist(isDeepStrictEqual(entry.parents,[null]) && isDeepStrictEqual(entry.candidate,baseline),'候选池的种子与起始现役快照不符。');
      continue;
    }
    insist(Array.isArray(entry.parents) && entry.parents.length>0 &&
      entry.parents.every(p=>Number.isSafeInteger(p) && p>=0 && p<index),'GEPA 改写缺少有效的种子祖先。');
    if (isDeepStrictEqual(entry.candidate,candidate)) matching.push(index);
  }
  insist(matching.length===1,'候选必须能唯一对应 GEPA 池中的非种子改写。');
  return matching[0];
}

function pairedKeys(report, source) {
  insist(Array.isArray(report.rows) && positiveInt(report.uniqueCases) &&
    report.rows.length===report.uniqueCases*report.repeat,`${source}样例数与配对行数不符。`);
  const keys=new Set();
  const ids=new Set();
  for (const row of report.rows) {
    insist(typeof row?.id==='string' && row.id.length>0 && positiveInt(row.run) && row.run<=report.repeat,
      `${source}存在无效样例编号或回放轮次。`);
    const key=JSON.stringify([row.id,row.run]);
    insist(!keys.has(key),`${source}包含重复配对。`);
    keys.add(key);
    ids.add(row.id);
  }
  insist(ids.size===report.uniqueCases,`${source}每个样例都必须完成所有轮次。`);
  return keys;
}

function validateMeasurement(value) {
  insist(value && Number.isFinite(value.score) && value.score>=0 && value.score<=1 &&
    typeof value.critical==='boolean' && typeof value.passed==='boolean' && (!value.passed || value.score===1) &&
    (typeof value.rawCritical==='boolean' || value.rawCritical===null) &&
    (typeof value.error==='string' || value.error===null) && Number.isFinite(value.latencyMs) && value.latencyMs>=0,
  '盲测缺少逐条分数、严重错误、调用结果或耗时。');
}

function checkModelRelease({pool,candidate,baseline,report},component) {
  validatePromptCandidate(baseline);
  validatePromptCandidate(candidate);
  const gepaIndex=sourceIndex(pool,baseline,candidate,component);
  insist(report?.scope==='model-adapters' && report.split==='holdout' && report.component===component &&
    positiveInt(report.repeat) && report.repeat>=2,'需要至少两遍同组件独立盲测。');
  insist(report.baselineHash===hash(baseline) && report.candidateHash===hash(candidate) &&
    typeof report.datasetHash==='string' && /^[a-f\d]{64}$/u.test(report.datasetHash),'盲测的提示词或数据指纹不符。');
  const modelKeys=pairedKeys(report,'盲测');
  const developmentIds=new Set([...Object.keys(pool.candidates[gepaIndex].validation_scores),...(pool.tie_break?.paired_train_ids ?? [])]);
  for (const row of report.rows) {
    insist(row.kind===component && !developmentIds.has(row.id),'盲测混入了其他组件或候选择优样例。');
    validateMeasurement(row.baseline);
    validateMeasurement(row.candidate);
  }
  const comparison=pairedSummary(report.rows,baseline,candidate,component);
  return {modelKeys,decision:{eligible:comparison.eligible,reasons:comparison.eligible?[]:['盲测未达到严格提升、严重错误、调用失败和延迟指标。'],
    gepaIndex,baselineHash:report.baselineHash,candidateHash:report.candidateHash,datasetHash:report.datasetHash,comparison}};
}

export function checkChatRelease(input) {
  return checkModelRelease(input,'chat').decision;
}

export function checkExtractionRelease(input) {
  const {report,business}=input;
  const {decision,modelKeys}=checkModelRelease(input,'extraction');
  insist(business?.scope==='formal-proposal-validation-local-catalogue' && business.split==='holdout' &&
    ['datasetHash','baselineHash','candidateHash','repeat'].every(k=>business[k]===report[k]),
    '业务回放和盲测须使用同一组提示词、样例与回放轮次。');
  const businessKeys=pairedKeys(business,'业务回放');
  insist(businessKeys.size===modelKeys.size && [...businessKeys].every(key=>modelKeys.has(key)) &&
    business.pairedRuns===businessKeys.size,'提取发布需要覆盖全部盲测样例及每个轮次的独立业务金标。');
  let baselinePassed=0, candidatePassed=0;
  const regressions=[], dangers=[];
  for (const row of business.rows) {
    for (const side of [row.baseline,row.candidate]) {
      insist(typeof side?.passed==='boolean' && Array.isArray(side.failures) && side.passed===(side.failures.length===0) &&
        validRoutes.has(side.observed?.route) && expectedRoutes.has(row.expected?.route) &&
        (!side.passed || side.observed.route===row.expected.route),'业务回放缺少完整路由与逐题核验。');
    }
    baselinePassed+=Number(row.baseline.passed);
    candidatePassed+=Number(row.candidate.passed);
    if (row.baseline.passed && !row.candidate.passed) regressions.push(row.id);
    // A formerly incorrect draft is still a regression if it now requests a wrong PM action.
    if (!row.candidate.passed && riskyRoutes.has(row.candidate.observed.route) &&
        !isDeepStrictEqual(row.baseline.observed,row.candidate.observed)) dangers.push(row.id);
  }
  insist(business.baselinePassed===baselinePassed && business.candidatePassed===candidatePassed,
    '业务汇总与逐条结果不符。');
  const reasons=[...decision.reasons];
  if (regressions.length || candidatePassed<baselinePassed) reasons.push('业务回放出现退化。');
  if (dangers.length) reasons.push('业务回放新增错误 PM 或撤回路由。');
  return {...decision,eligible:reasons.length===0,reasons,business:{baselinePassed,candidatePassed,regressions,dangers}};
}

export function publishPrompt(input,{component='extraction',apply=false,activePath=liveFile,lockPath=lockFile}={}) {
  insist(['extraction','chat'].includes(component),'未知提示词组件。');
  const decision=component==='extraction' ? checkExtractionRelease(input) : checkChatRelease(input);
  const checkLive=()=>insist(isDeepStrictEqual(JSON.parse(readFileSync(activePath,'utf8')),input.baseline),
    '现役提示词已偏离起始快照，请重新对照。');
  checkLive();
  if (!apply || !decision.eligible) return {...decision,applied:false};
  // SQLite releases this advisory lock even if the publisher exits before the atomic rename.
  mkdirSync(dirname(lockPath),{recursive:true});
  const lock=new DatabaseSync(lockPath);
  const temp=activePath+'.'+randomUUID()+'.tmp';
  try {
    try { lock.exec('BEGIN EXCLUSIVE'); }
    catch (error) {
      if (error.errcode===5 || error.errcode===6) throw Error('其他发布进程持有锁，请稍后用相同报告重试。');
      throw error;
    }
    checkLive();
    writeFileSync(temp,JSON.stringify(input.candidate,null,2)+'\n',{flag:'wx',mode:statSync(activePath).mode & 0o777});
    renameSync(temp,activePath);
  } finally {
    try { rmSync(temp,{force:true}); } finally { lock.close(); }
  }
  return {...decision,applied:true};
}

export function publishExtraction(input,options={}) {
  return publishPrompt(input,{...options,component:'extraction'});
}

async function main() {
  const names=['pool','candidate','baseline','report','business'];
  const {values}=parseArgs({options:{...Object.fromEntries(names.map(k=>[k,{type:'string'}])),apply:{type:'boolean'}}});
  insist(names.every(k=>values[k]),'仅用于具备完整业务金标的提取盲测。用法：publish.mjs --pool 文件 --candidate 文件 --baseline 文件 --report 文件 --business 文件 [--apply]');
  const files=await Promise.all(names.map(async key=>[key,JSON.parse(await readFile(values[key],'utf8'))]));
  const result=publishExtraction(Object.fromEntries(files),{apply:values.apply});
  console.log(JSON.stringify(result,null,2));
  if (!result.eligible) process.exitCode=2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
