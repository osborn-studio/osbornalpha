import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openTradeStore } from './trade-store.mjs';
import { openRegistrationDesk } from './registration-store.mjs';
import { loadMarketWindow } from './market-data.mjs';
import { renderLauncher } from './launcher.mjs';
import { openAnalystProfiles } from './analyst-profiles.mjs';
import { FeishuBindingError, openFeishuAdmin } from './feishu-admin.mjs';
import { initialState, applyAction, viewState } from './engine.mjs';
import {
  setupDelivery, configureWebhook, configureAppDelivery, getWebhookInfo, enqueue, getNotifications,
  retryDelivery, deliverPending, recordMockReceipt,
} from './delivery.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const defaultDirectory = resolve(here, '../../build/analyst-replay');
const directory = resolve(process.env.REPLAY_DATA_DIR || defaultDirectory);
const port = Number(process.env.REPLAY_PORT ?? 4317);
const publicOrigin = readPublicOrigin(process.env.REPLAY_PUBLIC_URL);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('REPLAY_PORT 必须是有效端口');
if (publicOrigin && !process.env.REPLAY_DATA_DIR?.trim()) throw new Error('共享演示需要单独的 REPLAY_DATA_DIR。');
mkdirSync(directory, { recursive: true, mode: 0o700 });
if (publicOrigin) {
  const sharedDirectory = realpathSync(directory);
  const localDirectory = existsSync(defaultDirectory) ? realpathSync(defaultDirectory) : defaultDirectory;
  const separation = relative(localDirectory, sharedDirectory);
  if (!separation || (!isAbsolute(separation) && separation !== '..' && !separation.startsWith('..' + sep))) {
    throw new Error('共享演示的 REPLAY_DATA_DIR 须位于默认本地演示目录之外。');
  }
}
// One sender owns recovery of in-flight webhooks for this data directory.
// SQLite releases this lock even if the process exits during a delivery.
const instanceLock = new DatabaseSync(join(directory, 'instance.sqlite'));
try {
  instanceLock.exec('BEGIN EXCLUSIVE');
} catch (e) {
  if (e.errcode !== 5) throw e;
  console.error('此数据目录已有演示服务在运行，可直接打开其中的 start.html。');
  process.exit(1);
}
const dbPath = join(directory, 'replay.sqlite');
const db = new DatabaseSync(dbPath);
chmodSync(dbPath, 0o600);
db.exec(`PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
  PRAGMA busy_timeout=3000;
  CREATE TABLE IF NOT EXISTS runs (
    seq INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL, state TEXT NOT NULL
  );`);
