/**
 * Scene recorder for the product demo (docs/demo/README.md).
 *
 *   npx tsx docs/demo/record/record.ts            # record every scene
 *   npx tsx docs/demo/record/record.ts s08 s09    # record only scenes whose id starts with these
 *
 * Prerequisites: dev server on DEMO_BASE_URL (default http://localhost:3000) pointed at the local
 * Supabase stack, demo data seeded by seed-demo.ts, and docs/demo/build/timing.json produced by
 * `python3 docs/demo/record/build.py --timing-only` (gives each scene its narration length so the
 * recording is held at least that long).
 *
 * Output: docs/demo/build/raw/<scene>.webm (one Playwright context + video per scene) and
 * docs/demo/build/state.json (the signed-in storage state, reused across scenes).
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { chromium, type BrowserContext, type Locator, type Page } from 'playwright';
import { DEMO_EMAIL, DEMO_PASSWORD } from './demo-account';

const BASE = process.env.DEMO_BASE_URL ?? 'http://localhost:3000';
const DEMO_DIR = path.resolve(__dirname, '..');
const BUILD = path.join(DEMO_DIR, 'build');
const RAW = path.join(BUILD, 'raw');
const STATE = path.join(BUILD, 'state.json');
const W = 1600;
const H = 900;

interface Timing { scenes: Record<string, { total: number }> }
const timing: Timing = fs.existsSync(path.join(BUILD, 'timing.json'))
  ? JSON.parse(fs.readFileSync(path.join(BUILD, 'timing.json'), 'utf8'))
  : { scenes: {} };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Synthetic cursor so viewers can see where the clicks land (Playwright videos have no pointer). */
const CURSOR_SCRIPT = `(() => {
  if (window.top !== window) return;
  const ensure = () => {
    if (document.getElementById('__demo_cursor') || !document.body) return;
    const el = document.createElement('div');
    el.id = '__demo_cursor';
    el.innerHTML = '<svg width="28" height="32" viewBox="0 0 26 30"><path d="M2 2 L2 24 L8 18.5 L12 28 L16 26.3 L12.2 17 L20 17 Z" fill="#ffffff" stroke="#111111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(el.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none', transform: 'translate(-100px,-100px)', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.6))' });
    document.body.appendChild(el);
    const ring = document.createElement('div');
    ring.id = '__demo_ring';
    Object.assign(ring.style, { position: 'fixed', left: '0', top: '0', width: '36px', height: '36px', marginLeft: '-18px', marginTop: '-18px', borderRadius: '50%', border: '3px solid #f5a623', opacity: '0', pointerEvents: 'none', zIndex: '2147483646', transform: 'translate(-100px,-100px) scale(.4)' });
    document.body.appendChild(ring);
  };
  let x = -100, y = -100;
  window.addEventListener('mousemove', (e) => {
    x = e.clientX; y = e.clientY;
    const el = document.getElementById('__demo_cursor');
    if (el) el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }, true);
  window.addEventListener('mousedown', (e) => {
    const ring = document.getElementById('__demo_ring');
    if (!ring) return;
    ring.style.transition = 'none';
    ring.style.opacity = '0.9';
    ring.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px) scale(.4)';
    requestAnimationFrame(() => {
      ring.style.transition = 'transform 420ms ease-out, opacity 420ms ease-out';
      ring.style.opacity = '0';
      ring.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px) scale(1.6)';
    });
  }, true);
  if (document.body) ensure(); else document.addEventListener('DOMContentLoaded', ensure);
  setInterval(ensure, 500);
})();`;

class Director {
  readonly startedAt = Date.now();
  private lastX = W / 2;
  private lastY = H / 2;
  constructor(readonly page: Page) {}

  elapsed(): number { return (Date.now() - this.startedAt) / 1000; }

  async goto(p: string) {
    await this.page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  }

  async pause(ms: number) { await sleep(ms); }

