import { localRegister } from './feishu-demo-register.mjs';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createAilyExtractor } from '../../integrations/feishu/feishu-aily.mjs';
import { createFeishuLlmExtractor } from '../../integrations/feishu/feishu-llm.mjs';
import { createFormalSync } from '../../integrations/feishu/feishu-formal-api.mjs';
import { openFeishuRuntime, readFeishuBindings } from '../../integrations/feishu/feishu-runtime.mjs';
import { deliverAppPending, hasAppDelivery, recoverAppDelivery } from './delivery.mjs';

const defaultDirectory = fileURLToPath(new URL('../../build/analyst-replay/', import.meta.url));

export function createLocalFeishuWorkflow({sendMessage,extractWithModel = createFeishuLlmExtractor() ?? createAilyExtractor()}) {
  const directory = resolve(process.env.REPLAY_DATA_DIR || defaultDirectory);
  const port = Number(process.env.REPLAY_PORT || 4317);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw Error('Demo 端口无效');
  const workflow = openFeishuRuntime(directory,{assistantEnv:process.env,register:payload => localRegister(payload,port),
    syncFormal:createFormalSync(),extractWithModel,sendMessage});
  const replayFile = join(directory,'replay.sqlite');
  let replay;
  function drainBroadcasts() {
    if (process.env.REPLAY_PUBLIC_URL || !existsSync(replayFile)) return;
    if (!replay) {
      const candidate = new DatabaseSync(replayFile);
      try {
        candidate.exec('PRAGMA busy_timeout=3000');
        if (!hasAppDelivery(candidate)) { candidate.close(); return; }
        recoverAppDelivery(candidate);
        replay = candidate;
      } catch (error) { candidate.close(); throw error; }
    }
    return deliverAppPending(replay,{sendMessage,boundChatId:() => readFeishuBindings(directory).chatId});
  }
  return {...workflow, async drainBackground() {
    await Promise.all([workflow.drainDemo(),workflow.drainMembership(),workflow.tickRecaps(),drainBroadcasts()]);
  }, async drain() {
    const results = await Promise.allSettled([workflow.drain(),Promise.resolve().then(drainBroadcasts)]);
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    await drainBroadcasts();
  }, close() { replay?.close(); return workflow.close(); }};
}
