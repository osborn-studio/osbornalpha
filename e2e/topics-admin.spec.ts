// Topic plan T5.5: admin fixture editor. Run only against the isolated fixture server.
import {test,expect,type Page} from '@playwright/test';
test.skip(process.env.TOPICS_E2E_FIXTURES!=='1','fixture mode only (TOPICS_E2E_FIXTURES=1, no Supabase env)');
test.use({locale:'zh-CN'});
async function openEditor(page:Page){
 await page.goto('/admin/topics');
 await page.getByRole('row').filter({hasText:'rates-and-banks'}).getByRole('link',{name:'编辑',exact:true}).click();
 await expect(page.getByRole('heading',{level:1,name:'编辑专题'})).toBeVisible();
}
test('list shows the seeded draft and closed directory',async({page})=>{
 await page.goto('/admin/topics');
 await expect(page.getByRole('button',{name:/^草稿/})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('row').filter({hasText:'rates-and-banks'})).toContainText('利率与银行');
 await expect(page.getByText('目录开关：未对外',{exact:true})).toBeVisible();
});
test('editor lints, searches, adds evidence and saves explicitly',async({page})=>{
 await openEditor(page);
 for(const name of ['分节与证据','文字','证据选择器'])await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
 const outline=page.getByRole('region',{name:'分节与证据'}),picker=page.getByRole('region',{name:'证据选择器'});
 for(const n of [1,2,3])await expect(outline.getByText(`ev:${n}`,{exact:true})).toBeVisible();
 await expect(outline.getByRole('listitem').filter({has:page.getByText('ev:3',{exact:true})}).last()).toContainText(/公开视图\s*受限/);
 await expect(outline.getByText(/预期槽 · 行业数据尚未发布/)).toBeVisible();
 await page.getByLabel('第 1 节 · 编者说明',{exact:true}).fill('失业率为 4.3%');
 await expect(page.getByRole('status').filter({hasText:'裸数字'})).toBeVisible({timeout:5000});
 await picker.getByLabel('序列 id',{exact:true}).fill('US_UNRATE');
 await picker.getByLabel('数据期',{exact:true}).fill('2026-08-31');
 await picker.getByRole('button',{name:'查找',exact:true}).click();
 await expect(picker.getByRole('row').filter({hasText:'US_UNRATE'})).toHaveCount(1);
 // macro.ts has one public ok observation, already in the draft. A pinned cutoff is a distinct ref.
 const available=picker.getByRole('button',{name:'加入',exact:true});
 if(await available.count()===0){
  await expect(picker.getByRole('button',{name:'已加入',exact:true})).toBeDisabled();
  await picker.getByLabel('截至',{exact:true}).fill('2026-11-14');
  await picker.getByRole('button',{name:'查找',exact:true}).click();
 }
 await expect(available.first()).toBeEnabled();await available.first().click();
 await expect(outline.getByText('ev:4',{exact:true})).toBeVisible();
 const revision=page.getByTestId('draft-revision'),before=Number((await revision.innerText()).match(/草稿修订 (\d+)/)?.[1]);
 await page.getByRole('button',{name:'保存草稿',exact:true}).click();
 await expect(page.getByRole('button',{name:'1 保存 ✓',exact:true})).toBeVisible();
 await expect(revision).toContainText(`草稿修订 ${before+1} ·`);
});
test('new topic validates slug and redirects on creation',async({page})=>{
 await page.goto('/admin/topics/new');
 await page.getByLabel('slug',{exact:true}).fill('Bad Slug');
 await page.getByLabel('中文标题',{exact:true}).fill('新的专题');
 await page.getByLabel('英文标题',{exact:true}).fill('New topic');
 await page.getByRole('button',{name:'创建专题',exact:true}).click();
 await expect(page.locator('#error-slug')).toBeVisible();
 await page.getByLabel('slug',{exact:true}).fill(`fixture-topic-${Date.now()}`);
 await page.getByRole('button',{name:'创建专题',exact:true}).click();
 await expect(page).toHaveURL(/\/admin\/topics\/[0-9a-f-]{36}$/);
 await expect(page.getByRole('heading',{level:1,name:'编辑专题'})).toBeVisible();
 await expect(page.getByLabel('标题',{exact:true})).toHaveValue('新的专题');
});
test('1280 by 800 editor has no horizontal overflow',async({page})=>{
 await page.setViewportSize({width:1280,height:800});await openEditor(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
