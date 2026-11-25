#!/usr/bin/env node
// osbornalpha journey driver. Drives the running instance like a user:
// browser journeys over CDP (headless Chrome started by launch.sh), API journeys over plain HTTP.
// Every journey writes screenshots / response bodies into the evidence dir and appends to results.json.
//
// Usage (from anywhere; resolves @playwright/test from the repo's node_modules):
//   node .cursor/skills/verify-osbornalpha/scripts/drive.mjs <journey...|all>
// Journeys: landing watchlist stock quote-api auth-gate macro intel-hub   ("all" = every journey valid for the current mode)
// Env: OSB_PORT, OSB_CDP_PORT, OSB_RUN_DIR (same defaults as env.sh); OSB_EVIDENCE_DIR overrides the dir launch.sh chose.
// Exit code: 0 if every check passed, 1 otherwise. Never weakens a check to pass.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const { chromium } = createRequire(path.join(repoRoot, 'package.json'))('@playwright/test');

const PORT = process.env.OSB_PORT ?? '3107';
const CDP = `http://127.0.0.1:${process.env.OSB_CDP_PORT ?? '9333'}`;
const BASE = `http://127.0.0.1:${PORT}`;
const RUN_DIR = process.env.OSB_RUN_DIR ?? `/tmp/osbornalpha-verify-${PORT}`;
const MODE = fs.existsSync(`${RUN_DIR}/mode`) ? fs.readFileSync(`${RUN_DIR}/mode`, 'utf8').trim() : 'guest';
const EVIDENCE = process.env.OSB_EVIDENCE_DIR
  ?? (fs.existsSync(`${RUN_DIR}/evidence_dir`) ? fs.readFileSync(`${RUN_DIR}/evidence_dir`, 'utf8').trim() : null);
if (!EVIDENCE) { console.error('drive: no evidence dir (run scripts/launch.sh first or set OSB_EVIDENCE_DIR)'); process.exit(2); }
fs.mkdirSync(EVIDENCE, { recursive: true });
const verifierSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const productShaFile = path.join(RUN_DIR, 'product_sha');
const productSha = fs.existsSync(productShaFile) ? fs.readFileSync(productShaFile, 'utf8').trim() : null;


const results = [];
let current;
// `upstream: true` marks a failure whose cause the driver proved is an external data provider (e.g. /api/kline → 503
// provider_unavailable). It is still a FAIL and still counts against the exit code; the flag only labels it in the summary.
function check(name, pass, detail = '', { upstream = false } = {}) {
  const up = !pass && upstream;
  current.checks.push({ name, pass: !!pass, detail: String(detail).slice(0, 400), ...(up ? { upstreamUnavailable: true } : {}) });
  console.log(`  ${pass ? 'PASS' : up ? 'FAIL[upstream-unavailable]' : 'FAIL'} ${name}${detail ? ` — ${String(detail).slice(0, 160)}` : ''}`);
}
const save = (name, data) => fs.writeFileSync(path.join(EVIDENCE, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
const shot = (page, name) => page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: false });
async function getJson(url) {
  const r = await fetch(BASE + url, { redirect: 'manual', signal: AbortSignal.timeout(60_000) });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
  return { status: r.status, location: r.headers.get('location'), body };
}

let browser;
async function newCtx(locale = 'zh-CN') {
  browser ??= await chromium.connectOverCDP(CDP);
  // Fresh incognito-like context per journey = fresh guest (empty localStorage).
  return browser.newContext({ locale, viewport: { width: 1440, height: 900 } });
}

