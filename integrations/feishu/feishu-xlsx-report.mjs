// The Excel simulation report (飞书模拟组合报告): run the Python generator, store the workbook on the
// formal site, and post a card through the group's custom bot. The custom bot webhook is outside the
// app's monthly OpenAPI quota and cannot carry files, so the card links to the stored workbook
// (through the shared login link when FEISHU_SHARED_LOGIN_URL is set).
import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readReportDelivery} from './feishu-report-delivery.mjs';
import {createSiteLinks} from './feishu-shared-link.mjs';
import {signWebhook, validFeishuWebhook} from './feishu-webhook.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const cardLimit = 18000; // the custom bot rejects bodies over 20 KB

export const exportCommand = /^(?:请|帮我|麻烦)?\s*(?:导出|生成|发|出)\s*(?:一下|一份|一个)?\s*(?:今天的|今日|最新的?)?\s*(?:excel|xlsx|报表|表格|模拟组合报告|组合报表|模拟报表)\s*[。!！]?$/iu;

export const isExportCommand = text => typeof text === 'string' && exportCommand.test(text.trim());

/** Beijing date (YYYY-MM-DD), weekday (1 = Monday) and minutes after midnight. */
export function beijingClock(date) {
  const shifted = new Date(date.getTime() + 8 * 3600 * 1000);
  return {date: shifted.toISOString().slice(0, 10), weekday: shifted.getUTCDay() || 7,
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes()};
}