  /** Move the synthetic cursor to a point with a human-looking glide. */
  async moveTo(x: number, y: number, ms = 450) {
    const steps = Math.max(8, Math.round(ms / 16));
    const sx = this.lastX; const sy = this.lastY;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps; const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease in-out
      await this.page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
      await sleep(ms / steps);
    }
    this.lastX = x; this.lastY = y;
  }

  private async center(loc: Locator): Promise<{ x: number; y: number }> {
    await loc.first().waitFor({ state: 'visible', timeout: 30_000 });
    let box = await loc.first().boundingBox();
    // Keep targets clear of the sticky top bar and the fixed bottom tab bar: a click that lands on
    // the tab bar would navigate away (that is how s08 once ended up on /today).
    if (!box || box.y < 90 || box.y + box.height > H - 110) {
      await loc.first().evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      await sleep(700);
      box = await loc.first().boundingBox();
    }
    if (!box) throw new Error(`element not visible: ${loc}`);
    return { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 18) };
  }

  async hover(loc: Locator, holdMs = 700) {
    const c = await this.center(loc);
    await this.moveTo(c.x, c.y);
    await sleep(holdMs);
  }

  async click(loc: Locator, afterMs = 600) {
    const c = await this.center(loc);
    await this.moveTo(c.x, c.y);
    await sleep(120);
    await this.page.mouse.down(); await sleep(70); await this.page.mouse.up();
    await sleep(afterMs);
  }

  async type(loc: Locator, text: string, delay = 45) {
    await this.click(loc, 200);
    await this.page.keyboard.type(text, { delay });
    await sleep(300);
  }

  async scroll(dy: number, ms = 600) {
    const steps = 8;
    for (let i = 0; i < steps; i++) { await this.page.mouse.wheel(0, dy / steps); await sleep(ms / steps); }
  }

  /** Keep the scene on screen until the narration for it has finished. */
  async holdUntil(totalSec: number, tailSec = 0.6) {
    const remaining = totalSec + tailSec - this.elapsed();
    if (remaining > 0) await sleep(remaining * 1000);
  }
}

type Scene = (d: Director, page: Page) => Promise<void>;

/** The radar stream collapses quiet (white) tickers; on a closed market everything is quiet, so expand it. */
async function expandRadar(d: Director, page: Page) {
  const rows = page.locator('a[href^="/stock/"]');
  const expand = page.getByRole('button', { name: /展开/ });
  await Promise.race([rows.first().waitFor({ timeout: 45_000 }), expand.waitFor({ timeout: 45_000 })]).catch(() => {});
  if (await expand.count()) await d.click(expand, 900);
  await rows.first().waitFor({ timeout: 10_000 }).catch(() => {});
}