// Shared research chain (#254; 02 href is `/intel/industries?scheme=sic` since #266, `src/components/research-ui/{chain.ts,ResearchChain.tsx}`), rendered by the (app) layout
// under the top bar on /macro, /intel/* and /stock/*. Guest has no service-role Supabase, so the foreign-research public
// flag reads false (#252/#260) and so does the topics public flag (#278, `src/lib/topics/public-flag.ts`: off unless
// TOPICS_ENABLED=1 plus a service-role settings row, or TOPICS_E2E_FIXTURES=1 — launch.sh pins both empty):
// steps 01-03 are links, 04 外资研报 and 05 专题研究 are "not served" spans with no link.
const CHAIN = {
  zh: { label: '研究链', notServed: '未服务', steps: { macro: '宏观策略', industry: '行业研究', company: '公司研究', foreign: '外资研报', topic: '专题研究' } },
  en: { label: 'Research chain', notServed: 'Not served', steps: { macro: 'Macro strategy', industry: 'Industry research', company: 'Company research', foreign: 'Foreign research', topic: 'Topic research' } },
};
const CHAIN_LINKS = { macro: '/macro', industry: '/intel/industries?scheme=sic', company: '/intel/companies' };
const squash = (t) => t.replace(/\s+/g, '');  // innerText of the badge spans has no separators
async function checkResearchChain(page, tag, lang, currentId) {
  const L = CHAIN[lang];
  const nav = page.getByRole('navigation', { name: L.label, exact: true });
  await nav.waitFor({ timeout: 20_000 }).catch(() => {});
  const navCount = await nav.count();
  const links = [];
  for (const [id, href] of Object.entries(CHAIN_LINKS)) {
    const a = nav.locator(`a[href="${href}"]`); const n = navCount === 1 ? await a.count() : 0;
    links.push({ id, n, text: n === 1 ? squash(await a.innerText()) : '', current: n === 1 ? await a.getAttribute('aria-current') : null });
  }
  const linksOk = links.every((l) => l.n === 1 && l.text.includes(squash(L.steps[l.id])) && l.current === (l.id === currentId ? 'page' : null));
  const notServed = navCount === 1 ? (await nav.locator('[data-chain-state="notServed"]').allInnerTexts()).map(squash) : [];
  const closedOk = notServed.length === 2 && notServed[0].includes(squash(L.steps.foreign)) && notServed[1].includes(squash(L.steps.topic))
    && notServed.every((t) => t.includes(squash(L.notServed)))
    && navCount === 1 && await nav.locator('a[href^="/intel/foreign-research"], a[href^="/intel/topics"]').count() === 0;
  check(`${tag}: research chain "${L.label}" — 01-03 linked (${currentId} current), 04/05 "${L.notServed}" without links`,
    navCount === 1 && linksOk && closedOk, JSON.stringify({ navCount, links, notServed }));
}

