import {test as base,expect,type Locator,type Page} from '@playwright/test';
import * as f from './fixtures/company';

// Commander starts the isolated dev server with COMPANY_E2E_FIXTURES=1,
// NEXT_PUBLIC_COMPANY_JUDGMENTS=1 NEXT_PUBLIC_COMPANY_F3_DRAWER=1, no Supabase env.
// client.ts accepts exactly '1' or 'true' for judgments; F3 accepts these or undefined
// (default on). Use literal '1' for BOTH public flags before starting the server.
// Judgment-layer-off is covered by unit tests only. Synthetic layout data, read-only:
// every /api/** request is fulfilled here, including shell analytics; no backend writes.
// Next internals (/_next/**) are unaffected. Never run against a production deployment.
type Scenario={judgments?:'cards'|'gallery'|'loading'|'none'|'failed'|'mismatch';events?:'failed'|'empty'|'withheld';inbox?:'partial'|'failed'};
type ApiMock={scenario:Scenario;perIssuer:string[]};
const test=base.extend<{api:ApiMock}>({
  api:[async({page},use)=>{
    const api:ApiMock={scenario:{},perIssuer:[]};
    const unexpected:string[]=[];
    // Registered first, reached only via fallback: fulfill even mistakes, then fail at teardown.
    await page.route('**/api/**',async route=>{
      unexpected.push(`${route.request().method()} ${route.request().url()}`);
      await route.fulfill({status:500,json:{error:{code:'unmocked_fixture_request'}}});
    });
    await page.route('**/api/**',async route=>{
      const request=route.request(),u=new URL(request.url()),p=u.pathname,s=api.scenario;
      const ok=(json:unknown)=>route.fulfill({status:200,json});
      const fail=(status=500,code='internal')=>route.fulfill({status,json:{error:{code}}});
      // The shell sends a first-login beacon automatically. It is a local no-op, never sent.
      if(p==='/api/events'&&request.method()==='POST')return ok({ok:true});
      if(request.method()!=='GET')return route.fallback();
      if(p==='/api/watchlist/sync')return ok(f.watchlistSync);
      if(p==='/api/entities/resolve'&&u.searchParams.get('ticker')==='FIXT')return ok(f.resolvedIssuer);
      if(p==='/api/companies/freshness')return ok(f.freshness);
      if(p==='/api/companies')return ok(f.directory);
      if(p===`/api/entities/${f.US}/industries`)return ok(f.industries);
      if(p==='/api/tracking/watches')return ok(s.inbox==='failed'?f.manyWatches:s.inbox?f.watches:f.noWatches);
      if(p==='/api/tracking/inbox'){
        if(!s.inbox)return fail(404,'watch_not_found'); // membership probe: not watching
        const id=u.searchParams.get('issuerId');
        if(!id)return fail(); // combined inbox unavailable
        api.perIssuer.push(id);
        if(s.inbox==='failed'||id===f.watches.watches[1].issuerId)return fail();
        return ok(id===f.US?f.inboxA:f.emptyInbox);
      }
      if(p==='/api/judgments'){
        if(s.judgments==='loading'){
          await new Promise(resolve=>setTimeout(resolve,4000));
          try{return await ok(f.judgments);}catch(error){if(!page.isClosed())throw error;return;}
        }
        if(s.judgments==='failed')return fail();
        return ok(s.judgments==='gallery'?f.judgmentGallery:s.judgments==='none'?f.emptyJudgments:f.judgments);
      }
      const detail=p.match(/^\/api\/judgments\/([^/]+)$/);
      if(detail)return s.judgments==='failed'?fail():ok(f.judgmentDetail(detail[1]));
      if(p==='/api/companies/FIXT/overview')return ok(f.overview);
      if(p==='/api/companies/FIXT/statements')return ok(f.statements);
      if(p==='/api/companies/999999.SH/statements')return ok(f.cnStatements);
      if(p==='/api/companies/FIXT/facts')return ok(f.series);
      if(p==='/api/facts/FIXT')return ok(f.factKeys);
      if(p==='/api/companies/FIXT/metrics')return ok(f.metrics);
      if(p==='/api/companies/FIXT/filings')return ok(f.filings);
      if(p==='/api/companies/FIXT/events')return s.events==='failed'?fail():ok(s.events==='withheld'?f.withheldEvents:f.emptyEvents);
      if(p==='/api/broker-research/by-ticker/FIXT')return ok({ticker:'FIXT',issuerId:f.US,reports:[],count:0});
      if(p==='/api/dcf/FIXT')return fail(404,'fixture_no_model');
      return route.fallback();
    });
    await use(api);
    expect(unexpected,'Unmocked API calls were blocked; add an explicit typed fixture').toEqual([]);
  },{auto:true}],
});
test.skip(process.env.COMPANY_E2E_FIXTURES!=='1','fixture mode only (COMPANY_E2E_FIXTURES=1, no Supabase env)');
test.use({serviceWorkers:'block'});
const normalCell=(page:Page)=>page.getByTestId(`cell-revenue-${f.PERIOD}`);
const sourceDialog=(page:Page)=>page.getByRole('dialog').filter({has:page.locator('[data-drawer-section="identity"]')});
async function assertSource(page:Page){
  const drawer=sourceDialog(page);
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('financial_fact');
  await expect(drawer.locator('[data-drawer-section="source"]')).toContainText('SEC EDGAR');
  await expect(drawer.locator('[data-drawer-section]')).toHaveCount(6);
  for(const id of ['identity','source','times','transform','licence','links'])await expect(drawer.locator(`[data-drawer-section="${id}"]`)).toBeAttached();
  return drawer;
}
async function assertPartial(page:Page){
  await expect(page.getByTestId('inbox-partial-chip')).toBeVisible();
  const table=page.getByTestId('inbox-company-status');
  await expect(table).toBeVisible();
  await expect(table.getByTestId('inbox-unavailable-row')).toHaveCount(1);
  await expect(table.getByTestId('inbox-unavailable-row')).toContainText('事件暂不可用');
  await expect(table.getByRole('row').filter({hasText:'该期间无事件'})).toHaveCount(1);
  const list=page.getByTestId('inbox-list');
  for(const row of f.inboxA.rows)await expect(list.locator(`[data-event-id="${row.eventId}"]`)).toBeVisible();
}