const SCENES: Record<string, Scene> = {
  async s01_intro(d, page) {
    await d.goto('/today');
    await expandRadar(d, page);
    await d.moveTo(W * 0.5, H * 0.45, 1200);
    await d.pause(2500);
    await d.moveTo(W * 0.33, H * 0.5, 1500);
  },

  async s02_today(d, page) {
    await d.goto('/today');
    await expandRadar(d, page);
    await d.pause(1500);
    await d.hover(page.getByText(/A股/).first(), 1800);                    // market clocks
    await d.hover(page.locator('a[href^="/stock/"]').first(), 1500);       // radar stream
    await d.scroll(260, 900);
    await d.pause(1200);
    await d.scroll(-260, 700);
    await d.hover(page.getByText(/持仓速览|持仓一瞥/).first(), 1500);       // right rail
    await d.scroll(300, 900);
    await d.pause(800);
  },

  async s03_stock(d, page) {
    await d.goto('/today');
    await expandRadar(d, page);
    const row = page.locator('a[href="/stock/600519.SH"]').first();
    await row.waitFor({ timeout: 60_000 });
    await d.click(row, 1500);
    const chartReady = async () => {
      await page.getByText('正在加载行情…').first().waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
    };
    await chartReady();
    await d.pause(1500);
    for (const r of ['1M', '1Y', '5Y']) {
      await d.click(page.getByRole('button', { name: r, exact: true }), 300);
      await chartReady();
      await d.pause(1300);
    }
    await d.hover(page.getByText(/前复权|不复权/).first(), 1600);
    for (const tab of ['AI 观点', '财报', '新闻 / 研报']) {
      await d.click(page.getByRole('button', { name: tab, exact: true }).first(), 1300);
    }
    await d.click(page.getByRole('button', { name: '行情', exact: true }).first(), 800);
  },

  async s04_watchlist(d, page) {
    await d.goto('/watchlist');
    await page.getByText('贵州茅台').first().waitFor({ timeout: 30_000 });
    await d.pause(2500);
    await d.click(page.getByRole('button', { name: /看板/ }), 1800);
    // Columns render in order 长期持有 / 机会跟踪 / 仅观察 — the second "＋ 加入股票" is 机会跟踪.
    await d.click(page.getByRole('button', { name: '＋ 加入股票' }).nth(1), 600);
    await d.type(page.getByPlaceholder(/代码 \/ 名称/), '比亚迪', 80);
    const hit = page.getByRole('button', { name: /比亚迪/ }).first();
    await hit.waitFor({ timeout: 15_000 });
    await d.click(hit, 1500);
    await d.click(page.getByRole('button', { name: /表格/ }), 1500);
    await d.hover(page.getByRole('button', { name: /批量导入/ }), 1500);
  },

  async s05_intel(d, page) {
    await d.goto('/intel');
    await d.pause(1500);
    await d.hover(page.getByText(/卡脖子|瓶颈/).first(), 1800);
    await d.hover(page.locator('input, textarea').first(), 1200);
    await d.click(page.getByRole('button', { name: /研究/ }).first(), 2500);
    await d.click(page.getByRole('button', { name: /发现/ }).first(), 800);
  },

  async s06_boundary(d, page) {
    await d.goto('/research');
    await page.getByText(/Research Dashboard/).waitFor({ timeout: 30_000 });
    await d.moveTo(W * 0.5, H * 0.9, 800);
    // The three-layer diagram is overlaid in build.py; the page just sits underneath.
  },

  async s07_research(d, page) {
    await d.goto('/research/companies');
    const moutai = page.getByRole('link', { name: /贵州茅台/ }).first();
    await moutai.waitFor({ timeout: 30_000 });
    await d.pause(1200);
    // The company detail page currently returns 500 (README → 录制时发现的问题 #2), so the list card
    // with its verified-security badge (600519.SH) is shown instead of clicking through.
    await d.hover(moutai, 2200);
    await d.hover(page.getByText('Themes 主题', { exact: false }).first(), 1200);
    await d.goto('/research/theses');
    const thesis = page.getByRole('link', { name: /茅台：批价企稳/ }).first();
    await thesis.waitFor({ timeout: 30_000 });
    await d.pause(900);
    await d.click(thesis, 2000);
    await d.hover(page.getByText(/失效条件/).first(), 1500);
    await d.hover(page.getByText(/观察指标/).first(), 1500);
  },

  async s08_playbook(d, page) {
    await d.goto('/research/playbooks');
    const source = page.locator('select').first();
    await source.waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll('select option').length > 2, null, { timeout: 30_000 });
    await d.pause(800);
    await d.hover(source, 300);
    const opts = await source.locator('option').allTextContents();
    const idx = opts.findIndex((o) => o.includes('茅台'));
    await source.selectOption({ index: idx });
    await d.pause(900);
    const action = page.locator('select').nth(1);
    await d.hover(action, 200);
    await action.selectOption('PAPER_TRADE');
    await d.pause(700);
    await d.type(page.locator('textarea').nth(0), '批价连续两周企稳，直销占比提升，按论点做纸面记录。', 35);
    await d.type(page.locator('textarea').nth(1), '白酒需求季节性走弱\n批价回落跌破失效条件', 35);
    await d.click(page.getByRole('button', { name: '创建 playbook run' }), 1200);
    await page.getByText(/创建成功/).waitFor({ timeout: 20_000 });
    await d.pause(900);
    await d.type(page.getByPlaceholder('审批意见（必填）'), '批价连续两周企稳，按论点执行纸面记录。', 35);
    await d.click(page.getByRole('button', { name: '✅ 批准' }), 1200);
    await page.getByText(/已批准/).waitFor({ timeout: 20_000 });
    await d.pause(1500);
  },

  async s09_register(d, page) {
    await d.goto('/research/playbooks');
    const btn = page.getByRole('button', { name: '登记为建议' }).first();
    await btn.waitFor({ timeout: 30_000 });
    await d.pause(600);
    await d.click(btn, 1500);
    const when = page.locator('input[type="datetime-local"]');
    await when.waitFor({ timeout: 20_000 });
    await d.hover(page.getByText('贵州茅台').last(), 1500);
    await d.click(when, 300);
    await when.fill('2026-09-01T10:00');
    await d.pause(900);
    const submit = page.getByRole('button', { name: /登记 1 条为建议/ });
    await d.click(submit, 1200);
    await page.getByText(/已登记 1 条/).first().waitFor({ timeout: 20_000 });
    await d.hover(page.getByRole('link', { name: /已登记 1 条 · 查看/ }), 2000);
  },

  async s10_analyst(d, page) {
    await d.goto('/analyst');
    await page.getByText('John Cameron').first().waitFor({ timeout: 30_000 });
    await d.pause(2200);
    // Scores were written by score-offline.ts just before this scene (Eastmoney unreachable, see README).
    await d.hover(page.getByRole('button', { name: '刷新评分' }), 2500);
    await d.hover(page.getByText(/命中率/).first(), 2000);
    await d.click(page.getByRole('link', { name: /Research Playbook/ }).first(), 2200);
    await d.hover(page.getByText(/模拟持仓/).first(), 1200);
    await d.scroll(320, 900);
    await d.hover(page.getByText(/建议时间线/).first(), 1500);
    await d.pause(800);
    await d.click(page.getByRole('link', { name: /返回总览/ }), 1200);
    await d.click(page.getByRole('link', { name: /John Cameron/ }).first(), 2000);
    await d.scroll(400, 900);
    await d.pause(1000);
  },

  async s11_portfolio(d, page) {
    await d.goto('/portfolio?s=600519.SH');
    const label = page.getByText('决策条', { exact: true });
    await label.waitFor({ timeout: 30_000 });
    await d.pause(2200);
    await d.hover(page.getByText(/持仓/).first(), 900);
    const bar = label.locator('xpath=../..');
    await d.click(bar.getByRole('button', { name: '买入', exact: true }), 900);
    const adopt = bar.locator('select');
    await adopt.waitFor({ timeout: 20_000 });
    await d.hover(adopt, 400);
    await adopt.selectOption({ index: 1 });
    await d.pause(900);
    await d.type(bar.getByPlaceholder('一句话理由'), '采纳研究建议，分批建仓', 45);
    await d.click(bar.getByRole('button', { name: '记录决策' }), 1500);
    await d.goto('/portfolio/decisions');
    await page.getByText(/采纳自/).first().waitFor({ timeout: 30_000 });
    await d.hover(page.getByText(/采纳自/).first(), 2500);
    await d.goto('/portfolio/review');
    await page.getByText(/复盘概览|暂无可评分决策/).first().waitFor({ timeout: 120_000 });
    await d.pause(1500);
    await d.scroll(350, 900);
    await d.pause(1200);
  },

  async s12_copilot(d, page) {
    // Copilot pre-fills the ticker from /stock/<ticker> (tickerFromPathname in CopilotFab.tsx).
    await d.goto('/stock/600519.SH');
    await page.getByText('贵州茅台').first().waitFor({ timeout: 30_000 });
    await d.moveTo(W * 0.5, H * 0.5, 600);
    await d.pause(1200);
    await page.keyboard.press('Meta+k');
    await page.getByText(/Copilot/).first().waitFor({ timeout: 10_000 });
    await d.pause(900);
    await d.hover(page.getByPlaceholder(/输入代码/).last(), 1500);
    await d.hover(page.getByRole('button', { name: /让 John 分析/ }), 2200);
    await d.hover(page.getByRole('link', { name: '展开' }), 1500);
    await page.keyboard.press('Meta+k');
    await d.pause(800);
  },

  async s13_settings(d, page) {
    await d.goto('/settings');
    await page.getByRole('button', { name: /English/ }).waitFor({ timeout: 30_000 });
    await d.pause(1200);
    await d.click(page.getByRole('button', { name: /English/ }), 2500);
    await page.getByText(/Language/).first().waitFor({ timeout: 15_000 }).catch(() => {});
    await d.hover(page.locator('nav').last(), 1500);
    await d.click(page.getByRole('button', { name: /中文/ }), 2000);
    await d.click(page.getByRole('button', { name: /主题切换|Toggle theme/ }), 800);
    await d.click(page.getByRole('button', { name: /浅色/ }), 2200);
    await d.click(page.getByRole('button', { name: /深色/ }), 800);
    await d.click(page.getByRole('button', { name: /绿涨红跌/ }), 1200);
    await d.click(page.getByRole('button', { name: /红涨绿跌/ }), 800);
  },
};