const journeys = {
  async landing() {
    const ctx = await newCtx('zh-CN'); const page = await ctx.newPage();
    const r = await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    check('GET / → 200', r?.status() === 200, r?.status());
    check('zh title contains "AI 投资监控工作台"', /AI 投资监控工作台/.test(await page.title()), await page.title());
    check('<html lang="zh-CN">', (await page.locator('html').getAttribute('lang')) === 'zh-CN');
    check('brand "osbornalpha" visible', await page.getByText('osbornalpha').first().isVisible());
    await shot(page, 'landing-zh');
    const en = await page.goto(BASE + '/en', { waitUntil: 'networkidle' });
    check('GET /en → 200', en?.status() === 200, en?.status());
    check('en title contains "AI Investment Cockpit"', /AI Investment Cockpit/.test(await page.title()), await page.title());
    check('<html lang="en">', (await page.locator('html').getAttribute('lang')) === 'en');
    await shot(page, 'landing-en');
    const d = await page.goto(BASE + '/design', { waitUntil: 'networkidle' });
    check('GET /design → 200 with "V3 Design System"', d?.status() === 200 && await page.getByText('V3 Design System').first().isVisible());
    await shot(page, 'design');
    await ctx.close();
  },

  async watchlist() {
    if (MODE !== 'guest') { check('watchlist journey needs guest mode', false, `mode=${MODE}`); return; }
    const ctx = await newCtx('zh-CN'); const page = await ctx.newPage();
    const TICKER = '300750.SZ', NAME = '宁德时代';
    await page.goto(BASE + '/watchlist', { waitUntil: 'networkidle' });
    // The 访客模式 banner only renders when Supabase IS configured and nobody is signed in; in guest
    // mode (Supabase unset) there is no banner, so assert the page itself instead.
    check('watchlist page heading "📋 股票池" visible', await page.getByText('📋 股票池').first().isVisible());
    const before = await page.evaluate(() => localStorage.getItem('stock-monitor:watchlist:v2'));
    check(`${TICKER} not in the default guest watchlist`, !(before ?? '').includes(TICKER) && await page.locator(`a[href="/stock/${TICKER}"]`).count() === 0);
    await shot(page, 'watchlist-1-initial');
    await page.getByRole('button', { name: '📋 看板' }).click();
    await page.getByRole('button', { name: '＋ 加入股票' }).first().click();
    const input = page.getByPlaceholder(/代码 \/ 名称/);
    await input.fill('300750');
    const result = page.getByRole('button', { name: new RegExp(`${NAME}.*${TICKER.replace('.', '\\.')}`) }).first();
    await result.waitFor({ timeout: 20_000 }).catch(() => {});
    check(`search "300750" offers ${NAME} ${TICKER}`, await result.isVisible());
    await shot(page, 'watchlist-2-search');
    await result.click();
    const card = page.locator(`a[href="/stock/${TICKER}"]`);
    await card.first().waitFor({ timeout: 10_000 }).catch(() => {});
    check(`card for ${TICKER} rendered exactly once`, await card.count() === 1, await card.count());
    check('post-add insight panel shown', await page.getByLabel(`已开始监控 ${TICKER}`).isVisible().catch(() => false));
    const stored = await page.evaluate(() => localStorage.getItem('stock-monitor:watchlist:v2'));
    save('watchlist-localStorage-after-add.json', stored ?? 'null');
    check(`localStorage stock-monitor:watchlist:v2 contains ${TICKER}`, (stored ?? '').includes(TICKER));
    // A live quote for the new ticker should arrive (batch quotes refetch when the ticker set changes).
    // Kanban card price sits OUTSIDE the <a href=/stock/..> link, so read it from the post-add panel and the table.
    const insight = page.getByLabel(`已开始监控 ${TICKER}`);
    let insightText = '';
    for (let i = 0; i < 40; i++) { insightText = await insight.innerText().catch(() => ''); if (/当前(涨幅|跌幅|波动)/.test(insightText)) break; await page.waitForTimeout(1000); }
    save('watchlist-post-add-insight.txt', insightText);
    check('post-add panel switches from "行情暂不可用" to a live move within 40s', /当前(涨幅|跌幅|波动)/.test(insightText), insightText.replace(/\s+/g, ' '));
    await shot(page, 'watchlist-3-added');
    await page.getByRole('button', { name: '📊 表格' }).click();
    const row = page.locator('tr', { hasText: TICKER }).first();
    const rowText = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
    check(`table view row for ${TICKER} shows a ¥ price`, /¥\d/.test(rowText), rowText);
    await shot(page, 'watchlist-3b-table');
    await page.getByRole('button', { name: '📋 看板' }).click();
    await page.reload({ waitUntil: 'networkidle' });
    check(`${TICKER} persists after reload`, await page.locator(`a[href="/stock/${TICKER}"]`).count() === 1);
    // Duplicate add is refused (toast), not added twice.
    await page.getByRole('button', { name: '＋ 加入股票' }).nth(1).click();
    await page.getByPlaceholder(/代码 \/ 名称/).fill('300750');
    const again = page.getByRole('button', { name: new RegExp(`${NAME}.*${TICKER.replace('.', '\\.')}`) }).first();
    await again.waitFor({ timeout: 20_000 }).catch(() => {});
    await again.click().catch(() => {});
    const dupToast = await page.getByText(`${TICKER} 已经在股票池中`).first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
    check('duplicate add shows "已经在股票池中" toast', dupToast);
    check(`still exactly one ${TICKER} card after duplicate attempt`, await page.locator(`a[href="/stock/${TICKER}"]`).count() === 1);
    await shot(page, 'watchlist-4-duplicate');
    await ctx.close();
  },

  async stock() {
    const ctx = await newCtx('en-US'); const page = await ctx.newPage();
    const T = '00700.HK';
    const klines = [];
    let liveQuote = null;
    page.on('response', async (r) => {
      const u = new URL(r.url());
      if (u.origin !== BASE) return;
      if (u.pathname === '/api/quote/batch' && r.status() === 200) {
        try {
          const quote = (await r.json()).quotes?.[T];
          if (typeof quote?.price === 'number' && quote.price > 0) liveQuote = quote;
        } catch {}
      }
      if (u.pathname === `/api/kline/${T}`) {
        let bars = null, error = null;
        try { const b = await r.json(); bars = b.bars?.length ?? null; error = b.error ?? null; } catch {}
        klines.push({ range: u.searchParams.get('range'), status: r.status(), bars, ...(error ? { error } : {}) });
      }
    });
    const target = `${BASE}/portfolio?s=${T}`;
    try {
      const r = await page.goto(target, { waitUntil: 'domcontentloaded' });
      check(`GET /portfolio?s=${T} → 200 at the focused portfolio URL`, r?.status() === 200 && page.url() === target, page.url());
      const chart = page.getByTestId('kline-chart');
      await chart.waitFor({ timeout: 30_000 }).catch(() => {});
      check('kline chart visible', await chart.isVisible());
      await chart.locator('canvas').first().waitFor({ timeout: 30_000 }).catch(() => {});
      const drawn = await chart.locator('canvas').first().isVisible().catch(() => false);
      // The canvas exists only when the default 1D series has bars (KlineChart.tsx). If it is missing, wait (bounded) for
      // the 1D response and say why: 503 provider_unavailable = HK minute bars have one source (Eastmoney push2his, no
      // fallback without DATAGATEWAY_* intraday config) and it was unreachable. Still a FAIL, never skipped.
      for (let i = 0; !drawn && i < 15 && !klines.some((k) => k.range === '1d'); i++) await page.waitForTimeout(1000);
      const d1 = klines.find((k) => k.range === '1d');
      const upstream = !drawn && d1?.status === 503 && d1?.error === 'provider_unavailable';
      check('chart canvas drawn', drawn, drawn ? '' : upstream
        ? 'upstream unavailable: /api/kline/00700.HK?range=1d → 503 provider_unavailable (Eastmoney push2his is the only HK 1D source; not a pass)'
        : `no canvas; 1D response ${JSON.stringify(d1 ?? 'never seen')}`, { upstream });
      const focus = page.locator('main').getByText(/Tencent|腾讯/).filter({ visible: true });
      check('live Tencent quote received with a positive price', liveQuote !== null);
      check('portfolio names the company (Tencent / 腾讯)', await focus.first().isVisible());
      await shot(page, 'stock-1-default');
      const oneYear = chart.getByRole('button', { name: '1Y', exact: true });
      const beforeClick = klines.length;
      const clicked = await oneYear.click({ timeout: 10_000 }).then(() => true, () => false);
      for (let i = 0; clicked && i < 30 && !klines.slice(beforeClick).some((k) => k.range === '1y'); i++) await page.waitForTimeout(1000);
      const y = klines.slice(beforeClick).find((k) => k.range === '1y');
      check('clicking 1Y requests /api/kline?range=1y → 200 with bars', clicked && y?.status === 200 && y.bars > 0, clicked ? JSON.stringify(y) : '1Y click failed');
      check('1Y button pressed', clicked && (await oneYear.getAttribute('aria-pressed')) === 'true');
      await page.waitForTimeout(1500);
      await shot(page, 'stock-2-1y');
      // Company Research entry without public-read Supabase config (#205): fail closed with the
      // issuer-unavailable state; never a 500, and never an invented issuer, quote or K-line.
      const cr = await page.goto(`${BASE}/stock/600519.SH`, { waitUntil: 'domcontentloaded' });
      const unavailable = page.getByText(/Issuer lookup failed \(internal\)|发行人信息读取失败（internal）/).first();
      await unavailable.waitFor({ timeout: 30_000 }).catch(() => {});
      check('guest /stock/600519.SH → 200 issuer-unavailable state (internal)', cr?.status() === 200 && await unavailable.isVisible(), `${cr?.status()} ${page.url()}`);
      check('unavailable Company Research shows no K-line fallback', (await page.getByTestId('kline-chart').count()) === 0);
      await checkResearchChain(page, 'en /stock/600519.SH', 'en', 'company');
      await shot(page, 'stock-3-company-unavailable');
    } finally {
      save('stock-kline-requests.json', klines);
      await ctx.close();
    }
  },

  async 'quote-api'() {
    const one = await getJson('/api/quote/600519.SH');
    save('api-quote-600519.SH.json', one);
    check('GET /api/quote/600519.SH → 200, numeric price > 0', one.status === 200 && one.body?.price > 0, `${one.status} price=${one.body?.price} source=${one.body?.source}`);
    check('single quote carries name/currency/updated_at', !!(one.body?.name && one.body?.currency && one.body?.updated_at));
    const tickers = ['600519.SH', '00700.HK', 'AAPL'];
    const b = await getJson(`/api/quote/batch?tickers=${tickers.join(',')}`);
    save('api-quote-batch.json', b);
    const got = Object.keys(b.body?.quotes ?? {});
    check('GET /api/quote/batch (3 markets) → 200 with all 3', b.status === 200 && tickers.every((t) => b.body.quotes[t]?.price > 0), `${b.status} keys=${got.join(',')}`);
    const bad = await getJson('/api/quote/NOTAREAL999.SH');
    save('api-quote-invalid.json', bad);
    check('unknown ticker → 4xx JSON error (not 200, not 5xx)', bad.status >= 400 && bad.status < 500, `${bad.status} ${JSON.stringify(bad.body).slice(0, 120)}`);
    const s = await getJson('/api/search?q=%E8%85%BE%E8%AE%AF');
    save('api-search-tencent.json', s);
    if (MODE === 'gate') {
      // Gate mode points Supabase at a dead port, so the security master is unreachable: search must fail closed.
      check('gate mode: search fails closed → 503 security_master_unavailable', s.status === 503 && s.body?.error === 'security_master_unavailable', `${s.status} ${JSON.stringify(s.body)}`);
    } else {
      check('GET /api/search?q=腾讯 → 00700.HK', s.status === 200 && s.body?.results?.some((x) => x.t === '00700.HK'), `${s.status} source=${s.body?.source}`);
    }
    const lim = await getJson('/api/search?q=AAPL&limit=99');
    check('search limit=99 → 400 invalid_limit', lim.status === 400 && lim.body?.error === 'invalid_limit', lim.status);
  },

  async 'auth-gate'() {
    const ctx = await newCtx('zh-CN'); const page = await ctx.newPage();
    const p = await getJson('/api/portfolio');
    save(`auth-api-portfolio-${MODE}.json`, p);
    check('GET /api/portfolio signed out → 401 JSON {error}', p.status === 401 && typeof p.body?.error === 'string', `${p.status} ${JSON.stringify(p.body)}`);
    // Feishu simulation import (#317): a server-to-server POST that is only served with FEISHU_SIMULATION_INGEST_ENABLED=true
    // (launch.sh pins it empty). Switched off, the route answers 404 not_found before reading the token or body, in both modes
    // (in gate mode /api/* is public, so the middleware lets it through to the route).
    const feishu = await fetch(BASE + '/api/integrations/feishu/simulation', { method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/json', authorization: 'Bearer verify-dummy-token-verify-dummy-token-00' },
      body: JSON.stringify({ sourceId: 'verify:1' }), signal: AbortSignal.timeout(60_000) });
    let feishuBody = null; try { feishuBody = await feishu.json(); } catch {}
    save(`auth-api-feishu-simulation-${MODE}.json`, { status: feishu.status, body: feishuBody });
    check('POST /api/integrations/feishu/simulation (ingest off) → 404 not_found', feishu.status === 404 && feishuBody?.error === 'not_found', `${feishu.status} ${JSON.stringify(feishuBody)}`);
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    check('/login shows email + password inputs', await page.locator('input[type="email"]').isVisible() && await page.locator('input[type="password"]').isVisible());
    await shot(page, `auth-login-${MODE}`);
    for (const from of ['/today', '/dashboard']) {
      const response = await getJson(from);
      check(`${from} → 308 /macro`, response.status === 308 && response.location === '/macro', `${response.status} ${response.location}`);
    }
    if (MODE === 'gate') {
      for (const [from, next] of [['/portfolio', '/portfolio'], ['/macro', '/macro'], ['/today', '/macro'], ['/dashboard', '/macro'], ['/en/portfolio', '/portfolio'], ['/watchlist', '/watchlist'],
        // #208 return-destination sanitizing: arbitrary queries are dropped; only allowlisted
        // /intel/industries selectors survive (in fixed key order), also through the /en prefix.
        ['/portfolio?s=00700.HK&token=x', '/portfolio'],
        ['/intel/industries?metric=roe&scheme=sw2021&token=x', '/intel/industries?scheme=sw2021&metric=roe'],
        ['/en/intel/industries?view=table&level=9', '/intel/industries?view=table'],
        // Research hub and topics pages (#278/#273/#275) are protected (app) pages like the rest.
        ['/intel', '/intel'], ['/intel/topics', '/intel/topics'], ['/intel/topics/ai-capex?asOf=x', '/intel/topics/ai-capex']]) {
        await page.goto(BASE + from, { waitUntil: 'networkidle' });
        const u = new URL(page.url());
        check(`${from} → /login?next=${next}`, u.pathname === '/login' && u.searchParams.get('next') === next, page.url());
      }
      const home = await page.goto(BASE + '/', { waitUntil: 'networkidle' });
      check('public / stays 200 with gate on', home?.status() === 200 && new URL(page.url()).pathname === '/');
      await shot(page, 'auth-gate-redirect');
    } else {
      const r = await page.goto(BASE + '/today', { waitUntil: 'networkidle' });
      check('guest /today reaches the Macro Workbench at /macro', r?.status() === 200
        && new URL(page.url()).pathname === '/macro'
        && await page.getByRole('heading', { name: '宏观工作台', exact: true }).isVisible(), page.url());
      await shot(page, 'auth-today-guest');
    }
    await ctx.close();
  },
};


