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

const defaultDirectory = fileURLToPath(new URL('../../build/feishu/',import.meta.url));

export function createFormalFeishuWorkflow({sendMessage,wake,env = process.env,extractWithModel,respondToChat,searchSecurity} = {}) {
  const directory = resolve(env.FEISHU_DATA_DIR || defaultDirectory);
  const config = readFeishuBindings(directory);
  const syncFormal = createFormalSync(env);
  const readPrompt = createPublishedPromptReader();
  const extractor = extractWithModel ?? createFeishuLlmExtractor(env,{formalTrades:true,readPrompt});
  const chat = respondToChat ?? createFeishuChatResponder(env,{readPrompt});
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
  const workflow = openFeishuRuntime(directory,{assistantEnv:env,wake,sendMessage:makeReportSender(sendMessage,reportConfig),
    queryFormal,syncFormal,extractWithModel:extractor,respondToChat:chat,
    ...(searchSecurity && {searchSecurity})});
  const stopWarmth = startFeishuModelWarmth(env);
  const close = () => { stopWarmth(); return workflow.close(); };
  if (wake) return {...workflow,close,drainBackground:workflow.tickRecaps};
  if (env.OSBORN_FEISHU_LOCAL_ASSISTANT === 'true') {
    return {...workflow,close,async drainBackground() {
      await Promise.all([workflow.drainChat(),workflow.drainDemo(),workflow.drainMembership(),workflow.tickRecaps()]);
    }};
  }
  return {...workflow,close,...(chat && {drainBackground:workflow.drainChat})};
}
