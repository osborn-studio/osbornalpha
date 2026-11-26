import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual,parseArgs} from 'node:util';
import {parseFeishuReadTool} from '../feishu-read-tool.mjs';
import {
  evaluateProposal, missingFields, proposalSecurityQuery, summary,
} from '../feishu-workflow-command.mjs';

// Listings returned by our offline search double only when the formal parser queries the issuer.
const catalogues = new Map([
  ['COST',[{ticker:'COST',market:'US'}]],
  ['英伟达',[{ticker:'NVDA',market:'US'}]],
  ['微软',[{ticker:'MSFT',market:'US'}]],
  ['汇丰控股',[{ticker:'00005.HK',market:'HK'}]],
  ['白云机场',[{ticker:'600004.SH',market:'A'}]],
  ['英特尔',[{ticker:'INTC',market:'US'}]],
  ['中芯国际',[{ticker:'688981.SH',market:'A'},{ticker:'00981.HK',market:'HK'}]],
  ['中国移动',[{ticker:'600941.SH',market:'A'},{ticker:'00941.HK',market:'HK'}]],
  ['腾讯音乐',[{ticker:'TME',market:'US'},{ticker:'01698.HK',market:'HK'}]],
]);

// Business expectations are transcribed from the synthetic speakers' requests. No model
// outputs, prompt scores, or live prices participate in defining the expected behavior.
const noProposal = {route:'no_proposal'};
const advice = (ticker,action,fields={}) => ({route:'pm_advice',fields:{ticker,action,...fields}});
const trade = (ticker,action,direction,quantity,price,fee=0) =>
  ({route:'pm_simulation',fields:{ticker,action},simulation:{direction,quantity,price,fee}});
const draft = (missing,fields) => ({route:'request_details',missing,fields});
const expectations = new Map(Object.entries({
  't-budget':draft(['price','quantity'],{ticker:'NVDA',action:'buy'}),
  't-quantity':trade('NVDA','buy','buy',30,128),
  't-reported':noProposal,
  't-question':noProposal,
  't-conditional':noProposal,
  't-spread':advice('00005.HK','trim',{reference_price:96,target_price:89,stop_loss:101}),
  't-inventory':advice('MSFT','add'),
  't-double':{route:'clarify_single_proposal'},
  't-market':advice('00941.HK','buy'),
  't-current':advice('600004.SH','hold'),
  'v-indirect':noProposal,
  'v-switch':advice('AAPL','trim'),
  'v-ticker':advice('01810.HK','hold',{horizon:'5d'}),
  'v-bare':trade('AMD','buy','buy',45,150),
  'v-limit':advice('INTC','buy'),
  'v-explicit':draft(['ticker','action'],{securityName:'中芯国际'}),
  'h-reference':draft(['ticker'],{action:'add'}),
  'h-context-question':noProposal,
  'h-code':noProposal,
  'h-sell':trade('AAPL','sell','sell',18,223.5,1),
  'h-correction':draft(['price'],{ticker:'TSLA',action:'buy',quantity:24}),
  'h-scope':draft(['ticker'],{securityName:'腾讯音乐',action:'pass'}),
  'h-not-owned':noProposal,
  'h-market-help':noProposal,
}));