setupDelivery(db);
if (publicOrigin && getWebhookInfo(db).mode === 'app') {
  throw new Error('正在使用本机飞书应用播报的数据目录不能作为共享演示启动。');
}
const replayRoles = ['A','B','PM'];
const newId = () => 'OA-' + randomBytes(5).toString('hex').toUpperCase();
const createRun = () => db.prepare('INSERT INTO runs(id, revision, state) VALUES (?, 0, ?)').run(newId(), JSON.stringify(initialState()));
const latest = () => db.prepare('SELECT * FROM runs ORDER BY seq DESC LIMIT 1').get();
if (!latest()) createRun();
const secretsFile = join(directory, 'role-keys.json');
let keys;
try {
  keys = JSON.parse(readFileSync(secretsFile, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  keys = Object.fromEntries(replayRoles.map(role => [role, randomBytes(32).toString('base64url')]));
  writeFileSync(secretsFile, JSON.stringify(keys), { mode: 0o600, flag: 'wx' });
}
for (const role of replayRoles) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(keys[role] || '')) throw new Error('角色密钥文件无效');
}
function sameKey(a, b) {
  const left = Buffer.from(a || '');
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function err(status, message) {
  return Object.assign(new Error(message), { status });
}
function readPublicOrigin(config) {
  if (!config) return null;
  const publicUrl = URL.parse(config);
  if (publicUrl?.protocol !== 'https:' || publicUrl.href !== publicUrl.origin + '/') {
    throw new Error('REPLAY_PUBLIC_URL 须为 HTTPS 站点地址，且不含路径、查询参数、片段或凭据。');
  }
  return publicUrl;
}
function requestIngress(req, actualPort) {
  const host = req.headers.host?.toLowerCase();
  const loopback = host === '127.0.0.1:' + actualPort || host === 'localhost:' + actualPort;
  const throughPublicHost = host && host === publicOrigin?.host;
  if (!loopback && !throughPublicHost) throw err(403,'请求主机无效');
  const origin = req.headers.origin;
  // A tunnel may forward the configured public Host unchanged or rewrite it to
  // the loopback host. The configured origin is the only public origin accepted.
  if (origin !== undefined && origin !== publicOrigin?.origin && !(loopback && origin === 'http://' + host)) {
    throw err(403,'请求来源无效');
  }
  if (!req.url?.startsWith('/') || req.url.startsWith('//')) throw err(400,'请求路径无效');
  const forwarded = Object.keys(req.headers).some(header =>
    header === 'forwarded' || header.startsWith('x-forwarded-') || header === 'cf-connecting-ip');
  const local = loopback && req.socket.remoteAddress === '127.0.0.1' && !forwarded;
  return {
    path: new URL(req.url, 'http://localhost').pathname,
    localInternal: local && origin === undefined,
    localDemoOrigin: local && !publicOrigin ? 'http://' + host : null,
  };
}
function verifyLocalDemoRequest(req, localDemoOrigin, writing) {
  if (!localDemoOrigin) throw err(404,'接口不存在');
  const site = req.headers['sec-fetch-site'];
  const origin = req.headers.origin;
  if ((site && site !== 'same-origin' && site !== 'none') ||
      (writing && (origin !== localDemoOrigin || site === 'none'))) {
    throw err(403,'请从本机演示页面操作');
  }
}
function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
async function input(req) {
  if ((req.headers['content-type'] || '').split(';')[0] !== 'application/json') throw err(415,'请使用 JSON');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 32_768) throw err(413,'请求内容过长');
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    if (data === null || Array.isArray(data) || typeof data !== 'object') throw new Error();
    return data;
  } catch { throw err(400,'JSON 格式错误'); }
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
const profiles = openAnalystProfiles(db, keys);
const feishuAdmin = openFeishuAdmin(directory, profiles.list);
const desk = openRegistrationDesk(db, transaction, loadMarketWindow, profiles.list,
  publicOrigin ? () => [] : feishuAdmin.boundAnalystRoles);
const trades = openTradeStore(db, transaction, profiles.exists);
const launcherPath = join(directory, 'start.html');

function roleNames(analysts) {
  return { ...Object.fromEntries(analysts.map(analyst => [analyst.id,analyst.display_name])), PM:'PM' };
}

function inviteUrl(token) {
  const invite = new URL('/', publicOrigin?.origin ?? base);
  invite.hash = 'key=' + token;
  return invite.href;
}

function writeLauncher() {
  const launcher = renderLauncher(publicOrigin?.origin ?? base, publicOrigin ? profiles.credentials() : {}, roleNames(profiles.list()));
  const temporary = launcherPath + '.' + randomUUID();
  writeFileSync(temporary, launcher, {mode:0o600,flag:'wx'});
  renameSync(temporary, launcherPath);
}

function availableAppChat(localDemoOrigin) {
  if (!localDemoOrigin) return null;
  try { return feishuAdmin.boundChatId(); }
  catch { return null; }
}

