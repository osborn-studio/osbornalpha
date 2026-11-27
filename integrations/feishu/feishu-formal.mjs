import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isUuid } from '../../src/lib/portfolio/validate.ts';
import { createFeishuChatResponder, createFeishuLlmExtractor } from './feishu-llm.mjs';
import {createFormalReader} from './feishu-formal-read.mjs';
import {makeReportSender, readReportDelivery} from './feishu-report-delivery.mjs';
import { createFormalSync } from './feishu-formal-api.mjs';
import { openFeishuRuntime, readFeishuBindings } from './feishu-runtime.mjs';
import { validateAnalystAliases } from './feishu-pairing.mjs';
import {createPublishedPromptReader} from './feishu-prompt.mjs';
import {startFeishuModelWarmth} from './feishu-model-warmth.mjs';
import {createFeishuNavigation} from './feishu-navigation.mjs';
import {createSiteLinks, withSiteLinks} from './feishu-shared-link.mjs';
import {createXlsxReporter} from './feishu-xlsx-report.mjs';

const defaultDirectory = fileURLToPath(new URL('../../build/feishu/',import.meta.url));

export function createFormalFeishuWorkflow({sendMessage,wake,env = process.env,extractWithModel,respondToChat,searchSecurity} = {}) {
  const directory = resolve(env.FEISHU_DATA_DIR || defaultDirectory);
  const config = readFeishuBindings(directory);
  const syncFormal = createFormalSync(env);
  const modelOptions = {readPrompt:createPublishedPromptReader(),allowCloudFallback:true,
    onFallback:({component,success,reason}) => console.info('飞书模型备用调用',component,reason,success ? '成功' : '失败')};
  const extractor = extractWithModel ?? createFeishuLlmExtractor(env,{...modelOptions,formalTrades:true});
  const chat = respondToChat ?? createFeishuChatResponder(env,modelOptions);
  if (!syncFormal || !extractor || !config.chatId || config.simulationAccount?.confirmed !== true ||
      !isUuid(config.simulationAccount.id) || !Array.isArray(config.approverIds) || !config.approverIds.length ||
      !Object.keys(config.analystBySender ?? {}).length) {
    throw Error('请完成正式连接器的模型、接入地址、模拟账户、分析师和审批人绑定。');
  }
  validateAnalystAliases(config);
  let reportConfig;
  try { reportConfig=readReportDelivery(directory); } catch {
    console.error('正式查询的群播报配置无效，请重新配置后重启连接器。');
  }
  const queryFormal=reportConfig?.chatId===config.chatId ? createFormalReader(env) : undefined;
  // Site links in every reply open as the simulation account once FEISHU_SHARED_LOGIN_URL is set.
  const send = withSiteLinks(makeReportSender(sendMessage,reportConfig),createSiteLinks(env));
  const workflow = openFeishuRuntime(directory,{assistantEnv:env,wake,navigation:createFeishuNavigation(env),sendMessage:send,
    queryFormal,syncFormal,extractWithModel:extractor,respondToChat:chat,
    ...(searchSecurity && {searchSecurity})});
  const stopWarmth = startFeishuModelWarmth(env);
  const close = () => { stopWarmth(); return workflow.close(); };
  // 「@助手 导出报表」 starts the Excel report (posted by the group's custom bot) instead of a model reply.
  const xlsx = env.FEISHU_XLSX_REPORT_ENABLED === 'true' ? createXlsxReporter({directory,env}) : null;
  const receive = event => xlsx?.handle(event,readFeishuBindings(directory)) ? {accepted:true} : workflow.receive(event);
  if (wake) return {...workflow,receive,close,drainBackground:workflow.tickRecaps};
  if (env.OSBORN_FEISHU_LOCAL_ASSISTANT === 'true') {
    return {...workflow,receive,close,async drainBackground() {
      await Promise.all([workflow.drainChat(),workflow.drainDemo(),workflow.drainMembership(),workflow.tickRecaps()]);
    }};
  }
  return {...workflow,receive,close,...(chat && {drainBackground:workflow.drainChat})};
}