test.describe('公司夹具 · 中文',()=>{
  test.use({locale:'zh-CN'});
  test('identity, chain availability and provenance footer',async({page})=>{
    await page.goto('/stock/FIXT');
    await expect(page.getByRole('heading',{level:1})).toHaveCount(1);
    await expect(page.getByRole('heading',{level:1})).toContainText('夹具公司');
    await expect(page.locator('[data-research-page-header]')).toBeVisible();
    await expect(page.getByTestId('company-header').getByRole('link',{name:'公司研究',exact:true})).toHaveAttribute('href','/intel/companies');
    await expect(page.locator('[data-freshness="fresh"]')).toBeVisible();
    await expect(page.getByTestId('chain-chip-industry')).toHaveAttribute('href','/intel/industries/sic/7372');
    const foreign=page.getByTestId('chain-chip-foreign');
    await expect(foreign.locator('[data-research-state="notServed"]')).toHaveText('未服务');
    await expect(foreign).not.toHaveAttribute('href');
    await expect(foreign.getByRole('link')).toHaveCount(0);
    await expect(page.locator('[data-research-footer]')).toContainText('SEC EDGAR');
  });
  test('primary tab order, More focus and legacy signals URL',async({page})=>{
    await page.goto('/stock/FIXT');
    await expect(page.getByRole('navigation',{name:'公司页视图'}).getByRole('link')).toHaveText(['概览','报表','指标','文件','跟踪','判断']);
    const more=page.getByTestId('company-more');
    await expect(more).toHaveAccessibleName('更多');
    await more.click();
    const menu=page.locator(`[id="${await more.getAttribute('aria-controls')}"]`);
    for(const name of ['模型观点（未校准）','信号','持仓'])await expect(menu.getByRole('link',{name,exact:true})).toBeVisible();
    await menu.getByRole('link',{name:'信号',exact:true}).focus();
    await page.keyboard.press('Escape');
    await expect(more).toHaveAttribute('aria-expanded','false');
    await expect(more).toBeFocused();
    await expect(menu.getByRole('link',{name:'信号',exact:true})).toBeHidden();
    await page.goto('/stock/FIXT?view=signals');
    await expect(page.getByTestId('company-more')).toHaveAccessibleName('更多 · 信号');
    await expect(page.getByTestId('company-more')).toBeVisible();
    await expect(page.getByText('该标的近 90 天信号回看待开发（v1.0）。', {exact:true})).toBeVisible();
  });
  test('statement value opens shared source; Escape restores cell focus',async({page})=>{
    await page.goto('/stock/FIXT?view=statements');
    const cell=normalCell(page);
    await expect(page.getByTestId('grid-row-revenue')).toBeVisible();
    await expect(cell).toContainText('123');
    await cell.click();
    const drawer=await assertSource(page);
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(cell).toBeFocused();
  });
  test('CN withheld cell never renders digits and opens identity/reason only',async({page})=>{
    await page.goto('/stock/999999.SH?view=statements');
    const cell=page.getByTestId(`cell-revenue_operating-${f.PERIOD}`);
    await expect(cell.locator('[data-research-state="withheld"]')).toBeVisible();
    await expect(cell).not.toContainText(/\d/);
    await cell.click();
    const drawer=sourceDialog(page);
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('[data-drawer-section]')).toHaveCount(1);
    await expect(drawer.locator('[data-drawer-section="identity"]')).toContainText('citation_pending');
    await expect(drawer.locator('[data-drawer-section="source"]')).toHaveCount(0);
    await expect(drawer.locator('[data-research-state="withheld"]')).toBeVisible();
  });
  test('formula → input history stack; Escape pops only the top',async({page})=>{
    await page.goto('/stock/FIXT?view=metrics');
    await page.getByTestId('metric-row-gross_margin').getByRole('button').first().click();
    const formula=page.getByRole('dialog');
    await expect(formula).toBeVisible();
    await formula.getByRole('button',{name:/revenue/}).click();
    await assertSource(page);
    await expect(page.getByRole('dialog',{includeHidden:true})).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(sourceDialog(page)).toHaveCount(0);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button',{name:/revenue/})).toBeFocused();
  });
  for(const [scenario,state] of [['cards','cards'],['none','none'],['failed','failed'],['mismatch','replayMismatch']] as const){
    test(`judgments: ${state}`,async({page,api})=>{
      api.scenario.judgments=scenario;
      await page.goto(`/stock/FIXT?view=judgments${scenario==='mismatch'?'&asOf=2026-01-31':''}`);
      const view=page.locator(`[data-judgments-state="${state}"]`);
      await expect(view).toBeVisible();
      if(state==='cards')await expect(view.locator('[data-mark="judgment"]').first()).toBeVisible();
      else await expect(view.locator('[data-mark="judgment"]')).toHaveCount(0);
      if(state==='failed')await expect(view.getByRole('button',{name:'重试',exact:true})).toBeVisible();
      if(state==='replayMismatch')await expect(page.locator('[data-mark="judgment"]')).toHaveCount(0);
    });
  }
  for(const scenario of ['failed','empty','withheld'] as const){
    test(`tracking: ${scenario}`,async({page,api})=>{
      api.scenario.events=scenario;
      await page.goto('/stock/FIXT?view=tracking');
      const view=page.locator(`[data-tracking-state="${scenario==='failed'?'unavailable':'empty'}"]`);
      await expect(view).toBeVisible();
      if(scenario==='failed'){
        await expect(view).toContainText('事件暂不可用');
        await expect(view.getByRole('button',{name:'重试',exact:true})).toBeVisible();
        await expect(view.getByRole('link')).toHaveAttribute('href','/stock/FIXT?view=filings');
        await expect(page.getByTestId('inbox-row')).toHaveCount(0);
        await expect(view).not.toContainText('该期间无事件');
      }else{
        await expect(view).toContainText('该期间无事件');
        await expect(page.getByTestId('company-tracking').getByRole('alert')).toHaveCount(0);
        if(scenario==='withheld')await expect(page.getByTestId('tracking-withheld').locator('[data-research-state="withheld"]')).toBeVisible();
      }
    });
  }
  test('inbox partial: A rows survive B failure and C empty',async({page,api})=>{
    api.scenario.inbox='partial';
    await page.goto('/watchlist/tracking');
    await assertPartial(page);
  });
  test('inbox total failure stops after concurrency-bound first batch',async({page,api})=>{
    api.scenario.inbox='failed';
    await page.goto('/watchlist/tracking');
    await expect(page.getByTestId('inbox-unavailable')).toBeVisible();
    // Six watches, but probeInboxPerIssuer defaults to four; no second batch is allowed.
    await expect.poll(()=>api.perIssuer.length).toBe(4);
    await expect(page.getByText('加载中…',{exact:true})).toBeHidden();
    expect(api.perIssuer).toHaveLength(4);
    expect(new Set(api.perIssuer).size).toBe(4);
    await expect(page.getByTestId('inbox-partial-chip')).toHaveCount(0);
  });
  test('directory header, freshness strip and footer',async({page})=>{
    await page.goto('/intel/companies');
    await expect(page.locator('[data-research-page-header]').getByRole('heading',{level:1})).toHaveText('公司覆盖');
    await expect(page.getByTestId('directory-row')).toHaveCount(1);
    await expect(page.getByTestId('freshness-strip')).toContainText('facts.us');
    await expect(page.locator('[data-research-footer]')).toBeVisible();
  });
  test.describe('375px mobile',()=>{
    test.use({viewport:{width:375,height:812}});
    for(const path of ['/stock/FIXT','/stock/FIXT?view=statements','/stock/FIXT?view=tracking','/stock/FIXT?view=judgments','/watchlist/tracking','/intel/companies']){
      test(path,async({page,api})=>{
        api.scenario={events:'failed',judgments:'cards',inbox:path==='/watchlist/tracking'?'partial':undefined};
        await page.goto(path);
        if(path==='/watchlist/tracking')await assertPartial(page);
        else if(path==='/intel/companies')await expect(page.getByTestId('directory-row')).toHaveCount(1);
        else{
          await expect(page.getByTestId('chain-chip-industry')).toHaveAttribute('href','/intel/industries/sic/7372');
          if(path.includes('tracking'))await expect(page.locator('[data-tracking-state="unavailable"]')).toBeVisible();
          if(path.includes('judgments'))await expect(page.locator('[data-judgments-state="cards"]')).toBeVisible();
          if(path.includes('statements'))await expect(normalCell(page)).toBeVisible();
          if(path==='/stock/FIXT')await expect(page.getByTestId('overview-latest')).toBeVisible();
          const more=page.getByTestId('company-more');
          await expect(more).toBeVisible();
          await more.click();
          const menu=page.locator(`[id="${await more.getAttribute('aria-controls')}"]`);
          await expect(menu).toBeVisible();
          const box=await menu.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x+box!.width).toBeLessThanOrEqual(375);
          expect(box!.y).toBeGreaterThanOrEqual(0);
          expect(box!.y+box!.height).toBeLessThanOrEqual(812);
          await page.keyboard.press('Escape');
        }
        expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
        if(path.includes('statements')){
          await normalCell(page).click();
          const drawer=await assertSource(page),box=await drawer.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.x).toBe(0);
          expect(box!.width).toBe(375);
        }
      });
    }
  });
});