async function login(ctxFactory: () => Promise<BrowserContext>) {
  const ctx = await ctxFactory();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await sleep(800); // let React hydrate before touching the controlled inputs
  await page.locator('input[type="email"]').fill(DEMO_EMAIL);
  await page.locator('input[type="password"]').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL('**/today', { timeout: 60_000 });
  await ctx.storageState({ path: STATE });
  await ctx.close();
}

async function main() {
  const filters = process.argv.slice(2);
  const ids = Object.keys(SCENES).filter((id) => filters.length === 0 || filters.some((f) => id.startsWith(f)));
  fs.mkdirSync(RAW, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const base = { viewport: { width: W, height: H }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', deviceScaleFactor: 1 };
  if (!fs.existsSync(STATE) || filters.includes('--login')) {
    await login(() => browser.newContext(base));
    console.log('[record] signed in, state saved');
  }

  for (const id of ids) {
    if (id === 's10_analyst' && process.env.DEMO_SKIP_OFFLINE_SCORE !== '1') {
      // Product refresh fetches bars from Eastmoney only; score the new playbook recommendation the same way offline.
      execFileSync('npx', ['tsx', path.join(__dirname, 'score-offline.ts')], { stdio: 'inherit' });
    }
    const total = timing.scenes[id]?.total ?? 0;
    const ctx = await browser.newContext({ ...base, storageState: STATE, recordVideo: { dir: RAW, size: { width: W, height: H } } });
    await ctx.addInitScript(CURSOR_SCRIPT);
    // Hide the Next.js dev-mode indicator badge (dev server only; not part of the product UI).
    await ctx.addInitScript(`(() => { const css = 'nextjs-portal{display:none!important}'; const add = () => { if (!document.head) return; const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }; if (document.head) add(); else document.addEventListener('DOMContentLoaded', add); })();`);
    const page = await ctx.newPage();
    const d = new Director(page);
    let failed: unknown = null;
    try {
      await SCENES[id](d, page);
      await d.holdUntil(total);
    } catch (e) {
      failed = e;
      console.error(`[record] ${id} FAILED after ${d.elapsed().toFixed(1)}s:`, e);
      await page.screenshot({ path: path.join(BUILD, `${id}-failed.png`) }).catch(() => {});
    }
    const video = page.video();
    await ctx.close();
    const src = await video!.path();
    const dst = path.join(RAW, `${id}${failed ? '.failed' : ''}.webm`);
    fs.renameSync(src, dst);
    console.log(`[record] ${id}: ${d.elapsed().toFixed(1)}s (narration ${total.toFixed(1)}s) → ${path.relative(DEMO_DIR, dst)}`);
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
