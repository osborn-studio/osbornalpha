import {readFile, writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs, parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import {createFeishuChatResponder, createFeishuLlmExtractor} from '../feishu-llm.mjs';
import {activePrompt, validatePromptCandidate} from '../feishu-prompt.mjs';
import {scoreExample} from './scoring.mjs';
import {yieldToConnector} from './offline-queue.mjs';

const root = new URL('../../../',import.meta.url);
const localHosts = new Set(['localhost','127.0.0.1','[::1]']);
const readJSON = async path => JSON.parse(await readFile(path,'utf8'));
const fingerprint = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');

async function localSettings() {
  let file = {};
  // Use only model settings. The offline runner never initializes Feishu or the formal writer.
  if (!process.env.FEISHU_LLM_BASE_URL || !process.env.FEISHU_LLM_MODEL) {
    try { file = parseEnv(await readFile(new URL('build/feishu/feishu-app.env',root),'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const settings = {};
  for (const key of ['FEISHU_LLM_BASE_URL','FEISHU_LLM_MODEL','FEISHU_LLM_TIMEOUT_MS']) {
    settings[key] = process.env[key] || file[key];
  }
  const url = new URL(settings.FEISHU_LLM_BASE_URL);
  if (!localHosts.has(url.hostname) || !settings.FEISHU_LLM_MODEL) throw Error('评测需要本机模型。');
  return settings;
}

function readRaw(answer,kind) {
  if (typeof answer !== 'string' || kind === 'chat') return answer ?? null;
  const clean = answer.trim().replace(/^<think>[\s\S]*?<\/think>\s*/i,'');
  const json = /^\x60\x60\x60(?:json)?\s*\n([\s\S]*?)\n\x60\x60\x60$/i.exec(clean)?.[1] ?? clean;
  try { return JSON.parse(json); } catch { return null; }
}

function isTransportFailure(error,signal) {
  if (signal?.aborted || ['TimeoutError','AbortError'].includes(error?.name)) return true;
  const code=error?.cause?.code ?? error?.code;
  return ['ECONNREFUSED','ECONNRESET','EHOSTUNREACH','ENETUNREACH','EPIPE','ETIMEDOUT','ENOTFOUND','EAI_AGAIN',
    'UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_HEADERS_TIMEOUT'].includes(code);
}

export async function evaluateExample(example,candidate,settings,fetchModel = fetch) {
  await yieldToConnector(process.env.FEISHU_OPT_QUEUE_DB);
  validatePromptCandidate(candidate);
  if (!['extraction','chat'].includes(example?.kind)) throw Error('未知评测类型。');
  if (!localHosts.has(new URL(settings.FEISHU_LLM_BASE_URL).hostname)) throw Error('评测仅支持本机模型。');
  let raw = null, transportError = false, requestSignal;
  const fetchImpl = async (url,options) => {
    if (!localHosts.has(new URL(url).hostname)) throw Error('评测仅支持本机模型。');
    requestSignal = options.signal;
    let response;
    try { response = await fetchModel(url,options); }
    catch (error) { transportError = isTransportFailure(error,requestSignal); throw error; }
    if ([408,425,429,500,502,503,504].includes(response.status)) transportError = true;
    const packet = await response.clone().json().catch(error => {
      if (isTransportFailure(error,requestSignal)) transportError = true;
      return null;
    });
    raw = readRaw(packet?.choices?.[0]?.message?.content,example.kind);
    return response;
  };
  const options = {fetchImpl,formalTrades:true,promptCandidate:candidate};
  const run = example.kind === 'extraction' ? createFeishuLlmExtractor(settings,options) : createFeishuChatResponder(settings,options);
  if (!run) throw Error('本机模型未配置。');
  const start = performance.now();
  let result = null;
  let error = null;
  try { result = await run(example.input); }
  catch { error = '模型调用或输出校验失败'; if (requestSignal?.aborted) transportError = true; }
  const latencyMs = Math.round(performance.now() - start);
  const scored = scoreExample(example,{raw,result,latencyMs,error});
  return {...scored,latencyMs,error,raw,result,...(transportError && {transportError:true})};
}

function summary(rows) {
  const latencies = rows.map(row=>row.latencyMs).sort((a,b)=>a-b);
  return {
    n:rows.length, mean:rows.reduce((sum,row)=>sum+row.score,0)/rows.length,
    passed:rows.filter(row=>row.passed).length, critical:rows.filter(row=>row.critical).length,
    rawCritical:rows.filter(row=>row.rawCritical).length,
    errors:rows.filter(row=>row.error).length, p95Ms:latencies[Math.ceil(latencies.length*0.95)-1],
  };
}

export function pairedSummary(rows,baselinePrompt,candidatePrompt,onlyKind) {
  if (!rows.length) throw Error('没有可比较的样例。');
  const kinds = onlyKind ? [onlyKind] : ['extraction','chat'];
  if (kinds.some(kind=>!['extraction','chat'].includes(kind)) || rows.some(row=>!kinds.includes(row.kind))) {
    throw Error('评测结果与指定组件不一致。');
  }
  const metrics = side => ({
    all:summary(rows.map(row=>row[side])),
    ...Object.fromEntries(kinds.map(kind => {
      const subset = rows.filter(row=>row.kind===kind);
      if (!subset.length) throw Error('评测须同时覆盖提取和群聊。');
      return [kind,summary(subset.map(row=>row[side]))];
    })),
  });
  const baseline = metrics('baseline');
  const candidate = metrics('candidate');
  const changedComponents = kinds.filter(kind=>!baselinePrompt || !candidatePrompt ||
    baselinePrompt[kind]!==candidatePrompt[kind]);
  const stable = kinds.every(kind=>
    candidate[kind].mean + 1e-9 >= baseline[kind].mean && candidate[kind].passed >= baseline[kind].passed);
  const improves = candidate.all.mean > baseline.all.mean + 1e-9 && candidate.all.passed >= baseline.all.passed;
  const changedGain = changedComponents.some(kind=>candidate[kind].mean > baseline[kind].mean + 1e-9);
  const latencyWithinBudget = kinds.every(kind=>
    candidate[kind].p95Ms <= Math.max(baseline[kind].p95Ms * 1.5,baseline[kind].p95Ms + 2000));
  const newRawCritical = [...new Set(rows.filter(row=>row.candidate.rawCritical && !row.baseline.rawCritical)
    .map(row=>row.id))];
  const byCase = new Map();
  for (const row of rows) {
    byCase.set(row.id,(byCase.get(row.id) ?? 0) + row.candidate.score - row.baseline.score);
  }
  const improvedCases = [...byCase].filter(([,delta])=>delta>1e-8).map(([id])=>id);
  const regressedCases = [...byCase].filter(([,delta])=>delta< -1e-8).map(([id])=>id);
  const meetsComparisonLimits = stable && !newRawCritical.length && candidate.all.critical===0 &&
    candidate.all.errors<=baseline.all.errors && latencyWithinBudget;
  return {baseline,candidate,changedComponents,newRawCritical,improvedCases,regressedCases,meetsComparisonLimits,
    eligible:meetsComparisonLimits && improves && changedGain,latencyWithinBudget};
}

export function selectForHoldout(rows,baseline,candidate) {
  const selected = {};
  for (const kind of ['extraction','chat']) {
    const subset = rows.filter(row=>row.kind===kind);
    if (!subset.length) throw Error('验证集缺少评测类型。');
    const original = summary(subset.map(row=>row.baseline));
    const trial = summary(subset.map(row=>row.candidate));
    const safe = !subset.some(row=>row.candidate.rawCritical && !row.baseline.rawCritical);
    const keep = safe && trial.critical===0 && trial.errors<=original.errors &&
      trial.mean + 1e-9 >= original.mean && trial.passed >= original.passed;
    selected[kind] = (keep ? candidate : baseline)[kind];
  }
  return selected;
}

async function serve(settings) {
  for await (const line of createInterface({input:process.stdin,crlfDelay:Infinity})) {
    if (!line.trim()) continue;
    try {
      const {example,candidate} = JSON.parse(line);
      const {score,feedback,critical,rawCritical,passed,error,raw,transportError} = await evaluateExample(example,candidate,settings);
      const modelOutput = (typeof raw==='string' ? raw : JSON.stringify(raw)).slice(0,1200);
      console.log(JSON.stringify({score,feedback,critical,rawCritical,passed,error,modelOutput,transportError}));
    } catch { console.log(JSON.stringify({error:'无法评测样例，请检查模型设置、候选和样例格式。'})); }
  }
}

async function main() {
  const {values} = parseArgs({options:{
    stdio:{type:'boolean'},'retry-transport':{type:'boolean'},candidate:{type:'string'},baseline:{type:'string'},report:{type:'string'},select:{type:'string'},
    split:{type:'string',default:'holdout'},repeat:{type:'string',default:'2'},kind:{type:'string'},
    dataset:{type:'string',default:fileURLToPath(new URL('cases.json',import.meta.url))},
  }});
  const settings = await localSettings();
  if (values.stdio) return serve(settings);
  if (values.kind && (!['chat','extraction'].includes(values.kind) || values.select)) throw Error('单组件复核请选择 chat 或 extraction，候选须已冻结。');
  if (values.select && values.split!=='validation') throw Error('只能按验证集选择用于盲测的候选。');
  const repeat = Number(values.repeat);
  if (!values.candidate || !values.report || !['train','validation','holdout'].includes(values.split) ||
      !Number.isInteger(repeat) || repeat<1 || repeat>10) {
    throw Error('请指定 --candidate 文件 --report 新文件，可选 --split train|validation|holdout 和 --repeat 1–10。');
  }
  const baseline = values.baseline ? validatePromptCandidate(await readJSON(values.baseline)) : activePrompt;
  const candidate = validatePromptCandidate(await readJSON(values.candidate));
  const examples = (await readJSON(values.dataset)).filter(c=>c.split===values.split && (!values.kind || c.kind===values.kind));
  const rows = [];
  for (let run=0;run<repeat;run++) {
    for (const [index,example] of examples.entries()) {
      const row = {id:example.id,kind:example.kind,run:run+1};
      // Alternate order, including between repeats, to distribute cold starts and load.
      const order = (index+run)%2===0 ? ['baseline','candidate'] : ['candidate','baseline'];
      for (const side of order) {
        row[side] = await evaluateExample(example,side==='baseline'?baseline:candidate,settings);
        if (values['retry-transport'] && row[side].transportError) throw Error('本机模型连接中断，本轮比较稍后重试。');
      }
      rows.push(row);
      console.error(`[${rows.length}/${examples.length*repeat}] ${example.id}`);
    }
  }
  const comparison = pairedSummary(rows,baseline,candidate,values.kind);
  const report = {createdAt:new Date().toISOString(),model:settings.FEISHU_LLM_MODEL,scope:'model-adapters',
    split:values.split,component:values.kind ?? 'both',repeat,uniqueCases:examples.length,datasetHash:fingerprint(examples),
    baselineHash:fingerprint(baseline),candidateHash:fingerprint(candidate),...comparison,rows};
  await writeFile(values.report,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  if (values.select) {
    const selected = selectForHoldout(rows,baseline,candidate);
    await writeFile(values.select,JSON.stringify(selected,null,2)+'\n',{flag:'wx',mode:0o600});
  }
  console.log(JSON.stringify(comparison,null,2));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