function currentView(role, localDemoOrigin) {
  const run = latest();
  const webhook = getWebhookInfo(db);
  const analysts = profiles.list();
  const replayRole = replayRoles.includes(role) ? role : 'observer';
  return {
    ...viewState(JSON.parse(run.state), replayRole), role, sessionId: run.id, revision: run.revision,
    analysts, names:roleNames(analysts), replayParticipant:replayRole !== 'observer',
    registrations: desk.view(role), portfolio: trades.view(role),
    notifications: getNotifications(db, run.id, desk.sessionId),
    deliveryMode: webhook.mode, ...(role === 'PM' ? {webhook:{...webhook,appAvailable:Boolean(availableAppChat(localDemoOrigin))}} : {}),
  };
}
const assets = new Map([
  ['/', ['index.html','text/html']], ['/app.js', ['app.js','text/javascript']],
  ['/beijing-time.mjs',['beijing-time.mjs','text/javascript']], ['/trades.js',['trades.js','text/javascript']],
  ['/feishu-bindings.js',['feishu-bindings.js','text/javascript']],
  ['/trades.css',['trades.css','text/css']], ['/analysts.js',['analysts.js','text/javascript']],
  ['/registrations.js',['registrations.js','text/javascript']], ['/styles.css',['styles.css','text/css']], ['/ledger.js',['ledger.js','text/javascript']],
]);
const mockToken = randomBytes(32).toString('base64url');
let base;
let worker;
function kick() {
  if (worker || !base) return;
  worker = Promise.resolve().then(() => deliverPending(db, {
    localUrl: base + '/internal/mock-feishu', localToken: mockToken, publicUrl: publicOrigin?.origin,
  }))
    .catch(() => console.error('通知投递任务失败，将按队列状态重试'))
    .finally(() => { worker = null; });
}
function change(role, data) {
  if (!replayRoles.includes(role)) throw err(403,'双人回放的操作仅限分析师 A、分析师 B 和 PM。');
  transaction(() => {
    const run = latest();
    const state = JSON.parse(run.state);
    const { phase, round } = viewState(state, role);
    if (data.sessionId !== run.id || data.phase !== phase || data.round !== round) {
      throw err(409,'场次或进度已变化，请查看最新状态');
    }
    if (data.kind === 'newSession') {
      if (role !== 'PM') throw err(403,'仅 PM 可新建场次');
      if (!['complete','returned'].includes(phase)) throw err(409,'请先完成本场验收');
      createRun();
      return;
    }
    const events = applyAction(state, role, data.kind, data);
    const next = run.revision + 1;
    db.prepare('UPDATE runs SET revision=?, state=? WHERE id=?').run(next, JSON.stringify(state), run.id);
    events.forEach((event, index) => enqueue(db, run.id, run.id + '-' + next + '-' + (index + 1), event));
  });
}
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  try {
    const {path, localInternal, localDemoOrigin} = requestIngress(req, server.address().port);
    const asset = assets.get(path);
    if (req.method === 'GET' && asset) {
      const bytes = readFileSync(join(here,'public',asset[0]));
      res.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8' });
      res.end(bytes);
      return;
    }
    if (req.method === 'POST' && path === '/internal/mock-feishu') {
      if (!localInternal || !sameKey(req.headers['x-demo-mock-token'], mockToken)) throw err(403,'本地接收器凭据无效');
      recordMockReceipt(db, await input(req));
      return json(res,200,{code:0,msg:'success'});
    }
    if (req.method === 'GET' && path === '/api/demo/roles') {
      verifyLocalDemoRequest(req, localDemoOrigin, false);
      const roles = profiles.list().map(({id, display_name, kind}) => ({id, display_name, kind}));
      return json(res,200,{roles:[...roles, {id:'PM',display_name:'PM',kind:'pm'}]});
    }
    if (req.method === 'POST' && path === '/api/demo/role') {
      verifyLocalDemoRequest(req, localDemoOrigin, true);
      const {role} = await input(req);
      if (role !== 'PM' && !profiles.exists(role)) throw err(404,'找不到这个演示身份');
      return json(res,200,{key:profiles.credentials()[role]});
    }
    const bindingAdmin = path === '/api/feishu/bindings';
    if (bindingAdmin) verifyLocalDemoRequest(req, localDemoOrigin, req.method !== 'GET');
    const bearer = (req.headers.authorization || '').match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    const role = replayRoles.find(r => sameKey(bearer, keys[r])) ?? profiles.authenticate(bearer);
    if (!role) throw err(401,'请使用对应角色的邀请链接或访问码登录');
    if (bindingAdmin) {
      if (role !== 'PM') throw err(403,'仅 PM 可管理飞书配对。');
      if (req.method === 'GET') return json(res,200,feishuAdmin.view());
      if (req.method === 'POST') return json(res,200,feishuAdmin.assign(await input(req)));
      throw err(404,'接口不存在');
    }
    if (req.method === 'GET' && path === '/api/state') return json(res,200,currentView(role,localDemoOrigin));
    if (req.method === 'GET' && path === '/api/analysts/invites') {
      if (role !== 'PM') throw err(403,'仅 PM 可查看分析师邀请。');
      const credentials = profiles.credentials();
      const invites = profiles.list().map(profile => ({profile,inviteUrl:inviteUrl(credentials[profile.id])}));
      return json(res,200,{invites});
    }
    if (req.method !== 'POST') throw err(404,'接口不存在');
    const data = await input(req);
    if (path === '/api/analysts') {
      if (role !== 'PM') throw err(403,'仅 PM 可添加分析师。');
      const {profile,token} = profiles.create(data);
      try { writeLauncher(); }
      catch { console.error('分析师已创建，未能刷新本机邀请页。可从 PM 页面复制邀请链接。'); }
      return json(res,201,{profile,inviteUrl:inviteUrl(token)});
    }
    if (path === '/api/trades') return json(res,201,{trade:trades.create(role, data)});
    if (path === '/api/registrations' || path === '/api/registrations/refresh') {
      let fromFeishu = false;
      if (path === '/api/registrations' && req.headers['x-demo-registration-source'] === 'feishu-app') {
        verifyLocalDemoRequest(req,localDemoOrigin,true);
        if (!feishuAdmin.approvedRegistration(role,data)) throw err(403,'无法核对已确认的飞书提案。');
        fromFeishu = true;
      }
      const entry = path === '/api/registrations' ? await desk.register(role,data,{fromFeishu}) : await desk.refresh(role,data.id);
      kick();
      return json(res,200,{entry});
    }
    if (path === '/api/registrations/review') {
      const review = desk.review(role, data);
      kick();
      return json(res,200,{review});
    }
    if (path === '/api/action') {
      change(role, data);
    } else if (['/api/webhook', '/api/webhook/test', '/api/webhook/retry'].includes(path)) {
      if (role !== 'PM') throw err(403,'仅 PM 可管理群播报');
      const run = latest();
      if (path === '/api/webhook') {
        if (data.mode === 'app') {
          verifyLocalDemoRequest(req,localDemoOrigin,true);
          configureAppDelivery(db,feishuAdmin.boundChatId());
        } else configureWebhook(db,data.mode === 'local' ? {url:''} : {url:data.url,secret:data.secret});
      }
      if (path === '/api/webhook/test') enqueue(db,run.id,run.id + '-TEST-' + randomUUID().slice(0,8),
        { title:'Osborn Alpha · 连通测试', text:'这是 PM 发起的一条连通测试。场次 ' + run.id });
      if (path === '/api/webhook/retry') {
        const entry = db.prepare('SELECT session_id FROM replay_outbox WHERE event_id=? AND session_id IN (?,?)')
          .get(typeof data.id === 'string' ? data.id : '', run.id, desk.sessionId);
        if (!entry) throw err(404,'找不到此场次的播报。');
        retryDelivery(db,entry.session_id,data.id,availableAppChat(localDemoOrigin));
      }
    } else throw err(404,'接口不存在');
    kick();
    json(res,200,currentView(role,localDemoOrigin));
  } catch (e) {
    const status = Number(e.status || e.statusCode || 500);
    if (status >= 500) console.error('处理请求时出现内部错误', e.name);
    const message = e instanceof FeishuBindingError ? e.message : status === 502 || status === 503 || status === 504
      ? '未能取得可核对的历史行情，请检查数据源或稍后重试。'
      : status < 500 ? e.message : '请求处理失败，请重试';
    if (!res.headersSent) json(res,status,{ error:message });
    else res.end();
  }
});
server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? '端口已占用，请访问已有 Demo 或设置 REPLAY_PORT' : e.message);
  process.exit(1);
});
server.listen(port,'127.0.0.1',() => {
  base = 'http://127.0.0.1:' + server.address().port;
  const shareBase = publicOrigin?.origin ?? base;
  writeLauncher();
  console.log('Osborn Alpha 本地演示 ' + base + '\n角色入口 ' + launcherPath +
    (publicOrigin ? '\n共享站点 ' + shareBase : ''));
  kick();
});
const timer = setInterval(kick, 750);
timer.unref();
function stop() {
  clearInterval(timer);
  server.close(() => { db.close(); instanceLock.close(); process.exit(0); });
}
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
