// Run from the repository root. Tests require an empty database and local receipt mode.
// By default the script starts a disposable server. Set REPLAY_SMOKE_ORIGIN and
// REPLAY_SMOKE_DATA_DIR together to exercise a caller-owned HTTPS rehearsal instance.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const externalOrigin = process.env.REPLAY_SMOKE_ORIGIN;
const externalDirectory = process.env.REPLAY_SMOKE_DATA_DIR;
if (Boolean(externalOrigin) !== Boolean(externalDirectory)) {
  throw new Error('请同时设置 REPLAY_SMOKE_ORIGIN 和 REPLAY_SMOKE_DATA_DIR。');
}
const target = externalOrigin ? URL.parse(externalOrigin) : null;
if (externalOrigin && (target?.protocol !== 'https:' || target.href !== target.origin + '/')) {
  throw new Error('外部验收需要不含凭据、路径或参数的 HTTPS 入口。');
}
const directory = externalDirectory ? resolve(externalDirectory) : await mkdtemp(join(tmpdir(),'osborn-replay-browser-'));
const server = target ? null : spawn(process.execPath,['--import','tsx', join(here,'server.mjs')],{
  cwd:root, env:{...process.env,REPLAY_PORT:'0',REPLAY_DATA_DIR:directory,REPLAY_PUBLIC_URL:''},
  stdio:['ignore','pipe','pipe'],
});
let output = '';
server?.stdout.on('data',chunk => { output += chunk; });
server?.stderr.on('data',chunk => { output += chunk; });
async function until(fn, label, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await sleep(100);
  }
  throw new Error('等待超时：' + label);
}
function assertLocalCard(receipt) {
  const db = new DatabaseSync(join(directory,'replay.sqlite'), {readOnly:true});
  try {
    const row = db.prepare('SELECT payload FROM replay_mock_receipts WHERE receipt_id=?').get(receipt.receiptId);
    assert.ok(row, '本地机器人应保存实际接收的卡片');
    const { card } = JSON.parse(row.payload);
    assert.equal(card.header.title.content,receipt.title);
    assert.equal(card.elements[0].text.content,receipt.text);
  } finally {
    db.close();
  }
}
let browser;
let keys = {};
try {
  const base = target?.origin ?? await until(() => {
    if (server.exitCode !== null) throw new Error(output);
    return output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
  },'临时服务');
  keys = JSON.parse(await readFile(join(directory,'role-keys.json'),'utf8'));
  assert.ok(['A','B','PM'].every(role => /^[A-Za-z0-9_-]{43}$/.test(keys[role])) &&
    new Set([keys.A,keys.B,keys.PM]).size === 3, 'A、B、PM 需要三个不同的角色访问码');
  const state = async (role='PM') => {
    const r = await fetch(base + '/api/state',{
      headers:{authorization:'Bearer ' + keys[role]}, redirect:'error', signal:AbortSignal.timeout(12000),
    });
    assert.equal(r.status,200);
    return r.json();
  };
  if (target) {
    const launcherHtml = await readFile(join(directory,'start.html'),'utf8');
    for (const role of ['A','B','PM']) {
      assert.ok(launcherHtml.includes('href="' + base + '/#key=' + keys[role] + '"'), '外部地址和本地角色入口必须一致');
    }
    const initial = await state();
    assert.ok(initial.phase === 'idle' && initial.registrations.submitted.A === 0 &&
      initial.registrations.submitted.B === 0 && initial.portfolio.trades.length === 0 &&
      initial.notifications.length === 0 && initial.deliveryMode === 'local',
    '外部验收只允许全新的独立测试场次，且播报模式必须为本地接收。');
    const noKey = await fetch(base + '/api/state', {signal:AbortSignal.timeout(12000)});
    assert.equal(noKey.status,401);
    for (const path of ['/start.html','/role-keys.json','/replay.sqlite','/tencent-hk00700.json']) {
      const response = await fetch(base + path,{
        headers:{authorization:'Bearer ' + keys.A}, signal:AbortSignal.timeout(12000),
      });
      assert.equal(response.status,404, '不得提供本地文件 ' + path);
      const raw = await response.text();
      assert.ok(Object.values(keys).every(key => !raw.includes(key)), '请求受保护文件不得返回角色访问码');
    }
    const crossOrigin = await fetch(base + '/api/action',{
      method:'POST', headers:{authorization:'Bearer ' + keys.PM, origin:'https://untrusted.invalid','content-type':'application/json'},
      body:'{}', signal:AbortSignal.timeout(12000),
    });
    assert.equal(crossOrigin.status,403,'必须拒绝跨站写入');
  }
  browser = await chromium.launch({headless:true});
  const pages = {};
  const errors = [];
  const leaks = [];
  const captures = join(root,'build',target ? 'analyst-replay-qa-shared' : 'analyst-replay-qa');
  await mkdir(captures,{recursive:true});
  for (const role of ['PM','A','B']) {
    const mobile = role === 'B';
    const context = await browser.newContext({locale:'zh-CN',timezoneId:role === 'A' ? 'America/Los_Angeles' : 'Asia/Shanghai',viewport: mobile ? {width:390,height:844} : {width:1280,height:960}});
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    context.on('request', request => {
      const url = new URL(request.url());
      if (/^https?:$/.test(url.protocol) && Object.values(keys).some(key => (url.pathname + url.search).includes(key))) {
        leaks.push('角色访问码出现在 HTTP 路径或查询参数');
      }
    });
    const roleName = role === 'PM' ? 'PM' : '分析师 ' + role;
    let page;
    if (target || mobile) {
      const launcher = await context.newPage();
      await launcher.goto(pathToFileURL(join(directory,'start.html')).href);
      const card = launcher.getByRole('link', {name:new RegExp('^' + roleName + '，')});
      if (!target) assert.equal(new URL(await card.getAttribute('href')).hash,'#role=' + role);
      [page] = await Promise.all([context.waitForEvent('page'), card.click()]);
      await page.locator('#work').waitFor({state:'visible'});
      await launcher.close();
    } else {
      page = await context.newPage();
      await page.goto(base + '/');
      const picker = page.locator('#role-picker');
      await picker.waitFor({state:'visible'});
      assert.equal(await picker.locator('button[data-role]').count(),3);
      assert.equal(await page.locator('#login-form').isVisible(),false);
      if (role === 'PM') await page.screenshot({path:join(captures,'role-picker.png')});
      await picker.locator('button[data-role="' + role + '"]').click();
      await page.locator('#work').waitFor({state:'visible'});
    }
    assert.equal(new URL(page.url()).origin, base);
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(await page.evaluate(() => window.opener === null), true);
    assert.equal(await page.locator('#identity .identity-label').innerText(), roleName);
    assert.equal(await page.evaluate(() => window.isSecureContext), true);
    pages[role] = page;
  }
  const { PM, A, B } = pages;
  if (!target) {
    const identity = A.locator('#identity .identity-label');
    const picker = A.locator('#role-picker');
    await A.locator('[data-cmd=switch-role]').click();
    await picker.locator('button[data-role="B"]').click();
    await identity.waitFor({state:'visible'});
    assert.equal(await identity.innerText(),'分析师 B');
    await A.locator('[data-cmd=switch-role]').click();
    await picker.locator('button[data-role="A"]').click();
    await identity.waitFor({state:'visible'});
    assert.equal(await identity.innerText(),'分析师 A');
    assert.equal(await PM.locator('#identity .identity-label').innerText(),'PM');
  }
  async function click(el) {
    await el.click({timeout:12000});
  }
  async function submit(page, action, why) {
    await page.locator('#direction').selectOption(action);
    await page.locator('#rationale').fill(why);
    await click(page.getByRole('button',{name:'提交本轮建议'}));
  }
  async function advance(phase) {
    await click(PM.locator('[data-cmd=advance]'));
    await until(async () => (await state()).phase === phase, phase);
  }
  async function nav(page, view) {
    const link = page.locator('#mast-nav a[href="#' + view + '"]');
    await click(link);
    await page.locator('#' + view + '-view').waitFor({state:'visible'});
    assert.equal(await link.getAttribute('aria-current'), 'page');
  }
  async function replayLedger(page, role) {
    const profile = page.locator('#results a.profile-card[href="#replay-ledger-' + role + '"]');
    await click(profile);
    await page.locator('#ledger-content').waitFor({state:'visible'});
    assert.equal(new URL(page.url()).hash, '#replay-ledger-' + role);
    assert.match(await page.locator('#ledger-head h1').innerText(), new RegExp('分析师 ' + role));
    return page.locator('#ledger-content');
  }
  async function returnFromReplayLedger(page) {
    await click(page.locator('#ledger-view .back-link'));
    await page.locator('#replay-view').waitFor({state:'visible'});
  }
  async function captureTop(page, imageName) {
    await page.locator('#notice:empty').waitFor({state:'attached'});
    await page.evaluate(() => window.scrollTo({top:0, behavior:'instant'}));
    await page.screenshot({path:join(captures,imageName), animations:'disabled'});
  }
  // Exercise the normal default entry point before PM opens the separate guided replay.
  const historyRationale = '建议日价格回落，登记买入并跟踪随后十个交易日的表现。';
  const research = '腾讯控股 · 六月跟踪';
  async function fillRegistration(page, action, why, horizon = '') {
    const form = page.locator('#registration-form');
    const field = name => form.locator('[name="' + name + '"]');
    await form.waitFor({state:'visible'});
    await field('ticker').fill('00700.HK');
    await field('market').selectOption('HK');
    await field('action').selectOption(action);
    await field('reference_price').fill('445');
    await field('target_price').fill('480');
    await field('stop_loss').fill('400');
    await field('horizon').selectOption(horizon);
    await field('thesis_ref').fill(research);
    await field('recommended_at').fill('2026-06-16T15:30');
    await field('rationale').fill(why);
    return form;
  }
  async function submitRegistration(page, form) {
    const began = performance.now();
    const [response] = await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === '/api/registrations' && r.request().method() === 'POST', {timeout:60000}),
      click(form.getByRole('button',{name:'登记建议',exact:true})),
    ]);
    const payload = await response.json();
    assert.equal(response.status(), 200, payload.error ?? '登记请求未成功');
    const {entry} = payload;
    const card = page.locator('#registration-results article[data-registration-id="' + entry.id + '"]');
    const scoreText = entry.score.score > 0 ? '+' + entry.score.score.toFixed(1) : entry.score.score.toFixed(1);
    await card.locator('.score-window[data-window="10"]').getByText(scoreText, {exact:true}).waitFor({
      state:'visible', timeout:Math.max(1, 60000 - (performance.now() - began)),
    });
    const elapsedMs = Math.round(performance.now() - began);
    assert.ok(elapsedMs < 60000, '点击到本人界面出现评分须少于一分钟');
    return {entry, elapsedMs};
  }
  const primaryForm = A.locator('#registration-form');
  assert.equal(await primaryForm.locator('[name=ticker]').inputValue(),'');
  assert.ok(!(await primaryForm.locator('[name=recommended_at]').inputValue()).startsWith('2026-06-16'));
  await click(primaryForm.locator('..').locator('[data-cmd=example]'));
  assert.equal(await primaryForm.locator('[name=ticker]').inputValue(),'00700.HK');
  assert.equal(await primaryForm.locator('[name=recommended_at]').inputValue(),'2026-06-16T15:30');
  const formA = await fillRegistration(A, 'buy', historyRationale);
  const formB = await fillRegistration(B, 'pass', '价格趋势仍弱，观察成交后再行动。', '10d');
  await captureTop(A, 'registration.png');
  assert.equal(await B.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  const first = await submitRegistration(A, formA);
  const {baseDate, baseClose, d5Date, d5Close, d10Date, d10Close, source, mode} = first.entry.evidence;
  assert.deepEqual([baseDate, d5Date, d10Date], ['2026-06-16','2026-06-24','2026-07-02']);
  assert.deepEqual([baseClose, d5Close, d10Close], [447.4, 428.8, 430.2]);
  assert.equal(first.entry.status, 'final');
  assert.equal(first.entry.score.hit, d5Close > baseClose);
  assert.equal(first.entry.score.hit_10d, d10Close > baseClose);
  assert.equal(first.entry.score.score_5d, -4.2);
  assert.equal(first.entry.score.score_10d, -3.8);
  assert.equal(first.entry.recommendation.horizon, null);
  assert.equal(first.entry.score.score, Math.round(1000 * (d10Close / baseClose - 1)) / 10);
  for (const role of ['PM', 'B']) {
    const protectedView = await state(role);
    assert.equal(protectedView.registrations.entries.length, 0);
    assert.equal(protectedView.registrations.submitted.A, 1);
    assert.ok(!JSON.stringify(protectedView).includes(historyRationale));
  }
  const registered = await state('A');
  assert.equal(registered.registrations.results[0].hitRate, 0);
  assert.equal(registered.registrations.books.A.summary.avg_score, -3.8);
  const firstReceipt = await until(async () => {
    const current = await state();
    assert.deepEqual(current.registrations.submitted,{ A:1, B:0 });
    return current.notifications.find(row => row.title === '第 1 组 · 分析师 A 评分结果' &&
      row.mode === 'local' && row.status === 'sent');
  },'分析师 B 提交前，机器人收到分析师 A 的实际评分');
  assertLocalCard(firstReceipt);
  for (const detail of [d5Date, d10Date, '00700.HK', '买入', 'T+5 未命中', 'T+10 未命中', '评分 -4.2', '评分 -3.8', '命中率 0.00%']) {
    assert.ok(firstReceipt.text.includes(detail), '首次评分播报少了 ' + detail);
  }
  assert.ok(!firstReceipt.text.includes(historyRationale) && !firstReceipt.text.includes(research));
  const profileForm = PM.locator('#analyst-profile-form');
  const cName = '研究员 C';
  await profileForm.locator('[name=display_name]').fill(cName);
  await profileForm.locator('[name=kind]').selectOption('human');
  await profileForm.locator('[name=note]').fill('验证新增分析师的独立权限');
  const [createdResponse] = await Promise.all([
    PM.waitForResponse(r => new URL(r.url()).pathname === '/api/analysts' && r.request().method() === 'POST'),
    click(profileForm.getByRole('button',{name:'创建分析师',exact:true})),
  ]);
  const {profile:cProfile,inviteUrl} = await createdResponse.json();
  assert.ok(createdResponse.ok(),'创建分析师接口应成功');
  assert.equal(cProfile.display_name,cName);
  const cRole = cProfile.id;
  const cInvite = new URL(inviteUrl);
  assert.equal(cInvite.origin,base);
  keys[cRole] = new URLSearchParams(cInvite.hash.slice(1)).get('key');
  assert.match(keys[cRole],/^[A-Za-z0-9_-]{43}$/);
  if (!target) {
    await click(PM.locator('[data-cmd=switch-role]'));
    const picker = PM.locator('#role-picker');
    await picker.locator('button[data-role="' + cRole + '"]').waitFor({state:'visible'});
    await click(picker.locator('button[data-role="PM"]'));
    await PM.locator('#identity .identity-label').waitFor({state:'visible'});
  }
  const cContext = await browser.newContext({locale:'zh-CN',timezoneId:'Asia/Shanghai',viewport:{width:390,height:844}});
  const C = await cContext.newPage();
  C.on('pageerror', error => errors.push(error.message));
  await C.goto(target ? inviteUrl : base + '/');
  if (!target) {
    const picker = C.locator('#role-picker');
    await picker.locator('button[data-role="' + cRole + '"]').click();
  }
  await C.locator('#identity .identity-label').waitFor({state:'visible'});
  assert.equal(await C.locator('#identity .identity-label').innerText(),cName);
  assert.equal(new URL(C.url()).hash,'');
  assert.equal(await C.locator('#analyst-profile-form').isVisible(),false);
  assert.equal(await C.locator('#mast-nav a[href="#replay"]').isVisible(),false);
  assert.equal(await C.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true);
  const protectedInvites = await fetch(base+'/api/analysts/invites',{headers:{authorization:'Bearer '+keys[cRole]}});
  assert.equal(protectedInvites.status,403);
  const frozenGroup = (await state()).registrations.groups.find(group => group.pairNo === 1);
  assert.deepEqual(frozenGroup.memberIds,['A','B']);
  assert.deepEqual(frozenGroup.submittedIds,['A']);
  const second = await submitRegistration(B, formB);
  assert.equal(second.entry.evidence.snapshotId, first.entry.evidence.snapshotId);
  assert.equal(second.entry.score.score, 3.8);
  assert.equal(second.entry.score.hit_10d, true);
  assert.equal(second.entry.recommendation.horizon, '10d');
  assert.equal(second.entry.score.hit, true);

  const publicA = PM.locator('#registration-results article[data-registration-id="' + first.entry.id + '"]');
  await publicA.waitFor({state:'visible'});
  assert.match(await publicA.locator('.score-window[data-window="5"]').innerText(), /未命中[\s\S]*-4\.2/);
  assert.match(await publicA.locator('.score-window[data-window="10"]').innerText(), /未命中[\s\S]*-3\.8/);
  await click(publicA.locator('details > summary'));
  const rowText = await publicA.innerText();
  for (const detail of [historyRationale, research, '未定', '70%', '445.000', '480.000', '400.000', baseDate, d5Date, d10Date, source, '已完成']) {
    assert.ok(rowText.includes(detail), 'PM 可核验完整登记和计分证据：' + detail);
  }
  const publicView = await state();
  assert.equal(publicView.registrations.paired, 1);
  assert.deepEqual(publicView.registrations.results.filter(row => ['A','B'].includes(row.role)).map(row => [row.hitRate,row.avgScore]), [[0,-3.8],[100,3.8]]);
  await captureTop(PM, 'registration-result.png');
  const mobileScore = B.locator('#registration-results article[data-registration-id="' + second.entry.id + '"]');
  await mobileScore.scrollIntoViewIfNeeded();
  assert.equal(await B.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await B.screenshot({path:join(captures,'registration-mobile.png'), animations:'disabled'});

  const instantReview = PM.locator('#instant-review-form');
  await instantReview.locator('[name=pairNo]').selectOption('1');
  const approvalNote = '已核对两份登记、收盘价、五日和十日的命中及评分。';
  await instantReview.locator('[name=note]').fill(approvalNote);
  await click(instantReview.locator('button[value=accept]'));
  await PM.locator('#pair-review-log').getByText(/验收通过/).waitFor();
  const registrationReceipts = await until(async () => {
    const current = await state();
    return current.registrations.reviews[0]?.decision === 'accept' && current.notifications.length === 3 &&
      current.notifications.every(row => row.status === 'sent' && row.mode === 'local') && current.notifications;
  },'双人登记、PM 核对与群播报送达');
  const scoreReceipt = registrationReceipts.find(row => row.title.includes('双方登记结果'));
  assert.ok(scoreReceipt);
  for (const detail of [d10Date, 'T+5', 'T+10', '命中率 0.00%', '命中率 100.00%', '评分 -3.8', '评分 +3.8', '待 PM 核对验收']) {
    assert.ok(scoreReceipt.text.includes(detail), '播报少了 ' + detail);
  }
  const reviewReceipt = registrationReceipts.find(row => row.title.includes('PM 验收通过'));
  assert.ok(reviewReceipt);
  for (const detail of [approvalNote, baseDate, d5Date, d10Date, '评分 -3.8', '评分 +3.8']) {
    assert.ok(reviewReceipt.text.includes(detail), '验收播报少了 ' + detail);
  }
  for (const receipt of [scoreReceipt, reviewReceipt]) {
    assertLocalCard(receipt);
    assert.ok(!receipt.text.includes(historyRationale) && !receipt.text.includes(research));
  }
  await nav(PM,'activity');
  await PM.locator('#messages').getByText(reviewReceipt.title, {exact:true}).waitFor();
  await captureTop(PM,'registration-broadcasts.png');

  const instant = {
    source, mode, elapsedMs:{A:first.elapsedMs,B:second.elapsedMs},
    base:[baseDate, baseClose], t5:[d5Date, d5Close], t10:[d10Date, d10Close],
    results:publicView.registrations.results, verifiedFields:true, localReceipts:registrationReceipts.length,
  };
  await Promise.all([nav(PM, 'replay'), nav(A, 'replay'), nav(B, 'replay')]);
  await click(PM.locator('[data-cmd=start]'));
  for (const round of [1,2]) {
    const rationale = round === 1 ? '价格回到前期低位附近，判断未来五个交易日有机会反弹。' : '预计短期回调后会出现反弹，登记一份模拟买入。';
    if (round === 1) {
      await A.locator('#direction').selectOption('buy');
      await A.locator('#rationale').fill(rationale);
      await captureTop(A, 'analyst.png');
    }
    await submit(A,'buy',rationale);
    await until(async () => (await state()).submissions[0].submitted,'首人提交');
    assert.ok(!JSON.stringify(await state('B')).includes(rationale));
    await click(B.locator('[data-cmd=operation]'));
    assert.equal(await B.locator('#direction').evaluate(field => field === document.activeElement), true);
    if (round === 1) {
      await B.locator('#confidence').focus();
      await B.keyboard.press('ArrowRight');
      assert.equal(await B.locator('#confidence-value').innerText(), '71%');
    }
    await submit(B,'pass',round === 1 ? '近几日收盘重心下移，等待走势企稳。' : '反弹尚未站稳，维持观望。');
    await until(async () => (await state()).phase === 'locked','双人锁定');
    await advance('d5');
    const partial = (await state()).history.filter(x => x.round === round);
    assert.equal(partial.length,2);
    assert.ok(partial.every(x => x.d10Close === null));
    await advance('d10');
    await advance(round === 1 ? 'collecting' : 'review');
  }
  const {results,history} = await state();
  assert.deepEqual(results.map(row => [row.hits,row.n,row.hitRate,row.avgScore]),[[0,2,0,-2.7],[2,2,100,2.7]]);
  assert.equal(history.length,4);
  const aLedger = await replayLedger(PM, 'A');
  assert.equal(await aLedger.getByText('仅本人可见', {exact:true}).count(), 0);
  const aScore = aLedger.locator('.ledger-metric').filter({has:PM.getByText('平均评分',{exact:true})});
  assert.match(await aScore.locator('dd').innerText(), /^-2\.70/);
  const positions = aLedger.getByRole('table',{name:'模拟持仓',exact:true});
  assert.match(await positions.innerText(), /440\.200/);
  const aTimeline = aLedger.getByRole('table',{name:'建议时间线',exact:true});
  const recent = aTimeline.locator('tbody tr').first();
  assert.match(await recent.innerText(), /2026-09-03/);
  await click(recent.locator('details.ledger-reason > summary'));
  assert.ok((await recent.innerText()).includes('登记一份模拟买入'));
  assert.ok((await recent.innerText()).includes('登记信心 70%'));
  await captureTop(PM, 'ledger.png');
  await returnFromReplayLedger(PM);

  const bLedger = await replayLedger(B, 'B');
  assert.ok((await bLedger.innerText()).includes('0 个独立样本'));
  const bScore = bLedger.locator('.ledger-metric').filter({has:B.getByText('平均评分',{exact:true})});
  assert.match(await bScore.locator('dd').innerText(), /^\+2\.70/);
  assert.ok((await bLedger.innerText()).includes('暂无模拟持仓'));
  assert.equal(await B.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await returnFromReplayLedger(B);
  await nav(B, 'activity');
  assert.equal(await B.locator('#hook-panel').isVisible(), false);
  await nav(B, 'replay');
  await PM.locator('#review-note').fill('已核对四条建议、原始收盘价和累计结果。');
  await click(PM.locator('#review-form button[value=accept]'));
  await until(async () => (await state()).phase === 'complete','PM 验收');
  await click(PM.locator('[data-cmd=settings]'));
  await PM.locator('#activity-view').waitFor({state:'visible'});
  assert.equal(new URL(PM.url()).hash, '#activity');
  await PM.locator('#hook-panel[open] #hook-url').waitFor({state:'visible'});
  await click(PM.locator('[data-cmd=test-hook]'));
  await until(async () => {
    const current = await state();
    return current.notifications.some(n => n.title.includes('连通测试')) &&
      current.notifications.every(n => n.status === 'sent' && n.mode === 'local') && current;
  },'本地 webhook 回执');
  await PM.locator('#messages').getByText('连通测试',{exact:false}).first().waitFor();
  await nav(PM, 'replay');
  await until(async () => (await PM.locator('#results').innerText()).includes('2.70'),'PM 页面反映实际成绩');
  await until(async () => (await B.locator('#results').innerText()).includes('2.70'),'手机页面反映实际成绩');
  assert.equal(await B.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await captureTop(PM, 'pm.png');
  await captureTop(B, 'analyst-mobile.png');
  // The next group includes the new analyst and the PM reviews all three results together.
  await Promise.all([nav(PM,'overview'),nav(A,'overview'),nav(B,'overview')]);
  const newEntry = await submitRegistration(C, await fillRegistration(C,'buy','新增分析师独立填写历史分析。','5d'));
  assert.equal(newEntry.entry.pairNo,2);
  assert.equal(newEntry.entry.role,cRole);
  assert.equal(newEntry.entry.score.score,-3.8);
  const newGroup = (await state()).registrations.groups.find(group => group.pairNo === 2);
  assert.deepEqual(new Set(newGroup.memberIds),new Set(['A','B',cRole]));
  assert.deepEqual(newGroup.submittedIds,[cRole]);
  assert.equal(newGroup.complete,false);
  assert.ok(!(await state()).registrations.entries.some(entry => entry.id === newEntry.entry.id));
  const cFirst = await until(async () => (await state()).notifications.find(row =>
    row.title.includes(cName) && row.text.includes('评分 -3.8') && row.status === 'sent'),'新增分析师先登记并播报本人评分');
  assertLocalCard(cFirst);
  const aForGroup = await submitRegistration(A, await fillRegistration(A,'buy','第二组的独立判断'));
  const bForGroup = await submitRegistration(B, await fillRegistration(B,'pass','第二组观察回调','10d'));
  assert.equal(aForGroup.entry.pairNo,2);
  assert.equal(bForGroup.entry.pairNo,2);
  const completeGroup = (await state()).registrations.groups.find(group => group.pairNo === 2);
  assert.equal(completeGroup.complete,true);
  const cProfileLink = PM.locator('#registration-profiles a[href="#ledger-' + cRole + '"]');
  await click(cProfileLink);
  await PM.locator('#ledger-head h1').waitFor({state:'visible'});
  assert.match(await PM.locator('#ledger-head h1').innerText(), /研究员 C/);
  assert.equal((await state()).registrations.books[cRole].summary.avg_score,-3.8);
  const dynamicScore = PM.locator('#ledger-content .ledger-metric')
    .filter({has:PM.getByText('平均评分',{exact:true})}).locator('dd');
  await until(async () => /^-3\.80(?:\s|$)/.test(await dynamicScore.innerText()), '新增分析师页面反映实际成绩');
  await nav(PM,'overview');
  await instantReview.locator('[name=pairNo]').selectOption('2');
  await instantReview.locator('[name=note]').fill('核对三位分析师的第 5 日和第 10 日结果。');
  await click(instantReview.locator('button[value=accept]'));
  const multiReviewReceipt = await until(async () => {
    const current = await state();
    if (!current.registrations.reviews.some(r => r.pairNo === 2 && r.decision === 'accept')) return null;
    return current.notifications.find(row => row.title.includes('第 2 组') &&
      row.title.includes('PM 验收通过') && row.status === 'sent');
  },'三分析师批次验收与机器人回执');
  assert.ok(multiReviewReceipt.text.includes(cName));
  assertLocalCard(multiReviewReceipt);
  await captureTop(PM,'multiple-analysts.png');
  // A suggestion entered today has no future T+5. A real score refresh must keep it pending.
  await nav(A,'overview');
  const freshForm = A.locator('#registration-form');
  const beijingMinute = new Date(Date.now() + 8 * 3600_000 - 60_000).toISOString().slice(0,16);
  const expectedUTC = new Date(beijingMinute + ':00+08:00').toISOString();
  await freshForm.locator('[name=ticker]').fill('600519.SH');
  await freshForm.locator('[name=recommended_at]').fill(beijingMinute);
  await freshForm.locator('[name=horizon]').selectOption('5d');
  await freshForm.locator('[name=rationale]').fill('以实际登记时间跟踪后续观察窗口。');
  const [registeredNow] = await Promise.all([
    A.waitForResponse(r => new URL(r.url()).pathname === '/api/registrations' && r.request().method() === 'POST', {timeout:60000}),
    click(freshForm.getByRole('button',{name:'登记建议',exact:true})),
  ]);
  const {entry:pending} = await registeredNow.json();
  assert.equal(pending.status,'pending');
  assert.equal(pending.recommendation.ticker,'600519.SH');
  assert.equal(pending.recommendation.horizon,'5d');
  assert.equal(pending.recommendation.recommended_at, expectedUTC);
  assert.equal(pending.score,null);
  await A.locator('#registration-results article[data-registration-id="' + pending.id + '"]').waitFor();
  const [refreshed] = await Promise.all([
    A.waitForResponse(r => new URL(r.url()).pathname === '/api/registrations/refresh', {timeout:60000}),
    click(A.getByRole('button',{name:'刷新评分',exact:true})),
  ]);
  assert.equal((await refreshed.json()).entry.score,null);
  assert.equal((await state('A')).registrations.results.find(result => result.role === 'A').n,2);
  const final = await until(async () => {
    const v = await state();
    return v.notifications.some(row => row.title === '第 3 组 · 分析师 A 评分结果') &&
      v.notifications.every(n => n.status === 'sent' && n.mode === 'local') && v;
  },'新的待评建议播报待评状态');
  const pendingReceipt = final.notifications.find(row => row.title === '第 3 组 · 分析师 A 评分结果');
  assert.ok(pendingReceipt);
  assert.match(pendingReceipt.text,/600519\.SH/);
  assert.match(pendingReceipt.text,/T\+5 待评[\s\S]*T\+10 待评/);
  assertLocalCard(pendingReceipt);
  // Enter actual fill details from the current suggestion while the browser is on US Pacific time.
  const ownCard = A.locator('#registration-results article[data-registration-id="' + pending.id + '"]');
  await click(ownCard.locator('[data-trade-ticker]'));
  await A.locator('#trades-view').waitFor({state:'visible'});
  const tradeForm = A.locator('#trade-form');
  assert.equal(await tradeForm.locator('[name=ticker]').inputValue(),'600519.SH');
  assert.equal(await tradeForm.locator('[name=price]').inputValue(),'');
  assert.equal(await tradeForm.locator('[name=quantity]').inputValue(),'');
  async function recordTrade(page, fields) {
    const form = page.locator('#trade-form');
    for (const [name,value] of Object.entries(fields)) {
      const field = form.locator('[name=' + name + ']');
      if (['market','direction'].includes(name)) await field.selectOption(value);
      else await field.fill(value);
    }
    const [r] = await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === '/api/trades' && r.request().method() === 'POST'),
      click(form.getByRole('button',{name:'确认成交',exact:true})),
    ]);
    return {code:r.status(),data:await r.json()};
  }
  const buy = await recordTrade(A,{price:'100',quantity:'100',fee:'5',executed_at:beijingMinute});
  assert.equal(buy.code,201);
  assert.equal(buy.data.trade.executed_at,expectedUTC);
  assert.equal((await state('B')).portfolio.trades.length,0);
  const sold = await recordTrade(A,{direction:'sell',price:'110',quantity:'25',fee:'1',executed_at:beijingMinute});
  assert.equal(sold.code,201);
  const excess = await recordTrade(A,{direction:'sell',price:'110',quantity:'76'});
  assert.equal(excess.code,400);
  assert.match(excess.data.error,/持仓/);
  await nav(B,'trades');
  const other = await recordTrade(B,{ticker:'AAPL',market:'US',direction:'buy',price:'200',quantity:'3',fee:'0'});
  assert.equal(other.code,201);
  assert.deepEqual((await state('B')).portfolio.trades.map(t => t.ticker), ['AAPL']);
  assert.equal(await B.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await nav(C,'trades');
  const addedAnalystFill = await recordTrade(C,{ticker:'00700.HK',market:'HK',direction:'buy',price:'450',quantity:'5',fee:'0'});
  assert.equal(addedAnalystFill.code,201);
  assert.equal(addedAnalystFill.data.trade.role,cRole);
  assert.deepEqual((await state(cRole)).portfolio.trades.map(t => t.role),[cRole]);
  await nav(PM,'trades');
  assert.equal(await PM.locator('#trade-form').count(),0);
  await until(async () => (await PM.locator('#trade-history tbody tr').count()) === 4, 'PM 核对多位分析师成交');
  await PM.locator('#trade-account').selectOption(cRole);
  await until(async () => (await PM.locator('#trade-history tbody tr').count()) === 1, 'PM 可按新增分析师筛选成交');
  await PM.locator('#trade-account').selectOption('');
  const portfolio = (await state()).portfolio;
  const position = portfolio.positions.find(p => p.role === 'A');
  assert.deepEqual([position.shares,position.avg_cost,Math.round(position.realized_pnl*100)/100],[75,100.05,247.75]);
  assert.equal((await state()).notifications.length,final.notifications.length);
  await captureTop(PM, 'trade-audit.png');
  await B.locator('#trade-history').getByText('AAPL').first().waitFor();
  await captureTop(B, 'trade-mobile.png');
  assert.deepEqual(errors,[]);
  assert.deepEqual(leaks,[]);
  console.log(JSON.stringify({passed:true,transport:target ? 'shared https' : 'loopback',roles:4,multiAnalystGroup:completeGroup.memberIds.length,instant,presentDay:{beijingMinute,expectedUTC,status:pending.status},executions:portfolio.trades.length,remainingShares:position.shares,rounds:2,historyRows:history.length,
    results,localReceipts:final.notifications.length,review:final.review.decision},null,2));
} catch (error) {
  let failure = error.stack ?? String(error);
  for (const key of Object.values(keys)) {
    if (typeof key === 'string' && key.length > 0) failure = failure.replaceAll(key, '[角色访问码]');
  }
  console.error(failure);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server && server.exitCode === null && server.signalCode === null) {
    const done = once(server,'exit');
    server.kill('SIGTERM');
    await done;
  }
  if (!externalDirectory) await rm(directory,{recursive:true,force:true});
}
