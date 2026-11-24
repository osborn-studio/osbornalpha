import * as Lark from '@larksuiteoapi/node-sdk';
import { pathToFileURL } from 'node:url';

const ignore = () => {};
// SDK diagnostics can include complete event bodies, endpoint URLs and request headers.
const sdkLogger = { trace: ignore, debug: ignore, info: ignore, warn: ignore, error: ignore };
const isId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
const isOpenId = value => typeof value === 'string' && /^ou_[A-Za-z0-9_-]{1,156}$/.test(value);
const hasCredentials = (id, secret) => /^cli_[0-9a-fA-F]{16}$/.test(id || '') && Boolean(secret?.trim());

function postText(content, mentionKeys) {
  // Received posts normally have title/content at the top level. Some clients wrap the Chinese version.
  const post = content?.content !== undefined ? content : content?.zh_cn;
  if (!Array.isArray(post?.content) || (post.title !== undefined && typeof post.title !== 'string')) return null;
  const paragraphs = post.title ? [post.title] : [];
  for (const paragraph of post.content) {
    if (!Array.isArray(paragraph)) return null;
    const fragments = [];
    for (const node of paragraph) {
      // Trade terms in an image, attachment or crossed-out passage cannot be transcribed reliably.
      if (!node || (node.style !== undefined && (!Array.isArray(node.style) || node.style.includes('lineThrough')))) return null;
      if (node.tag === 'text' || node.tag === 'a') {
        if (typeof node.text !== 'string') return null;
        fragments.push(node.text);
      } else if (node.tag === 'at' && /^@_user_\d+$/.test(node.user_id) && mentionKeys.has(node.user_id)) {
        fragments.push(' ' + node.user_id + ' ');
      } else {
        return null;
      }
    }
    paragraphs.push(fragments.join(''));
  }
  return paragraphs.join('\n');
}

export function normalizeGroupMessage(data, appId, botOpenId) {
  const { message, sender } = data || {};
  if (data?.app_id !== appId || sender?.sender_type !== 'user' ||
      message?.chat_type !== 'group' || !['text','post'].includes(message.message_type)) return null;
  const senderId = sender.sender_id?.open_id;
  if (![data.event_id, senderId, message.chat_id, message.message_id].every(isId)) return null;
  if (typeof message.create_time !== 'string' || !/^\d{13}$/.test(message.create_time)) return null;
  if (typeof message.content !== 'string') return null;
  const entries = Array.isArray(message.mentions) ? message.mentions : [];
  const mentions = new Set(entries.map(item => item?.key));
  let text;
  try {
    const content = JSON.parse(message.content);
    text = message.message_type === 'post' ? postText(content, mentions) : content?.text;
  } catch {
    return null;
  }
  if (typeof text !== 'string') return null;
  text = text.trim();
  let directedToBot = false;
  if (isOpenId(botOpenId)) {
    const addressed = new Set(entries.filter(item => item?.id?.open_id === botOpenId).map(item => item.key));
    text = text.replace(/@_user_\d+/g, key => {
      if (!addressed.has(key)) return key;
      directedToBot = true;
      return ' ';
    }).trim();
  } else {
    // Until the identity lookup succeeds retain compatibility with existing prefixed commands.
    while (true) {
      const key = text.match(/^@_user_\d+(?!\d)/)?.[0];
      if (!key || !mentions.has(key)) break;
      text = text.slice(key.length).trimStart();
    }
  }
  if (!text) return null;
  return {
    eventId: data.event_id, messageId: message.message_id, chatId: message.chat_id,
    senderId, text, ...(directedToBot ? {directedToBot:true} : {}), createdAt: new Date(Number(message.create_time)).toISOString(),
    parentId: isId(message.parent_id) ? message.parent_id : null,
    rootId: isId(message.root_id) ? message.root_id : null,
  };
}

function sendFailure(status, code) {
  const businessCode = Number.isSafeInteger(code) ? code : undefined;
  const httpStatus = Number.isSafeInteger(status) ? status : undefined;
  const terminalCodes = [230001, 230002, 230006, 230013, 230018, 230019, 230022, 230025, 230027, 99991672];
  const transientCodes = [230020, 99991400];
  const terminalHttp = httpStatus >= 400 && httpStatus < 500 && ![408, 425, 429].includes(httpStatus);
  const retriable = transientCodes.includes(businessCode) || (!terminalCodes.includes(businessCode) && !terminalHttp);
  const detail = [httpStatus && 'HTTP ' + httpStatus, businessCode && '飞书 ' + businessCode].filter(Boolean).join('，');
  const safeRetry = httpStatus === 429 || transientCodes.includes(businessCode);
  return Object.assign(new Error('飞书消息未获确认' + (detail ? '（' + detail + '）' : '')), { retriable,safeRetry });
}

