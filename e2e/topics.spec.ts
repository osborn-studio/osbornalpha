// Topic directory fixtures (spec §7.1, §13.2).
import {test,expect} from '@playwright/test';
test.skip(process.env.TOPICS_E2E_FIXTURES !== '1', 'fixture mode only (TOPICS_E2E_FIXTURES=1, no Supabase env)');
test.use({locale:'zh-CN'});
test('directory links to the published dossier',async({page})=>{
 await page.goto('/intel/topics');
 await expect(page.getByRole('heading',{level:1})).toContainText('专题研究');
 await expect(page.locator('a[href="/intel/topics/rates-and-banks"]')).toBeVisible();
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
 await expect(row).toBeVisible();await expect(row.getByTestId('evidence-fact')).not.toContainText(/\d{3,}/);
});
test('series table switch reveals its equivalent table',async({page})=>{
 await page.goto('/intel/topics/rates-and-banks');
 const section=page.getByTestId('topic-series').first();
 await section.getByRole('button',{name:'表格',exact:true}).first().click();
 await expect(section.getByRole('table').first()).toBeVisible();
});
test('date replay shows its banner and first version',async({page})=>{
 await page.goto('/intel/topics/rates-and-banks?asOf=2026-11-01');
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
