import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {signWebhook,validFeishuWebhook} from './feishu-webhook.mjs';

function failed(message,options={}) {
  return Object.assign(Error(message),{retriable:false,...options});
}

export function readReportDelivery(directory) {
  let content;
  try {content = readFileSync(join(directory,'feishu-report-delivery.json'),'utf8');}
  catch (error) { if (error.code==='ENOENT') return undefined; throw error; }
  const config=JSON.parse(content);
  if (typeof config.chatId!=='string' || !/^oc_[A-Za-z0-9_-]+$/.test(config.chatId) ||
      !['app','webhook'].includes(config.mode) || (config.mode==='webhook' && (!validFeishuWebhook(config.url) ||
      (config.secret!==undefined && (typeof config.secret!=='string' || config.secret.length>256 || /[\r\n]/u.test(config.secret)))))) {
    throw Error('正式报告的群播报配置无效。');
  }
  return config;
}

export function makeReportSender(appSender,config,{fetchImpl=fetch}={}) {
  if (!config) return appSender;
  const sender=async message=>{
    if (!message.formalReport) return appSender(message);
    if (message.chatId!==config.chatId) throw failed('报告未发送，查询与播报目标群不一致。');
    if (config.mode==='app') return appSender(message);
    const text=message.text.includes('正式')?message.text:'正式查询\n'+message.text;
    const payload=signWebhook({msg_type:'text',content:{text}},config.secret);
    const unknown=()=>failed('群播报回执不确定。',{uncertain:true});
    let response;
    try {
      response=await fetchImpl(config.url,{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(10000)});
    } catch {throw unknown();}
    if (response.status===429) throw failed('群机器人限流。',{retriable:true,safeRetry:true});
    if (response.status>=500 || response.status===408) throw unknown();
    if (!response.ok) throw failed('群机器人拒绝了报告。');
    const body=await response.json().catch(()=>null);
    const code=body?.code??body?.StatusCode;
    if (code===11232) throw failed('群机器人限流。',{retriable:true,safeRetry:true});
    if (!Number.isInteger(code)) throw unknown();
    if (code!==0) throw failed('群机器人拒绝了报告，请核对该群的签名或关键词。');
    return {deliveredToWebhook:true};
  };
  sender.formalReportWebhook=config.mode==='webhook';
  return sender;
}
