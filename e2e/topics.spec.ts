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
