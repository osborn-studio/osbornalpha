// Topic plan T5.5: admin fixture editor. Run only against the isolated fixture server.
import {test,expect,type Page} from '@playwright/test';
test.skip(process.env.TOPICS_E2E_FIXTURES!=='1','fixture mode only (TOPICS_E2E_FIXTURES=1, no Supabase env)');
test.use({locale:'zh-CN'});
const editorUrl=/\/admin\/topics\/[0-9a-f-]{36}$/;
async function ready(page:Page){
 await expect(page.locator('[data-hydrated="true"]').first()).toBeVisible({timeout:15000});
}
async function openEditor(page:Page){
 await page.goto('/admin/topics');
 await page.getByRole('row').filter({hasText:'rates-and-banks'}).getByRole('link',{name:'编辑',exact:true}).click();
 await expect(page).toHaveURL(editorUrl,{timeout:15000});
 await ready(page);
 await expect(page.getByRole('heading',{level:1,name:'编辑专题'})).toBeVisible({timeout:15000});
}
test('list shows the seeded draft and closed directory',async({page})=>{
 await page.goto('/admin/topics');
 await expect(page.getByRole('button',{name:/^草稿/})).toHaveAttribute('aria-pressed','true',{timeout:15000});
 await expect(page.getByRole('row').filter({hasText:'rates-and-banks'})).toContainText('利率与银行',{timeout:15000});
 await expect(page.getByRole('row').filter({hasText:'cn-company'})).toContainText('中国公司',{timeout:15000});
 await expect(page.getByText('目录开关：未对外',{exact:true})).toBeVisible({timeout:15000});
});
test('editor lints, searches, adds evidence and saves explicitly',async({page})=>{
 await openEditor(page);
 for(const name of ['分节与证据','文字','证据选择器'])await expect(page.getByRole('heading',{name,exact:true})).toBeVisible({timeout:15000});
 const outline=page.getByRole('region',{name:'分节与证据'}),picker=page.getByRole('region',{name:'证据选择器'});
 for(const n of [1,2,3])await expect(outline.getByText(`ev:${n}`,{exact:true})).toBeVisible({timeout:15000});
 await expect(outline.getByRole('listitem').filter({has:page.getByText('ev:3',{exact:true})}).last()).toContainText(/公开视图\s*受限/,{timeout:15000});
 await expect(outline.getByText(/预期槽 · 行业数据尚未发布/)).toBeVisible({timeout:15000});
 const ordinals=outline.getByText(/^ev:\d+$/);
 const extraLines=outline.locator('ul > li').filter({has:page.getByText(/^ev:(?:[4-9]|[1-9]\d+)$/)});
 while(await extraLines.count())await extraLines.first().getByRole('button',{name:'移除',exact:true}).click();
 const nextOrdinal=Math.max(...(await ordinals.allTextContents()).map(label=>Number(label.slice(3))))+1;
 const note=page.getByLabel('第 1 节 · 编者说明',{exact:true}),warning=page.getByRole('status').filter({hasText:'裸数字'});
 await note.fill('截至 {{ev:1.period}}，失业率为 {{ev:1}}。');
 await expect(warning).toHaveCount(0,{timeout:15000});
 await note.fill('失业率为 4.3%');
 await expect(warning).toBeVisible({timeout:15000});
 await picker.getByLabel('序列 id',{exact:true}).fill('US_UNRATE');
 await picker.getByLabel('数据期',{exact:true}).fill('2026-08-31');
 await picker.getByRole('button',{name:'查找',exact:true}).click();
 await expect(picker.getByRole('row').filter({hasText:'US_UNRATE'})).toHaveCount(1,{timeout:15000});
 // macro.ts has one public ok observation, already in the draft. A pinned cutoff is a distinct ref.
 const available=picker.getByRole('button',{name:'加入',exact:true});
 if(await available.count()===0){
  await expect(picker.getByRole('button',{name:'已加入',exact:true})).toBeDisabled({timeout:15000});
  await picker.getByLabel('截至',{exact:true}).fill('2026-11-14');
  await picker.getByRole('button',{name:'查找',exact:true}).click();
 }
 await expect(available.first()).toBeEnabled({timeout:15000});await available.first().click();
 await expect(outline.getByText(`ev:${nextOrdinal}`,{exact:true})).toBeVisible({timeout:15000});
 const revision=page.getByTestId('draft-revision'),before=Number((await revision.innerText()).match(/草稿修订 (\d+)/)?.[1]);
 await page.getByRole('button',{name:'保存草稿',exact:true}).click();
 await expect(page.getByRole('button',{name:'1 保存 ✓',exact:true})).toBeVisible({timeout:15000});
 await expect(revision).toContainText(`草稿修订 ${before+1} ·`,{timeout:15000});
});
test('new topic validates slug and redirects on creation',async({page})=>{
 await page.goto('/admin/topics/new');
 await ready(page);
 await page.getByLabel('slug',{exact:true}).fill('Bad Slug');
 await page.getByLabel('中文标题',{exact:true}).fill('新的专题');
 await page.getByLabel('英文标题',{exact:true}).fill('New topic');
 await page.getByRole('button',{name:'创建专题',exact:true}).click();
 await expect(page.locator('#error-slug')).toBeVisible({timeout:15000});
 await page.getByLabel('slug',{exact:true}).fill(`fixture-topic-${Date.now()}`);
 await page.getByRole('button',{name:'创建专题',exact:true}).click();
 await expect(page).toHaveURL(editorUrl,{timeout:15000});
 await ready(page);
 await expect(page.getByRole('heading',{level:1,name:'编辑专题'})).toBeVisible({timeout:15000});
 await expect(page.getByLabel('标题',{exact:true})).toHaveValue('新的专题',{timeout:15000});
});
test('1280 by 800 editor has no horizontal overflow',async({page})=>{
 await page.setViewportSize({width:1280,height:800});await openEditor(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test.describe.serial('publication',()=>{
 test('publish flow',async({page})=>{
  await page.goto('/admin/topics/new');
  await ready(page);
  await page.getByLabel('slug',{exact:true}).fill(`publish-walk-${Date.now()}`);
  await page.getByLabel('中文标题').fill('发布测试');
  await page.getByLabel('英文标题').fill('Publication walk');
  await page.getByRole('button',{name:'创建专题'}).click();
  await expect(page).toHaveURL(editorUrl,{timeout:15000});
  await ready(page);
  await page.getByRole('button',{name:'新增分节'}).click();
  const picker=page.getByRole('region',{name:'证据选择器'});
  await picker.getByLabel('序列 id').fill('US_UNRATE');
  await picker.getByLabel('数据期').fill('2026-08-31');
  await picker.getByRole('button',{name:'查找',exact:true}).click();
  const add=picker.getByRole('button',{name:'加入',exact:true}).first();
  await expect(add).toBeEnabled({timeout:15000});
  await add.click();
  await page.getByRole('button',{name:'保存草稿',exact:true}).click();
  await expect(page.getByRole('button',{name:'1 保存 ✓',exact:true})).toBeEnabled({timeout:15000});
  await page.getByRole('link',{name:'2 披露检查'}).click();
  await expect(page).toHaveURL(/\/admin\/topics\/[0-9a-f-]{36}\/publish#disclosure$/,{timeout:15000});
  await ready(page);
  await page.getByRole('button',{name:'运行披露检查'}).click();
  const checks=page.getByRole('region',{name:'披露检查',exact:true});
  await expect(checks.locator('tbody tr')).toHaveCount(10,{timeout:15000});
  await expect(checks).toContainText('阻断 0',{timeout:15000});
  await page.getByRole('button',{name:'生成预览'}).click();
  await expect(page.getByText('公开视图被遮蔽的值：0 个')).toBeVisible({timeout:15000});
  await expect(page.getByRole('row').filter({hasText:'ev:1'})).toContainText('4.3%',{timeout:15000});
  await page.getByRole('button',{name:'发布',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('发布 发布测试 为 v1？',{timeout:15000});
  await dialog.getByRole('button',{name:'发布 v1'}).click();
  await expect(page.getByRole('status')).toHaveText('已发布 v1',{timeout:15000});
  const row=page.getByRole('region',{name:'版本管理'}).getByRole('row').filter({hasText:'v1'});
  await expect(row).toContainText('当前',{timeout:15000});
  await row.getByRole('button',{name:'取消发布'}).click();
  await dialog.getByLabel('原因类别（读者可见）').selectOption('privacy');
  await dialog.getByRole('button',{name:'取消发布 v1'}).click();
  await expect(row).toContainText('已取消发布',{timeout:15000});
  await expect(row).toContainText('隐私',{timeout:15000});
 });
});