async function shot(page:Page,name:string,fullPage=true){
  if(process.env.UI_SHOT_DIR)await page.screenshot({path:`${process.env.UI_SHOT_DIR}/${name}.png`,fullPage});
}
async function touchHeight(control:Locator){
  expect.soft((await boxOf(control)).height,`touch height of ${control}`).toBeGreaterThanOrEqual(44);
}
async function pageWidth(page:Page,width:number){
  expect.soft(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}
async function boxOf(locator:Locator){
  await expect(locator).toBeVisible();
  const box=await locator.boundingBox();
  if(!box)throw new Error(`No bounding box for ${locator}`);
  return {left:box.x,top:box.y,right:box.x+box.width,bottom:box.y+box.height,height:box.height};
}
async function openMoreInsideViewport(page:Page){
  const more=page.getByTestId('company-more');
  await more.click();
  const menu=page.locator(`[id="${await more.getAttribute('aria-controls')}"]`);
  const box=await boxOf(menu),viewport=page.viewportSize()!;
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(viewport.width);
  expect(box.bottom).toBeLessThanOrEqual(viewport.height);
  return menu;
}

for(const [locale,labels] of [
  ['zh-CN',['正常','过期','读取失败','尚无记录','未知']],
  ['en-US',['Current','Stale','Read failed','No record yet','Unknown']],
] as const)test.describe(`directory freshness · ${locale}`,()=>{
  test.use({locale});
  test('localizes each dataset status',async({page})=>{
    const datasets=['fresh','stale','error','missing','unknown'].map((status,i)=>({
      ...f.freshness.datasets[0],dataset:`fixture.${i}`,status,
    }));
    await page.route('**/api/companies/freshness',route=>route.fulfill({json:{datasets}}));
    await page.goto('/intel/companies');
    const strip=page.getByTestId('freshness-strip');
    for(const [i,{dataset,status}] of datasets.entries()){
      await expect(strip).toContainText(`${dataset} ${labels[i]}`);
      await expect(strip).not.toContainText(new RegExp(`\\b${status}\\b`));
    }
  });
});

test.describe('390px tab row and action row',()=>{
  test.use({viewport:{width:390,height:844}});
  for(const locale of ['zh-CN','en-US'] as const)test.describe(locale,()=>{
    test.use({locale});
    test('tabs scroll fully into view and controls have their own lines',async({page})=>{
      await page.goto('/stock/FIXT');
      const strip=page.getByTestId('company-tabs-strip'),links=strip.getByRole('link');
      await expect(links).toHaveCount(6);
      for(const link of await links.all()){
        await link.scrollIntoViewIfNeeded();
        const tab=await boxOf(link),bounds=await boxOf(strip);
        expect(tab.left).toBeGreaterThanOrEqual(bounds.left-1);
        expect(tab.right).toBeLessThanOrEqual(bounds.right+1);
        expect(tab.top).toBeGreaterThanOrEqual(bounds.top-1);
        expect(tab.bottom).toBeLessThanOrEqual(bounds.bottom+1);
        expect(await link.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
      }
      const more=await boxOf(page.getByTestId('company-more'));
      const tabs=page.getByTestId('company-tabs'),opener=tabs.locator('button:not([data-testid="company-more"])');
      const replay=await boxOf(opener);
      const bounds=await boxOf(strip);
      expect(more.top).toBeGreaterThanOrEqual(bounds.bottom-1);
      for(const control of [more,replay]){
        expect(control.top>=bounds.bottom||control.bottom<=bounds.top||
          control.left>=bounds.right||control.right<=bounds.left).toBe(true);
      }
      expect.soft(replay.height).toBeGreaterThanOrEqual(44);
      await shot(page,`company-tabs-390-${locale}`);
      await opener.click();
      const apply=tabs.getByRole('button',{name:locale==='zh-CN'?'应用':'Apply',exact:true});
      const cancel=tabs.getByRole('button',{name:locale==='zh-CN'?'取消':'Cancel',exact:true});
      for(const control of [tabs.locator('input[type=date]'),apply,cancel])await touchHeight(control);
      await expect(links).toHaveCount(6);
      const tops=await links.evaluateAll(els=>els.map(el=>el.getBoundingClientRect().top));
      expect.soft(Math.max(...tops)-Math.min(...tops)).toBeLessThanOrEqual(1);
      await pageWidth(page,390);
      await shot(page,`company-replay-open-390-${locale}`);
      await cancel.click();
      await expect(opener).toBeVisible();
      const menu=await openMoreInsideViewport(page);
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();

      const actions=page.getByTestId('company-actions');
      const caption=await boxOf(actions.getByTestId('company-actions-caption'));
      for(const control of await actions.locator('button:visible,summary:visible,a:visible').all()){
        const box=await boxOf(control);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(caption.top).toBeGreaterThanOrEqual(box.bottom);
      }
      await actions.locator('summary').click();
      const menuLinks=actions.locator('details[open]').getByRole('link');
      await expect(menuLinks.first()).toBeVisible();
      for(const link of await menuLinks.all())expect((await boxOf(link)).height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    });
    test('replay bar controls fit and have full touch targets',async({page})=>{
      await page.goto('/stock/FIXT?asOf=2026-01-31');
      const bar=page.getByTestId('replay-bar'),bounds=await boxOf(bar);
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(page.viewportSize()!.width);
      await touchHeight(bar.locator('input[type=date]'));
      for(const button of await bar.locator('button:visible').all())await touchHeight(button);
      await pageWidth(page,390);
      await shot(page,`company-replay-bar-390-${locale}`);
    });
  });
});

test.describe('1280px tab row and action row',()=>{
  test.use({locale:'zh-CN',viewport:{width:1280,height:800}});
  test('keeps More beside the tabs and the caption beside Watchlist',async({page})=>{
    await page.goto('/stock/FIXT');
    const tab=await boxOf(page.getByTestId('company-tabs-strip').getByRole('link').first());
    const more=await boxOf(page.getByTestId('company-more'));
    expect(Math.min(tab.bottom,more.bottom)).toBeGreaterThan(Math.max(tab.top,more.top));
    await openMoreInsideViewport(page);
    const actions=page.getByTestId('company-actions');
    const watchlist=await boxOf(actions.getByRole('button',{name:'加入自选',exact:true}));
    const caption=await boxOf(actions.getByTestId('company-actions-caption'));
    expect(Math.min(watchlist.bottom,caption.bottom)).toBeGreaterThan(Math.max(watchlist.top,caption.top));
  });
});

test.describe('company fixtures · English',()=>{
  test.use({locale:'en-US'});
  test('English tabs, availability and shared drawer sections',async({page,api})=>{
    await page.goto('/stock/FIXT');
    await expect(page.getByRole('heading',{level:1})).toContainText('Fixture Corp');
    await expect(page.getByRole('navigation',{name:'Company views'}).getByRole('link')).toHaveText(['Overview','Statements','Metrics','Filings','Tracking','Judgments']);
    await expect(page.getByTestId('company-more')).toHaveAccessibleName('More');
    await expect(page.getByTestId('company-more')).toBeVisible();
    await expect(page.getByTestId('chain-chip-foreign')).toContainText('Not served');
    api.scenario.events='failed';
    await page.goto('/stock/FIXT?view=tracking');
    await expect(page.locator('[data-tracking-state="unavailable"]')).toContainText('Events temporarily unavailable');
    await page.goto('/stock/FIXT?view=statements');
    await normalCell(page).click();
    const drawer=await assertSource(page);
    for(const title of ['Identity','Source','Times','Transform','Licence','Links'])await expect(drawer.getByRole('heading',{level:3,name:new RegExp(` · ${title}$`)})).toBeVisible();
  });
});

const rawCodes=['pending_fill','self_assessed','insufficient','first_observed','cutoff_vintage','trading_sessions','session_index','financial_fact','financial_metric','price_bar','settle_by','settle_after','as_known','input_unavailable'];
async function assertNoRawCodes(container:Locator){
  const text=await container.innerText();
  expect.soft(rawCodes.filter(code=>new RegExp(`\\b${code}\\b`).test(text))).toEqual([]);
}

test.describe('judgments states',()=>{
  for(const [vw,viewport] of [['desktop',{width:1280,height:800}],['phone',{width:390,height:844}]] as const)
    for(const locale of ['zh-CN','en-US'] as const)test.describe(`${vw} · ${locale}`,()=>{
      test.use({viewport,locale});
      for(const state of ['loading','none','failed','replayMismatch'] as const)test(state,async({page,api})=>{
        api.scenario.judgments=state==='replayMismatch'?'mismatch':state;
        await page.goto(`/stock/FIXT?view=judgments${state==='replayMismatch'?'&asOf=2026-01-31':''}`);
        const container=page.locator(`[data-judgments-state="${state}"]`);
        await expect(container).toBeVisible();
        await pageWidth(page,viewport.width);
        if(vw==='phone')for(const button of await container.locator('button:visible').all())await touchHeight(button);
        await shot(page,`judgments-${state}-${vw}-${locale}`);
      });
      test('gallery, inputs and timeline',async({page,api})=>{
        api.scenario.judgments='gallery';
        await page.goto('/stock/FIXT?view=judgments');
        const container=page.locator('[data-judgments-state="cards"]'),articles=container.locator('article');
        await expect(container).toBeVisible();
        await expect(container.locator('[data-mark="judgment"]')).toHaveCount(f.judgmentGallery.cards.length);
        await expect(articles).toHaveCount(f.judgmentGallery.cards.length);
        if(vw==='phone')for(const article of await articles.all()){
          await article.locator(':scope > button[aria-expanded="false"]').click();
          await expect(article.locator(':scope > button[aria-expanded="true"]')).toBeVisible();
        }
        await pageWidth(page,viewport.width);
        for(const article of await articles.all()){
          const bounds=await boxOf(article);
          expect.soft(bounds.left).toBeGreaterThanOrEqual(0);
          expect.soft(bounds.right).toBeLessThanOrEqual(viewport.width);
        }
        if(vw==='phone')for(const button of await container.locator('button:visible').all())await touchHeight(button);
        await assertNoRawCodes(container);
        await shot(page,`judgments-cards-${vw}-${locale}`);
        await articles.first().getByRole('button',{name:locale==='zh-CN'?/^输入 \d+$/:/^Inputs \d+$/}).click();
        const dialog=page.getByRole('dialog'),bounds=await boxOf(dialog);
        expect.soft(bounds.left).toBeGreaterThanOrEqual(0);
        expect.soft(bounds.top).toBeGreaterThanOrEqual(0);
        expect.soft(bounds.right).toBeLessThanOrEqual(viewport.width);
        expect.soft(bounds.bottom).toBeLessThanOrEqual(viewport.height);
        await pageWidth(page,viewport.width);
        await assertNoRawCodes(dialog);
        await shot(page,`judgments-drawer-inputs-${vw}-${locale}`,false);
        const timeline=dialog.getByRole('tab').nth(1);
        await timeline.click();
        await expect(timeline).toHaveAttribute('aria-selected','true');
        await assertNoRawCodes(dialog);
        await shot(page,`judgments-drawer-timeline-${vw}-${locale}`,false);
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
      });
    });
});
