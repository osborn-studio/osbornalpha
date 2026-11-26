import * as Lark from '@larksuiteoapi/node-sdk';

const settings = [
  'FEISHU_AILY_APP_ID', 'FEISHU_AILY_SKILL_ID',
  'FEISHU_AILY_CHANNEL_APP_ID', 'FEISHU_AILY_CHANNEL_APP_SECRET',
];
const intents = new Set(['proposal','other','ambiguous']);
const textFields = new Set(['ticker','market','action','securityName','rationale','thesis_ref','horizon','recommended_at','currency']);
const numberFields = new Set(['reference_price','target_price','stop_loss','confidence','price','quantity','fee']);
const priorTextFields = ['ticker','market','action','securityName','horizon','recommended_at','currency'];
const ignore = () => {};
const logger = {trace:ignore,debug:ignore,info:ignore,warn:ignore,error:ignore};

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readPacket(response) {
  const output = response?.data?.output;
  if (response?.code !== 0 || response?.data?.status !== 'success' || typeof output !== 'string' || output.length > 60_000) throw Error();
  const extraction = JSON.parse(output)?.extraction;
  if (typeof extraction !== 'string') throw Error();
  const packet = JSON.parse(extraction);
  if (!record(packet) || !intents.has(packet.intent) || !record(packet.fields)) throw Error();
  const fields = {};
  for (const [name, field] of Object.entries(packet.fields)) {
    if (!textFields.has(name) && !numberFields.has(name)) throw Error();
    if (!record(field) || typeof field.evidence !== 'string' || !field.evidence.trim() || field.evidence.length > 4000) throw Error();
    if (numberFields.has(name) ? !Number.isFinite(field.value) :
      (typeof field.value !== 'string' || !field.value.trim() || field.value.length > 4000)) throw Error();
    fields[name] = {value:field.value,evidence:field.evidence};
  }
  return {intent:packet.intent,fields};
}

function contextForSkill(fields) {
  const context = {};
  for (const key of priorTextFields) {
    const value = fields[key];
    if (typeof value === 'string' && value.length <= 100) context[key] = value;
  }
  for (const key of numberFields) {
    if (Number.isFinite(fields[key])) context[key] = fields[key];
  }
  return context;
}

export function createAilyExtractor(env = process.env, {sdk = Lark, timeoutMs = 12_000} = {}) {
  const [appId,skillId,channelId,secret] = settings.map(key => typeof env[key] === 'string' ? env[key].trim() : '');
  if (!appId && !skillId && !channelId && !secret) return undefined;
  if (!/^spring_[A-Za-z\d_-]{1,100}__c$/.test(appId) || !/^skill_[A-Za-z\d_-]{1,100}$/.test(skillId) ||
      !/^cli_[A-Za-z\d]{16}$/.test(channelId) || !/^\S{1,256}$/.test(secret)) {
    throw Error('飞书 Aily 配置不完整或格式不正确。');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw Error('飞书 Aily 调用的超时配置无效。');

  // The SDK uses this private transport for the token exchange as well as the skill call.
  const httpInstance = sdk.defaultHttpInstance.create({timeout:timeoutMs,maxRedirects:0,maxContentLength:256_000});
  httpInstance.interceptors.response.use(response => response.data);
  const client = new sdk.Client({appId:channelId,appSecret:secret,logger,domain:sdk.Domain.Feishu,httpInstance});
  const url = `/open-apis/aily/v1/apps/${appId}/skills/${skillId}/start`;
  return async ({text,priorFields = {},receivedAt,isSupplement = false}) => {
    if (typeof text !== 'string' || !text.trim() || text.length > 12_000 || !record(priorFields) ||
        typeof receivedAt !== 'string' || !Number.isFinite(Date.parse(receivedAt)) || typeof isSupplement !== 'boolean') {
      throw Error('飞书 Aily 收到无效的建议输入。');
    }
    const input = JSON.stringify({text,receivedAt:new Date(receivedAt).toISOString(),isSupplement,
      priorFields:JSON.stringify(contextForSkill(priorFields))});
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      const response = await client.request({method:'POST',url,data:{input},timeout:timeoutMs,signal});
      signal.throwIfAborted();
      return readPacket(response);
    } catch {
      // SDK rejections can include raw request bodies and authentication headers.
      throw Error('飞书 Aily 技能调用失败。');
    }
  };
}