export function makeFeishuSender(client) {
  return async ({ chatId, text, uuid, replyTo }) => {
    const data = { msg_type: 'text', content: JSON.stringify({ text }), uuid };
    let response;
    try {
      response = replyTo
        ? await client.im.message.reply({ path: { message_id: replyTo }, data })
        : await client.im.message.create({ params: { receive_id_type: 'chat_id' }, data: { ...data, receive_id: chatId } });
    } catch (error) {
      throw sendFailure(error?.response?.status, error?.response?.data?.code);
    }
    if (response?.code !== 0 || !isId(response.data?.message_id)) throw sendFailure(undefined, response?.code);
    return { messageId: response.data.message_id };
  };
}

export function makeFeishuConnector({ appId, appSecret, createWorkflow, sdk = Lark, log = console.log, intervalMs = 1000 }) {
  if (!hasCredentials(appId, appSecret)) {
    throw new Error('请设置有效的 FEISHU_APP_ID 和 FEISHU_APP_SECRET。');
  }
  const options = { appId, appSecret, logger: sdkLogger, domain: sdk.Domain.Feishu };
  const client = new sdk.Client(options);
  const workflow = createWorkflow({ sendMessage: makeFeishuSender(client) });
  let timer, activeDrain, stopping, lastState;
  let botOpenId, botLookup, nextBotLookupAt = 0;
  let finish;
  const done = new Promise(resolve => { finish = resolve; });
  function report(state) {
    if (state !== lastState) log(state);
    lastState = state;
  }
  function resolveBotIdentity() {
    if (botOpenId || botLookup || typeof client.request !== 'function' || Date.now() < nextBotLookupAt) return;
    nextBotLookupAt = Date.now() + 60_000;
    // The SDK attaches the tenant token. Discovery runs alongside the websocket and never blocks event ACKs.
    botLookup = Promise.resolve().then(() => client.request({method:'GET',url:'/open-apis/bot/v3/info',timeout:6000}))
      .then(result => {
        if (result?.code === 0 && isOpenId(result.bot?.open_id)) botOpenId = result.bot.open_id;
      }).catch(ignore).finally(() => { botLookup = undefined; });
  }
  function pump() {
    if (stopping || activeDrain) return;
    resolveBotIdentity();
    activeDrain = Promise.resolve().then(() => workflow.drain())
      .catch(() => log('飞书工作队列本轮处理失败，将继续轮询。'))
      .finally(() => { activeDrain = undefined; });
  }
  const dispatcher = new sdk.EventDispatcher({ logger: sdkLogger }).register({
    'im.message.receive_v1': data => {
      const event = normalizeGroupMessage(data, appId, botOpenId);
      if (!event) return;
      if (stopping) throw new Error('接收器正在停止');
      // Returning successfully ACKs this event. A failed durable write must reach
      // the SDK so Feishu can redeliver; slow scoring and replies happen in pump().
      const receipt = workflow.receive(event);
      if (receipt?.accepted) setImmediate(pump);
    },
  });
  const ws = new sdk.WSClient({
    ...options, autoReconnect: true, handshakeTimeoutMs: 15000, wsConfig: { pingTimeout: 20 },
    onReady: () => { if (!stopping) report('飞书长连接已在线，可以在开发者后台保存订阅方式。'); },
    onReconnecting: () => { if (!stopping) report('飞书长连接已断开，正在重连。'); },
    onReconnected: () => { if (!stopping) report('飞书长连接已恢复。'); },
    onError: () => {
      if (stopping) return;
      report('飞书长连接已停止重试，请核对应用凭证和网络后重新启动。');
      void stop(1);
    },
  });
  async function stop(exitCode = 0) {
    if (stopping) return done;
    stopping = true;
    clearInterval(timer);
    try {
      ws.close({ force: true });
      await activeDrain;
      await workflow.close();
    } catch {
      exitCode = 1;
      log('飞书接收器关闭时出现错误。');
    } finally {
      finish(exitCode);
    }
    return done;
  }
  async function start() {
    if (timer || stopping) return;
    report('正在建立飞书长连接。');
    resolveBotIdentity();
    timer = setInterval(pump, intervalMs);
    try {
      await ws.start({ eventDispatcher: dispatcher });
    } catch {
      report('飞书长连接启动失败，请核对应用凭证和网络后重新启动。');
      await stop(1);
    }
  }
  return { start, stop, done, getStatus: () => ws.getConnectionStatus().state };
}

async function main() {
  const { FEISHU_APP_ID: appId, FEISHU_APP_SECRET: appSecret } = process.env;
  if (!hasCredentials(appId, appSecret)) {
    console.error('请在 build/analyst-replay/feishu-app.env 或进程环境中配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET。');
    return 1;
  }
  // This standalone connector owns its HTTP client process. Bound both the token
  // exchange and message calls, including during a graceful shutdown.
  Lark.defaultHttpInstance.defaults.timeout = 15000;
  Lark.defaultHttpInstance.defaults.maxRedirects = 0;
  const { createLocalFeishuWorkflow } = await import('./feishu-local.mjs');
  const connector = makeFeishuConnector({ appId, appSecret, createWorkflow: createLocalFeishuWorkflow });
  const stop = () => { void connector.stop(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await connector.start();
    return await connector.done;
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => { process.exitCode = code; }).catch(() => {
    console.error('飞书接收器初始化失败，请检查本地数据目录、实例占用和依赖。');
    process.exitCode = 1;
  });
}