const money = value => typeof value === 'number' ? '¥' + Math.round(value).toLocaleString('en-US') : '—';
const pct = (value, digits) => typeof value === 'number' ? (value * 100).toFixed(digits) + '%' : '—';
const count = value => typeof value === 'number' ? String(Math.round(value)) : '—';
const plain = text => String(text).replace(/[*_~`<>[\]]/gu, ' ');

export function reportCard({tradeDate, groups}, {downloadUrl, siteUrl}) {
  const [pooled, ...analysts] = groups;
  const lines = [
    `**全组**　Long ${pct(pooled.long, 4)}｜持仓 ${count(pooled.held)} 只｜名义 ${money(pooled.notional)}`,
    `未实现 ${money(pooled.unrealized)}｜已实现 ${money(pooled.realized)}`,
    `建议：有效 ${count(pooled.valid)}｜已采纳 ${count(pooled.adopted)}｜已撤回 ${count(pooled.withdrawn)}｜模拟成交 ${count(pooled.trades)} 笔`,
    `命中率 ${pct(pooled.hitRate, 1)}｜平均评分 ${typeof pooled.score === 'number' ? pooled.score.toFixed(1) : '—'}`,
    '',
    ...analysts.map(a => `**${plain(a.label)}**　Long ${pct(a.long, 4)}｜持仓 ${count(a.held)} 只｜未实现 ${money(a.unrealized)}｜命中率 ${pct(a.hitRate, 1)}`),
    '',
    '数据来自正式系统；Excel 含 summary、Trade、建议台账与说明页。',
  ];
  const button = (text, url, type) => ({tag: 'button', text: {tag: 'plain_text', content: text}, type,
    behaviors: [{type: 'open_url', default_url: url}]});
  return {msg_type: 'interactive', card: {
    schema: '2.0',
    header: {title: {tag: 'plain_text', content: `飞书模拟组合报告 · ${tradeDate}`}, template: 'blue'},
    body: {elements: [
      {tag: 'markdown', content: lines.join('\n')},
      button('下载 Excel', downloadUrl, 'primary'),
      button('打开正式站', siteUrl, 'default'),
    ]},
  }};
}

async function postWebhook(config, payload, fetchImpl) {
  const body = JSON.stringify(signWebhook(payload, config.secret));
  if (Buffer.byteLength(body, 'utf8') > cardLimit) throw Error('报表卡片超出群机器人大小限制。');
  const response = await fetchImpl(config.url, {method: 'POST', headers: {'content-type': 'application/json'}, body,
    redirect: 'error', signal: AbortSignal.timeout(10000)});
  const result = await response.json().catch(() => null);
  const code = result?.code ?? result?.StatusCode;
  if (!response.ok || code !== 0) throw Error('群机器人拒绝了报表消息' + (Number.isInteger(code) ? `（${code}）` : '') + '。');
}

function defaultRunPython(args, {env, python}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(python, ['run.py', ...args], {cwd: join(here, 'xlsx-report'), env, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 5 * 60 * 1000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      const last = stdout.trim().split('\n').pop();
      try { resolvePromise({code, result: JSON.parse(last)}); } catch { reject(Error(`报表脚本没有返回结果（退出码 ${code}）：${stderr.trim().slice(-300)}`)); }
    });
  });
}

export function createXlsxReporter({directory, env = process.env, runPython = defaultRunPython, fetchImpl = fetch,
  readDelivery = readReportDelivery, now = () => new Date(), log = console.log} = {}) {
  const outDir = resolve(env.FEISHU_REPORT_OUT_DIR || join(root, 'build', 'reports', 'xlsx'));
  const ledger = join(outDir, 'sent.json');
  const python = env.FEISHU_REPORT_PYTHON || join(root, 'build', 'feishu', 'xlsx-venv', 'bin', 'python');
  const origin = String(env.FEISHU_SIMULATION_ORIGIN || '').replace(/\/+$/u, '');
  let running = null, lastOnDemand = 0;
  const seenEvents = [];

  const sent = () => { try { return JSON.parse(readFileSync(ledger, 'utf8')); } catch { return {}; } };
  const markSent = (date, name) => {
    mkdirSync(outDir, {recursive: true});
    writeFileSync(ledger, JSON.stringify({...sent(), [date]: name}, null, 1));
  };
  function webhook() {
    const config = readDelivery(directory);
    if (config?.mode !== 'webhook' || !validFeishuWebhook(config.url)) throw Error('群机器人播报未配置为 webhook。');
    return config;
  }
  const notify = (text, config) => postWebhook(config, {msg_type: 'text', content: {text: '正式报表：' + text}}, fetchImpl);

  async function upload(file, name) {
    const response = await fetchImpl(`${origin}/api/integrations/feishu/reports/${encodeURIComponent(name)}`, {
      method: 'PUT', body: readFileSync(file),
      headers: {authorization: 'Bearer ' + env.FEISHU_SIMULATION_INGEST_TOKEN, 'content-type': XLSX},
      redirect: 'error', signal: AbortSignal.timeout(30000)});
    const body = await response.json().catch(() => null);
    if (!response.ok || typeof body?.path !== 'string') throw Error(`正式站未保存报表（HTTP ${response.status}）。`);
    return body.path;
  }
  const siteLinks = createSiteLinks(env);
  function links(path) {
    if (siteLinks.active) return {downloadUrl: siteLinks.link(path), siteUrl: siteLinks.link('/analyst')};
    return {downloadUrl: origin + path, siteUrl: origin + '/analyst'};
  }

  async function produce({scheduled, date}) {
    const config = webhook();
    const clock = beijingClock(now());
    if (scheduled) {
      // launchd fires in local time; only the first run in the Beijing weekday window after the close sends.
      if (clock.weekday > 5 || clock.minutes < 16 * 60 + 30 || sent()[clock.date]) return {status: 'skipped'};
    }
    const args = ['--out-dir', outDir, ...(scheduled ? ['--scheduled'] : []), ...(date ? ['--date', date] : [])];
    const {result} = await runPython(args, {env, python});
    if (result.status === 'nothing') {
      if (!scheduled) await notify('今天还没有可汇总的正式记录。', config);
      return {status: 'nothing'};
    }
    if (result.status !== 'ok') {
      const reason = result.status === 'verify_failed' ? `核对未通过（${result.problems.length} 处），已留在本机待查` : (result.error || '生成失败');
      await notify(`${result.tradeDate || clock.date} 的报表未发送：${reason}。`, config);
      return {status: result.status, error: reason};
    }
    const path = await upload(result.file, result.name);
    await postWebhook(config, reportCard(result, links(path)), fetchImpl);
    if (scheduled) markSent(result.tradeDate, result.name);
    log(`飞书模拟组合报告已发送：${result.name}`);
    return {status: 'sent', name: result.name};
  }

  function run(options = {}) {
    if (running) return running.then(() => ({status: 'busy'}));
    running = produce(options).catch(error => {
      log('飞书模拟组合报告失败：' + error.message);
      return {status: 'error', error: error.message};
    }).finally(() => { running = null; });
    return running;
  }

  /** True when the event is a bound member asking the bot for the workbook; starts it in the background. */
  function handle(event, bindings) {
    if (!event?.directedToBot || event.chatId !== bindings.chatId || !isExportCommand(event.text)) return false;
    const member = Object.hasOwn(bindings.analystBySender ?? {}, event.senderId) || (bindings.approverIds ?? []).includes(event.senderId);
    if (!member) return false;
    if (seenEvents.includes(event.eventId)) return true; // Feishu redelivery
    seenEvents.push(event.eventId);
    if (seenEvents.length > 200) seenEvents.shift();
    const at = now().getTime();
    if (!running && at - lastOnDemand >= 60 * 1000) {
      lastOnDemand = at;
      void run();
    }
    return true;
  }

  return {run, handle, outDir, ready: () => existsSync(python)};
}