// Guest /macro without judgments (#231): the static allocation template card replaces the judgment slot.
// Since #262 the card is a research-ui MarkCard (`section[data-mark="hypothesis"]`, tagged 假设 / Hypothesis) with no
// aria-label, so it is no longer a named region; it is found by its h2 title. The page also ends in the shared
// research footer (disclaimer + a methods link scoped to the current region).
journeys.macro = async function macro() {
  const REGIMES = { zh: ['复苏', '过热', '滞胀', '衰退'], en: ['Recovery', 'Overheat', 'Stagflation', 'Recession'] };
  const ZH = { locale: 'zh-CN', lang: 'zh', heading: '宏观工作台', title: '资产配置假设模板', staticRef: '静态参考', mark: '假设',
    disclaimer: '本页内容不构成投资建议。', methods: '方法与来源', tabsLabel: '工作台分区', tabs: ['概览', '指标', '关联', '方法与来源'] };
  const EN = { locale: 'en-US', lang: 'en', heading: 'Macro workbench', title: 'Asset allocation hypothesis template', staticRef: 'Static reference', mark: 'Hypothesis',
    disclaimer: 'Nothing on this page is investment advice.', methods: 'Methods and sources', tabsLabel: 'Workbench sections', tabs: ['Overview', 'Indicators', 'Correlation', 'Method & sources'] };
  const cases = [
    { ...ZH, path: '/macro', region: 'US', shotName: 'macro-zh' },
    { ...ZH, path: '/macro?region=CN', region: 'CN', shotName: 'macro-cn' },
    { ...EN, path: '/macro', region: 'US', shotName: 'macro-en' },
  ];
  for (const c of cases) {
    const ctx = await newCtx(c.locale); const page = await ctx.newPage();
    const tag = `${c.lang} ${c.path}`;
    const r = await page.goto(BASE + c.path, { waitUntil: 'networkidle' });
    check(`${tag} → 200 with heading "${c.heading}"`, r?.status() === 200 && new URL(page.url()).pathname === '/macro'
      && await page.getByRole('heading', { name: c.heading, exact: true }).isVisible(), `${r?.status()} ${page.url()}`);
    const title = page.getByRole('heading', { level: 2, name: c.title, exact: true });
    const card = page.locator('section').filter({ has: title });
    await card.first().waitFor({ timeout: 20_000 }).catch(() => {});
    check(`${tag}: exactly one allocation template card titled "${c.title}", marked "${c.staticRef}"`, await card.count() === 1
      && await card.isVisible() && await card.getByText(c.staticRef, { exact: true }).isVisible(), `count=${await card.count()}`);
    check(`${tag}: card is a hypothesis MarkCard (data-mark="hypothesis", tag "${c.mark}")`,
      await card.count() === 1 && await card.getAttribute('data-mark') === 'hypothesis'
      && await card.getByText(c.mark, { exact: true }).isVisible(), String(await card.count() === 1 ? await card.getAttribute('data-mark') : 'no card'));
    const rows = card.locator('ul > li');
    const names = await rows.locator('h3').allInnerTexts();
    check(`${tag}: four regimes in clock order`, JSON.stringify(names) === JSON.stringify(REGIMES[c.lang]), JSON.stringify(names));
    const sums = [];
    for (let i = 0; i < await rows.count(); i++) {
      const pct = (await rows.nth(i).locator('dd').allInnerTexts()).map((t) => Number.parseFloat(t));
      sums.push(pct.length === 4 && pct.every(Number.isFinite) ? pct.reduce((a, b) => a + b, 0) : NaN);
    }
    check(`${tag}: each regime lists 4 asset weights summing to 100%`, sums.length === 4 && sums.every((x) => x === 100), JSON.stringify(sums));
    check(`${tag}: no regime marked current (no published judgment in guest)`, await card.count() === 1 && await card.locator('[aria-current]').count() === 0);
    check(`${tag}: template version macro_allocation_template@v1 + Merrill Lynch source note`,
      await card.count() === 1
      && await card.getByText('macro_allocation_template@v1', { exact: true }).isVisible()
      && await card.getByText(/Merrill Lynch/).isVisible());
    const footer = page.locator('footer[data-research-footer]');
    const methodsHref = `/macro?region=${c.region}&tab=methodology`;
    const methodsLink = page.locator('#macro-sources').locator(`a[href="${methodsHref}"]`);
    check(`${tag}: research footer with disclaimer + "${c.methods}" link to ${methodsHref}`, await footer.count() === 1
      && await footer.getByText(c.disclaimer).isVisible()
      && await methodsLink.count() === 1 && (await methodsLink.innerText()).trim() === c.methods,
      `footer=${await footer.count()} link=${await methodsLink.count()}`);
    // #300: with MACRO_STRATEGY_ENABLED off (launch.sh pins it empty) the tab row lists only the four view tabs and
    // no /macro/{transmission,history,review} link (those routes are notFound()).
    const tabNav = page.getByRole('navigation', { name: c.tabsLabel, exact: true });
    const tabLinks = tabNav.locator('a');
    const tabTexts = (await tabLinks.allInnerTexts()).map((t) => t.trim());
    const tabHrefs = await tabLinks.evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    const wantHrefs = ['overview', 'indicators', 'correlation', 'methodology'].map((t) => `/macro?region=${c.region}&tab=${t}`);
    check(`${tag}: strategy flag off → tab row "${c.tabsLabel}" has only the four view tabs, no transmission/history/review link`,
      await tabNav.count() === 1 && JSON.stringify(tabTexts) === JSON.stringify(c.tabs) && JSON.stringify(tabHrefs) === JSON.stringify(wantHrefs)
      && await page.locator('a[href^="/macro/transmission"], a[href^="/macro/history"], a[href^="/macro/review"]').count() === 0,
      `${JSON.stringify(tabTexts)} ${JSON.stringify(tabHrefs)}`);
    await checkResearchChain(page, tag, c.lang, 'macro');
    if (c.shotName === 'macro-zh') {
      check('zh /macro overview fails closed with a read-failure notice (no DB)', await page.getByText(/读取失败/).first().isVisible());
    }
    await shot(page, c.shotName);
    await ctx.close();
  }
  // The three strategy routes themselves are switched off too (notFound() → the app 404 page).
  {
    const ctx = await newCtx('zh-CN'); const page = await ctx.newPage();
    for (const p of ['/macro/transmission', '/macro/history', '/macro/review']) {
      const r = await page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      const nf = page.getByRole('heading', { name: '页面不存在', exact: true });
      await nf.waitFor({ timeout: 30_000 }).catch(() => {});
      // Like the topics-off pages, assert the rendered 404 page, not the status: (app) has a loading boundary, so
      // notFound() lands after streaming started and next dev answers 200.
      check(`strategy flag off: ${p} renders the app 404 page ("页面不存在"), no strategy screen`, await nf.isVisible()
        && await page.getByRole('navigation', { name: '工作台分区', exact: true }).count() === 0, `status=${r?.status()} ${page.url()}`);
    }
    await ctx.close();
  }
};

