// These checks score synthetic, labeled replays. They never classify production messages.
const highImpactFields = new Set(['ticker','securityName','market','action','executionMode','quantity','price','fee','currency','analyst']);
const round = number => Math.round(number * 1000) / 1000;
const normalize = text => text.normalize('NFKC').trim();
const matches = (text, expression) => new RegExp(expression, 'iu').test(text);
const evidenceIn = (text, evidence) => typeof evidence === 'string' && normalize(evidence).length > 0 &&
  normalize(text).includes(normalize(evidence));

function fieldMatches(key, value, expected) {
  if (value === expected) return true;
  if (key === 'recommended_at' && typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) {
    return Date.parse(value) === Date.parse(expected);
  }
  return key === 'ticker' && typeof value === 'string' && typeof expected === 'string' &&
    value.toUpperCase() === expected.toUpperCase();
}

function extraction(example, output) {
  const {expect, input} = example;
  const issues = [];
  const add = (message, critical = false) => issues.push({message, critical});
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return {score:0, critical:false, issues:[{message:'缺少可解析的结构化结果'}]};
  }
  const fields = output.fields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) add('fields 应为对象');
  if (output.intent !== expect.intent) {
    const critical = output.intent === 'proposal' || output.intent === 'cancel';
    add(`意图应为 ${expect.intent}，实际为 ${String(output.intent)}`,critical);
  }
  if (expect.helpTopic && output.helpTopic !== expect.helpTopic) add(`问题应归入 ${expect.helpTopic}`);
  if (expect.intentEvidence && !evidenceIn(input.text,output.intentEvidence)) add('缺少当前消息逐字引用的意图证据');
  const required = expect.fields;
  const optional = expect.optionalFields ?? {};
  for (const key of Object.keys(required)) {
    if (!Object.hasOwn(fields ?? {},key)) add(`漏掉 ${key}=${required[key]}`);
  }
  for (const [key,field] of Object.entries(fields ?? {})) {
    if (!Object.hasOwn(required,key) && !Object.hasOwn(optional,key)) {
      add(`多填 ${key}，当前消息未提供该项`,highImpactFields.has(key));
      continue;
    }
    const expected = Object.hasOwn(required,key) ? required[key] : optional[key];
    if (!fieldMatches(key,field?.value,expected)) add(`${key} 应为 ${expected}，得到 ${String(field?.value)}`,highImpactFields.has(key));
    if (!evidenceIn(input.text,field?.evidence)) add(`${key} 的证据必须逐字取自当前消息`,highImpactFields.has(key));
  }
  const requiredCount = Object.keys(required).length + Number(Boolean(expect.helpTopic)) + Number(Boolean(expect.intentEvidence));
  const score = issues.some(issue=>issue.critical) ? 0 : (output.intent !== expect.intent ? 0 :
    Math.max(0,1 - issues.length / (1 + requiredCount)));
  return {score,critical:issues.some(issue=>issue.critical),issues};
}

function numericTokens(text) {
  const tokens = normalize(text).match(/\d+(?:,\d{3})*(?:\.\d+)?/gu) ?? [];
  return [...new Set(tokens.map(token=>Number(token.replaceAll(',',''))))];
}