const defaultFixtures = {catalogues,expectations};
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function loadBusinessFixtures(examples,fixture) {
  if (!Array.isArray(fixture?.cases) || !fixture.cases.length || !fixture.catalogues ||
      typeof fixture.catalogues !== 'object' || Array.isArray(fixture.catalogues)) {
    throw Error('业务预期文件需要 cases 样例列表及 catalogues 证券目录。');
  }
  const byId = new Map(examples.map(example=>[example.id,example]));
  const expectations = new Map();
  for (const {id,sha256,expected} of fixture.cases) {
    const example = byId.get(id);
    if (example?.kind !== 'extraction' || fingerprint(example) !== sha256 || expectations.has(id)) {
      throw Error('业务预期中的样例缺失、重复或指纹不符。');
    }
    if (!['no_proposal','read_only','clarify_single_proposal','request_details','pm_advice','pm_simulation','cancel_request'].includes(expected?.route) ||
        (expected.route==='read_only'&&!parseFeishuReadTool(expected.query)) ||
        (expected.route === 'request_details' && !Array.isArray(expected.missing)) ||
        (expected.route === 'pm_simulation' && !expected.simulation)) {
      throw Error('业务预期缺少有效的结果类型、缺项或模拟成交参数。');
    }
    expectations.set(id,expected);
  }
  const catalogues = new Map(Object.entries(fixture.catalogues));
  for (const listings of catalogues.values()) {
    if (!Array.isArray(listings) || !listings.every(item=>typeof item?.ticker === 'string' && ['A','HK','US'].includes(item.market))) {
      throw Error('业务预期中的证券目录格式无效。');
    }
  }
  return {expectations,catalogues};
}

// Model intent and explicit grounded ownership determine whether a new submission reaches
// evaluateProposal (the connector's getInterpretation gate). Stateful cancellation, PM
// authorization, inbox deduplication and message delivery are outside this read-only replay.
const present = (text,quote) => typeof quote === 'string' && quote.trim().length > 0 &&
  text.normalize('NFKC').includes(quote.normalize('NFKC').trim());

function replay(example, packet, catalogues) {
  if(packet?.intent==='read'){
    const query=parseFeishuReadTool(packet.query);
    return query?{route:'read_only',query}:{route:'rejected'};
  }
  if (!packet || !['other','help','proposal','ambiguous','cancel'].includes(packet.intent)) return {route:'unavailable'};
  if (['other','help'].includes(packet.intent)) return {route:'no_proposal'};
  if (packet.intent==='cancel') return {route:'cancel_request'};
  const {text,receivedAt,isSupplement,priorFields={}} = example.input;
  if (!isSupplement && !present(text,packet.fields?.action?.evidence) && !present(text,packet.intentEvidence)) {
    return {route:'no_proposal'};
  }
  if (packet.intent==='ambiguous') return {route:'clarify_single_proposal'};
  const query = proposalSecurityQuery(text,packet,priorFields);
  try {
    const result = evaluateProposal('A','回放分析师',text,receivedAt,[],priorFields,packet,query ? catalogues.get(query) ?? [] : undefined);
    if (!result.body) {
      return {route:'request_details',missing:missingFields(result.fields),labels:result.missing,fields:result.fields};
    }
    return {
      route:result.body.simulation ? 'pm_simulation' : 'pm_advice',
      fields:result.body.recommendation, simulation:result.body.simulation,
      summary:summary(result.body,'演练','回放分析师','fixture000000'),
    };
  } catch (error) {
    if (error.status !== 400 && error.status !== 403) throw error;
    return {route:'rejected',message:error.message};
  }
}

const sensitiveFields = ['reference_price','target_price','stop_loss','quantity','price','fee'];

export function assessBusinessCase(example,packet,fixtures=defaultFixtures) {
  const expected = fixtures.expectations.get(example.id);
  if (!expected || example.kind !== 'extraction') throw Error('未定义该样例的业务预期。');
  const observed = replay(example,packet,fixtures.catalogues);
  const failures = [];
  if (observed.route !== expected.route) failures.push(`应为 ${expected.route}，实际为 ${observed.route}`);
  if(expected.route==='read_only' && !isDeepStrictEqual(observed.query,parseFeishuReadTool(expected.query)))failures.push('查询工具、栏目或对象范围不符');
  if (expected.fields) {
    for (const [key,value] of Object.entries(expected.fields)) {
      if (observed.fields?.[key] !== value) failures.push(`${key} 应为 ${value}`);
    }
    for (const key of sensitiveFields) {
      if (!Object.hasOwn(expected.fields,key) && observed.fields?.[key] != null) failures.push(`出现未要求的 ${key}`);
    }
  }
  if (expected.missing && !isDeepStrictEqual([...expected.missing].sort(),[...observed.missing??[]].sort())) {
    failures.push('追问的字段与草稿缺项不一致');
  }
  if (expected.simulation && !isDeepStrictEqual(observed.simulation,expected.simulation)) {
    failures.push('模拟成交方向、股数、每股价或手续费不符');
  }
  return {passed:failures.length===0,failures,observed};
}