// Research hub /intel (#278): five entry cards in research-chain order (`src/components/intel/hub/*`, HUB_ORDER from
// chain.ts), each `section[data-entry][data-hub-state]` with a `[data-hub-step]` number. Guest: 01 macro / 02 industries /
// 03 companies are open with an enter link (the macro card itself fails closed: "宏观数据暂不可用"); 04 foreign and
// 05 topics fetch their public API, get no 200 (`/api/broker-research/reports` 500, `/api/topics` 401) and render
// notServed with no link. Topics switched off (TOPICS_ENABLED unset, no fixtures): /intel/topics, the dossier
// (+ /v/<n>) and /admin/topics render the app 404 page; `/api/topics` → 401 unauthenticated (session is checked
// first); `/api/admin/topics` and the summary POSTs (#287) → 404 topics_disabled.
journeys['intel-hub'] = async function intelHub() {
  const HUB = {
    zh: { locale: 'zh-CN', heading: '研究', notServed: '未服务', macroDown: '宏观数据暂不可用', topicsTitle: '专题研究' },
    en: { locale: 'en-US', heading: 'Research', notServed: 'Not served', macroDown: 'Macro data unavailable', topicsTitle: 'Topics' },
  };
  const EXPECT = [
    { entry: 'macro', step: '01', state: 'open', href: '/macro' },
    { entry: 'industries', step: '02', state: 'open', href: '/intel/industries?scheme=sic' },
    { entry: 'companies', step: '03', state: 'open', href: '/intel/companies' },
    { entry: 'foreign', step: '04', state: 'notServed', href: null },
    { entry: 'topics', step: '05', state: 'notServed', href: null },
  ];
  for (const lang of ['zh', 'en']) {
    const L = HUB[lang];
    const ctx = await newCtx(L.locale); const page = await ctx.newPage();
    // /intel keeps polling (screener), so networkidle never settles: wait for the cards instead.
    const r = await page.goto(BASE + '/intel', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    check(`${lang} /intel → 200 with hub heading "${L.heading}"`, r?.status() === 200 && new URL(page.url()).pathname === '/intel'
      && await page.getByRole('heading', { level: 1 }).first().innerText().then((t) => t.startsWith(L.heading)).catch(() => false), `${r?.status()} ${page.url()}`);
    const cards = page.locator('section[data-entry]');
    await page.waitForFunction(() => { const c = document.querySelectorAll('section[data-entry]');
      return c.length >= 5 && [...c].every((e) => e.dataset.hubState !== 'loading'); }, null, { timeout: 60_000 }).catch(() => {});
    // The macro card (MacroSummaryCard) is always "open" but loads its own summary: wait for it to settle too.
    await page.locator('section[data-entry="macro"]').getByText(L.macroDown).first().waitFor({ timeout: 45_000 }).catch(() => {});
    const got = await cards.evaluateAll((els) => els.map((e) => ({ entry: e.dataset.entry, state: e.dataset.hubState,
      step: e.querySelector('[data-hub-step]')?.textContent ?? null, disabled: e.getAttribute('aria-disabled'),
      text: e.innerText.replace(/\s+/g, ' ').trim(), links: [...e.querySelectorAll('a')].map((a) => a.getAttribute('href')) })));
    save(`intel-hub-cards-${lang}.json`, got);
    check(`${lang} /intel: five entry cards in chain order 01-05 (macro, industries, companies, foreign, topics)`,
      got.length === 5 && EXPECT.every((x, i) => got[i]?.entry === x.entry && got[i]?.step === x.step), JSON.stringify(got.map((g) => `${g.step}:${g.entry}`)));
    for (const [i, x] of EXPECT.entries()) {
      const g = got[i] ?? {};
      if (x.state === 'open') {
        check(`${lang} /intel: ${x.step} ${x.entry} card open with enter link ${x.href}`, g.state === 'open' && g.links?.includes(x.href), JSON.stringify(g));
      } else {
        check(`${lang} /intel: ${x.step} ${x.entry} card "${L.notServed}" (aria-disabled, no link)`,
          g.state === 'notServed' && g.disabled === 'true' && g.links?.length === 0 && g.text?.includes(L.notServed), JSON.stringify(g));
      }
    }
    check(`${lang} /intel: macro card fails closed ("${L.macroDown}", no invented numbers)`, (got[0]?.text ?? '').includes(L.macroDown), got[0]?.text);
    await checkResearchChain(page, `${lang} /intel`, lang, 'none');
    await shot(page, `intel-hub-${lang}`);
    await ctx.close();
  }
  // Topics surfaces with the server switch off.
  const ctx = await newCtx('zh-CN'); const page = await ctx.newPage();
  for (const p of ['/intel/topics', '/intel/topics/ai-capex', '/intel/topics/ai-capex/v/1', '/admin/topics']) {
    await page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const nf = page.getByRole('heading', { name: '页面不存在', exact: true });
    await nf.waitFor({ timeout: 30_000 }).catch(() => {});
    check(`topics off: ${p} renders the app 404 page ("页面不存在"), no topic content`, await nf.isVisible()
      && await page.locator('section[data-entry], [data-testid^="topic"]').count() === 0, page.url());
    if (p === '/intel/topics') await shot(page, 'topics-off-404');
  }
  await ctx.close();
  const list = await getJson('/api/topics?limit=200');
  save('api-topics-guest.json', list);
  check('GET /api/topics?limit=200 (no session) → 401 unauthenticated', list.status === 401 && list.body?.error?.code === 'unauthenticated', `${list.status} ${JSON.stringify(list.body)}`);
  const adm = await getJson('/api/admin/topics');
  save('api-admin-topics-guest.json', adm);
  check('GET /api/admin/topics (topics off) → 404 topics_disabled', adm.status === 404 && adm.body?.error?.code === 'topics_disabled', `${adm.status} ${JSON.stringify(adm.body)}`);
  // Topic summary admin actions (#287): adminPost checks the switch before the session and body, so with topics off
  // generate / approve / discard all answer 404 topics_disabled (no LLM call, no write).
  const tid = '00000000-0000-4000-8000-000000000001', sid = '00000000-0000-4000-8000-000000000002';
  const summary = {};
  for (const p of [`/api/admin/topics/${tid}/summary`, `/api/admin/topics/${tid}/summary/${sid}/approve`, `/api/admin/topics/${tid}/summary/${sid}/discard`]) {
    const r = await fetch(BASE + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'zh', request_id: '00000000-0000-4000-8000-000000000003' }), signal: AbortSignal.timeout(60_000) });
    let body = null; try { body = await r.json(); } catch {}
    summary[p] = { status: r.status, body };
    check(`POST ${p.replace(tid, '<id>').replace(sid, '<summaryId>')} (topics off) → 404 topics_disabled`, r.status === 404 && body?.error?.code === 'topics_disabled', `${r.status} ${JSON.stringify(body)}`);
  }
  save('api-admin-topics-summary-guest.json', summary);
};