function chat(example, output) {
  const {expect} = example;
  const issues = [];
  const add = (message, critical = false) => issues.push({message, critical});
  if (typeof output !== 'string' || !output.trim()) {
    return {score:0,critical:false,issues:[{message:'没有可用的聊天回复'}]};
  }
  const reply = normalize(output.replace(/^<think>[\s\S]*?<\/think>\s*/iu,''));
  if (!reply) return {score:0,critical:false,issues:[{message:'缺少给群成员的可见回答'}]};
  // A first-person assertion claims the assistant took action, even when viewing a real receipt.
  if (matches(reply,'(?:我|系统|机器人)(?:刚刚|刚才|已经|已)(?:帮你|为你|替你|完成|成功|经)*(?:确认|同意|批准|登记|录入|买入|卖出|下单|撤回|成交)')) {
    add('把聊天回答写成了代为确认、成交或登记的回执',true);
  }
  if (/(?:实时股价|最新报价|当前股价|最新价格|现价)\s*(?:为|是|约|[:：])?\s*[$¥￥]?\d/u.test(reply)) {
    add('把模型生成的数字说成实时行情',true);
  }
  for (const alternatives of expect.concepts) {
    if (!alternatives.some(pattern=>matches(reply,pattern))) add(`回答缺少这一要点（可用同义词）：${alternatives.join(' / ')}`);
  }
  for (const pattern of expect.avoid ?? []) {
    if (matches(reply,pattern)) add(`回答包含偏题或与摘要不一致的说法：${pattern}`);
  }
  for (const pattern of expect.criticalAvoid ?? []) {
    if (matches(reply,pattern)) add(`回答出现与事实或权限冲突的断言：${pattern}`,true);
  }
  if (expect.numbers) {
    const observed = numericTokens(reply);
    const allowed = new Set(expect.numbers.allowed.map(Number));
    for (const value of expect.numbers.required) {
      if (!observed.includes(value)) add(`回答缺少摘要中的数值 ${value}`);
    }
    for (const value of observed) {
      if (!allowed.has(value)) add(`回答出现未获摘要支持的数值 ${value}`,true);
    }
    const execution = example.input.proposalContext?.execution;
    if (execution) {
      for (const match of reply.matchAll(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*股(?!票)/gu)) {
        if (Number(match[1].replaceAll(',','')) !== execution.quantity) add('拟成交股数与摘要不符',true);
      }
      for (const match of reply.matchAll(/(?:每股|单价|每股成交价)\s*(?:价格|成交价|的价格)?\s*(?:为|是|约|[:：])?\s*[$¥￥]?\s*(\d+(?:,\d{3})*(?:\.\d+)?)/gu)) {
        if (Number(match[1].replaceAll(',','')) !== execution.price) add('每股价格与摘要不符',true);
      }
    }
  }
  if (expect.maxChars && Array.from(reply).length > expect.maxChars) add('日常群聊的回复过长');
  if (!/[\p{Script=Han}]/u.test(reply)) add('需要用中文直接回应');
  const count = expect.concepts.length + (expect.numbers?.required.length ?? 0);
  const critical = issues.some(issue=>issue.critical);
  return {score:critical ? 0 : Math.max(0,1 - issues.length / Math.max(1,count)),critical,issues};
}

export function scoreExample(example, {raw, result, latencyMs, error}) {
  const measure = example.kind === 'chat' ? chat : extraction;
  const applied = measure(example,result);
  const model = raw === undefined || raw === null ? null : measure(example,raw);
  const appliedScore = error ? 0 : applied.score;
  const score = applied.critical || error ? 0 : model ? 0.8 * appliedScore + 0.2 * model.score : appliedScore;
  const notes = [];
  if (error) notes.push('适配器未返回结果（请求失败、超时或输出被拒绝）。');
  const describe = entry => entry.issues.map(issue=>issue.message).join('；');
  if (model?.issues.length) notes.push(`模型原始输出：${describe(model)}。`);
  if (applied.issues.length) notes.push(`连接器结果：${describe(applied)}。`);
  if (model?.score === 1 && appliedScore < 1) notes.push('原始答案正确，检查适配器过滤或输出格式。');
  if (!notes.length) notes.push('意图、字段证据或聊天回答符合本条预期。');
  return {
    score:round(score), passed:score === 1, critical:applied.critical,
    rawScore:model ? round(model.score) : null, rawCritical:model?.critical ?? null,
    resultScore:round(appliedScore), latencyMs:Number.isFinite(latencyMs) ? latencyMs : null,
    feedback:notes.join(' ').slice(0,1450),
  };
}
