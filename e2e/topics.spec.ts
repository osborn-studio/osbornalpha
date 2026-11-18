// Topic directory fixtures (spec §7.1, §13.2).
import {test,expect} from '@playwright/test';
test.skip(process.env.TOPICS_E2E_FIXTURES !== '1', 'fixture mode only (TOPICS_E2E_FIXTURES=1, no Supabase env)');
test.use({locale:'zh-CN'});
test('directory links to the published dossier',async({page})=>{
 await page.goto('/intel/topics');
 await expect(page.getByRole('heading',{level:1})).toContainText('专题研究');
 await page.getByRole('button',{name:'宏观',exact:true}).click();
 await page.locator('a[data-topic-card][href="/intel/topics/rates-and-banks"]').click();
 await expect(page).toHaveURL(/\/intel\/topics\/rates-and-banks$/);
});
test('company category shows restricted evidence and the majority chip',async({page})=>{
 await page.goto('/intel/topics');await page.getByRole('button',{name:'公司',exact:true}).click();
 const cards=page.locator('a[data-topic-card]');await expect(cards).toHaveCount(1);
 await expect(cards).toHaveAttribute('href','/intel/topics/cn-company');
 await expect(cards.locator('[data-research-state="withheld"]')).toBeVisible();
 await expect(cards.getByText('大部分数值受限')).toBeVisible();
});
test('unmatched title shows the empty state',async({page})=>{
 await page.goto('/intel/topics');await page.getByRole('searchbox').fill('不存在的专题标题');
 await expect(page.getByText('尚无已发布专题')).toBeVisible();
});
test('mobile has no horizontal scroll',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/intel/topics');
 await expect(page.getByRole('heading',{level:1})).toContainText('专题研究');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('English locale cookie changes the heading',async({page})=>{
 await page.goto('/intel/topics');await page.context().addCookies([{name:'NEXT_LOCALE',value:'en',url:page.url()}]);
 await page.reload();await expect(page.getByRole('heading',{level:1})).toContainText('Topic research');
});
// Dossier canvas, drawer and replay acceptance (spec §7.2, M-Topic).
test('dossier shows current version and breadcrumb',async({page})=>{
 await page.goto('/intel/topics/rates-and-banks');
 await expect(page.locator('[data-version-bar] span:visible').filter({hasText:/^v2 · 当前$/})).toBeVisible();
 await expect(page.getByRole('navigation',{name:'专题研究'})).toContainText('专题研究 / 宏观');
});
test('value opens the six-section source dialog and Escape restores the page',async({page})=>{
 await page.goto('/intel/topics/rates-and-banks');
 const value=page.locator('[data-evidence-ordinal="1"]:visible').getByRole('button').first();await value.click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 for(const title of ['身份','来源','时间','变换','许可','链接'])await expect(dialog.getByRole('heading',{level:3,name:new RegExp(title)})).toBeVisible();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(value).toBeFocused();
});
test('restricted company fact cells expose no long digit runs',async({page})=>{
 await page.goto('/intel/topics/cn-company');
 const row=page.locator('tr[data-research-state="withheld"]').first();
 const badge=row.locator('[data-research-state="withheld"]');
 await expect(badge).toBeVisible();
 await expect(badge).toContainText('受限');
 await expect(row).not.toContainText(/\d{3,}/);
});
test('series table switch reveals its equivalent table',async({page})=>{
 await page.goto('/intel/topics/rates-and-banks');
 const section=page.getByTestId('topic-series').first();
 const toggle=section.getByRole('button',{name:'表格',exact:true});
 await toggle.click();
 await expect(toggle).toHaveAttribute('aria-pressed','true');
 const table=section.getByRole('table',{name:'US_UNRATE',exact:true});
 await expect(table.getByRole('row').filter({hasText:'2026-08-31'})).toContainText('3.75%');
});
test('date replay shows its banner and first version',async({page})=>{
 await page.goto('/intel/topics');
 await page.getByRole('button',{name:'宏观',exact:true}).click();
 await page.locator('a[data-topic-card][href="/intel/topics/rates-and-banks"]').click();
 await page.locator('tr[data-evidence-ordinal="1"]').getByRole('button',{name:'3.75%',exact:true}).click();
 const drawer=page.getByRole('dialog');
 await expect(drawer.getByRole('heading',{name:/身份/})).toBeVisible();
 await expect(drawer.getByRole('heading',{name:/许可/})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(drawer).toBeHidden();
 await page.getByLabel('回放 截至',{exact:true}).fill('2026-11-01');
 await expect(page).toHaveURL(/\?asOf=2026-11-01$/);
 await expect(page.locator('[data-dossier-banner="replay"]')).toContainText('回放视图 · 截至 2026-11-01');
 await expect(page.locator('[data-version-bar]')).toContainText('v1');
});
test('explicit older version shows the superseded banner',async({page})=>{
 await page.goto('/intel/topics/rates-and-banks/v/1');
 await expect(page.locator('[data-dossier-banner="superseded"]')).toContainText('你正在看 v1，它已被 v2 取代');
});
test('phone dossier has no horizontal scroll and a full-width drawer',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/intel/topics/rates-and-banks');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.locator('[data-evidence-ordinal="1"]:visible').getByRole('button').first().click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 expect((await dialog.boundingBox())!.width).toBeGreaterThanOrEqual(388);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('directory marks chain link 05 as current',async({page})=>{
 await page.goto('/intel/topics');
 const current=page.locator('[data-research-chain] a[aria-current="page"]');
 await expect(current).toHaveAttribute('href','/intel/topics');
 await expect(current.getByText('05',{exact:true})).toBeVisible();
});

test('phone hub orders five steps and opens the published topic directory',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/intel');
 const cards=page.locator('[data-hub-state]');
 await expect(cards).toHaveCount(5);
 await expect(cards.locator('[data-hub-step]')).toHaveText(['01','02','03','04','05']);
 const foreign=cards.nth(3);
 await expect(foreign).toHaveAttribute('data-entry','foreign');
 await expect(foreign).toHaveAttribute('data-hub-state','notServed');
 await expect(foreign.getByText('未服务',{exact:true})).toBeVisible();
 await expect(foreign.locator('a')).toHaveCount(0);
 const topics=page.getByTestId('intel-topics-card');
 await expect(cards.nth(4)).toHaveAttribute('data-testid','intel-topics-card');
 await expect(topics).toHaveAttribute('data-hub-state','open');
 await expect(topics.locator('dt').filter({hasText:'已发布专题'}).locator('+ dd')).toHaveText('2');
 await expect(topics.locator('dt').filter({hasText:'最近发布'}).locator('+ dd')).toHaveText('利率与银行 · v2');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 const link=topics.getByRole('link');
 await expect(link).toHaveAttribute('href','/intel/topics');
 await link.click();
 await expect(page).toHaveURL(/\/intel\/topics$/);
});

test('English hub shows the Research heading',async({page,context})=>{
 await page.goto('/intel');
 await context.addCookies([{name:'NEXT_LOCALE',value:'en',url:page.url()}]);
 await page.reload();
 await expect(page.getByRole('heading',{level:1})).toHaveText(/^Research\s*研究$/);
});