export function businessComparison(examples,report,fixtures=defaultFixtures) {
  if (report.scope !== 'model-adapters' || !['train','validation','holdout'].includes(report.split) ||
      !Number.isSafeInteger(report.repeat) || report.repeat < 1 || !Array.isArray(report.rows)) {
    throw Error('需要评测命令生成的配对报告。');
  }
  const selected = examples.filter(e=>e.split===report.split);
  const hash = fingerprint(selected);
  if (!selected.length || hash!==report.datasetHash || report.uniqueCases!==selected.length ||
      report.rows.length!==selected.length*report.repeat) throw Error('报告的数据集指纹或样例数量与冻结回放集不符。');
  const byId = new Map(selected.map(example=>[example.id,example]));
  if (byId.size !== selected.length) throw Error('冻结回放集存在重复的样例 ID。');
  const seen = new Set();
  const rows = [];
  for (const entry of report.rows) {
    const example = byId.get(entry.id);
    const key = entry.id + '/' + entry.run;
    if (!example || example.kind !== entry.kind || !Number.isInteger(entry.run) || entry.run<1 ||
        entry.run>report.repeat || seen.has(key) || !entry.baseline || !entry.candidate) {
      throw Error('报告缺少样例、重复配对或混入其他数据集。');
    }
    seen.add(key);
    if (!fixtures.expectations.has(entry.id)) continue;
    const baseline = assessBusinessCase(example,entry.baseline.result,fixtures);
    const candidate = assessBusinessCase(example,entry.candidate.result,fixtures);
    rows.push({id:entry.id,run:entry.run,expected:fixtures.expectations.get(entry.id),baseline,candidate});
  }
  if (!rows.length) throw Error('该报告没有具备独立业务预期的样例。');
  const changed = predicate => rows.filter(predicate).map(row=>({id:row.id,run:row.run}));
  return {
    scope:'formal-proposal-validation-local-catalogue',split:report.split,repeat:report.repeat,
    datasetHash:hash,baselineHash:report.baselineHash,candidateHash:report.candidateHash,
    uniqueCases:new Set(rows.map(row=>row.id)).size,pairedRuns:rows.length,
    baselinePassed:rows.filter(row=>row.baseline.passed).length,candidatePassed:rows.filter(row=>row.candidate.passed).length,
    regressions:changed(row=>row.baseline.passed && !row.candidate.passed),
    improvements:changed(row=>!row.baseline.passed && row.candidate.passed),rows,
  };
}

async function main() {
  const {values,positionals} = parseArgs({allowPositionals:true,options:{dataset:{type:'string'},fixtures:{type:'string'}}});
  const [reportPath,output] = positionals;
  if (positionals.length !== 2) throw Error('用法：workflow-check.mjs <配对报告.json> <新业务报告.json> [--dataset 样例.json] [--fixtures 业务预期.json]');
  const [source,cases,fixture] = await Promise.all([
    readFile(reportPath,'utf8'),
    readFile(values.dataset ?? new URL('./cases.json',import.meta.url),'utf8'),
    values.fixtures ? readFile(values.fixtures,'utf8') : undefined,
  ]);
  const examples = JSON.parse(cases);
  const result = businessComparison(examples,JSON.parse(source),fixture === undefined ? defaultFixtures : loadBusinessFixtures(examples,JSON.parse(fixture)));
  await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  const {rows,...overview} = result;
  console.log(JSON.stringify(overview,null,2));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