const ORDER = ['landing', 'watchlist', 'stock', 'quote-api', 'auth-gate', 'macro', 'intel-hub'];
let wanted = process.argv.slice(2);
if (!wanted.length || wanted.includes('all')) wanted = MODE === 'gate' ? ['landing', 'quote-api', 'auth-gate'] : ORDER;
const unknown = wanted.filter((w) => !journeys[w]);
if (unknown.length) { console.error(`drive: unknown journey(s) ${unknown.join(',')}; known: ${ORDER.join(' ')}`); process.exit(2); }

console.log(`drive: mode=${MODE} base=${BASE} evidence=${EVIDENCE}`);
for (const name of wanted) {
  current = { journey: name, mode: MODE, verifierSha, productSha, startedAt: new Date().toISOString(), checks: [] };
  console.log(`journey ${name}`);
  try { await journeys[name](); } catch (e) { check('journey completed without exception', false, e?.stack ?? e); }
  current.passed = current.checks.every((c) => c.pass);
  results.push(current);
}
await browser?.close().catch(() => {}); // disconnects CDP; the Chrome process stays for cleanup.sh
const file = path.join(EVIDENCE, `results-${MODE}.json`);
const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
fs.writeFileSync(file, JSON.stringify([...prev, ...results], null, 2));
const all = results.flatMap((r) => r.checks);
const failed = all.filter((c) => !c.pass).length;
const upstreamFailed = all.filter((c) => c.upstreamUnavailable).length;
console.log(`drive: ${all.length - failed}/${all.length} checks passed; ${results.filter((r) => r.passed).length}/${results.length} journeys passed`
  + `${upstreamFailed ? `; ${upstreamFailed} of the ${failed} failed check(s) are upstream-unavailable (counted as not passed)` : ''} → ${file}`);
process.exit(failed ? 1 : 0);
