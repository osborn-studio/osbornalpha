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
  const row=page.getByRole('region',{name:'版本管理'}).getByRole('row').filter({has:page.getByRole('cell',{name:'v1',exact:true})});
  await expect(row).toContainText('当前',{timeout:15000});
  await row.getByRole('button',{name:'核验',exact:true}).click();
  await expect(row.getByText(/^一致 · /)).toBeVisible({timeout:15000});
  await row.getByRole('button',{name:'详情',exact:true}).click();
  const details=page.getByRole('table',{name:'详情 · v1',exact:true});
  await expect(details.getByRole('columnheader',{name:'核对时间'})).toBeVisible();
  await row.getByRole('button',{name:'取消发布'}).click();
  await dialog.getByLabel('原因类别（读者可见）').selectOption('privacy');
  await dialog.getByRole('button',{name:'取消发布 v1'}).click();
  await expect(row).toContainText('已取消发布',{timeout:15000});
  await expect(row).toContainText('隐私',{timeout:15000});
 });
 test('approved summary is attached in the publish confirmation',async({page})=>{
  // The other seed starts empty. Give it one public fact without touching the rates editor test's draft.
  await page.goto('/admin/topics');
  await page.getByRole('row').filter({hasText:'cn-company'}).getByRole('link',{name:'编辑',exact:true}).click();
  await expect(page).toHaveURL(editorUrl,{timeout:15000});
  await ready(page);
  const outline=page.getByRole('region',{name:'分节与证据'});
  if(await outline.getByText('ev:1',{exact:true}).count()===0){
   await page.getByRole('button',{name:'新增分节'}).click();
   const picker=page.getByRole('region',{name:'证据选择器'});
   await picker.getByLabel('序列 id').fill('US_UNRATE');
   await picker.getByLabel('数据期').fill('2026-08-31');
   await picker.getByRole('button',{name:'查找',exact:true}).click();
   await picker.getByRole('button',{name:'加入',exact:true}).click();
   await page.getByRole('button',{name:'保存草稿',exact:true}).click();
   await expect(page.getByRole('button',{name:'1 保存 ✓',exact:true})).toBeEnabled({timeout:15000});
  }
  await page.getByRole('link',{name:'2 披露检查'}).click();
  await expect(page).toHaveURL(/\/publish#disclosure$/,{timeout:15000});
  await ready(page);
  const summary=page.locator('#summary'),generate=summary.getByRole('button',{name:'生成摘要',exact:true});
  // A retry can reuse the fixture process and its previous accepted or approved summary.
  const discard=summary.getByRole('button',{name:'丢弃',exact:true});
  if(await discard.count())await discard.click();
  await expect(generate).toBeVisible({timeout:15000});
  await expect(summary.getByText(/^摘要暂不能对外/)).toBeVisible();
  await generate.click();
  await expect(summary.getByText('已接受',{exact:true})).toBeVisible({timeout:15000});
  await expect(summary.getByText('事实句 1 · 假设 1 · 反方 0',{exact:true})).toBeVisible();
  await summary.getByRole('button',{name:'批准',exact:true}).click();
  await expect(summary.getByText('已批准',{exact:true})).toBeVisible({timeout:15000});

  // Disclosure requires confirmation of the summary provider, even for the fixture.
  const url='/api/admin/topics/settings',settingsResponse=await page.request.get(url);
  await expect(settingsResponse).toBeOK();
  const {settings}=await settingsResponse.json();
  expect(settings.public_enabled).toBe(false);
  try{
   await expect(await page.request.post(url,{data:{...settings,summary_public_enabled:true,summary_provider_note:'fixture'}})).toBeOK();
   await page.getByRole('button',{name:'运行披露检查'}).click();
   await expect(page.getByRole('region',{name:'披露检查',exact:true})).toContainText('阻断 0',{timeout:15000});
   await page.getByRole('button',{name:'发布',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'发布 中国公司 为 v1？'});
   await expect(dialog.locator('dt').filter({hasText:/^摘要$/}).locator('+ dd')).toHaveText('附带',{timeout:15000});
  }finally{
   await expect(await page.request.post(url,{data:settings})).toBeOK();
  }
 });
});
test('licence register loads the selected source and its fixed attribution',async({page})=>{
 await page.goto('/admin/topics/licences');
 await expect(page.getByRole('heading',{level:1,name:'许可登记'})).toBeVisible();
 const survey=page.getByRole('row').filter({has:page.getByRole('button',{name:'Survey',exact:true})});
 await expect(survey).toBeVisible();
 await ready(page);
 await survey.getByRole('button',{name:'Survey',exact:true}).click();
 await expect(page.getByLabel('来源名称',{exact:true})).toHaveValue('Survey');
 await expect(page.getByLabel('需要署名')).toBeChecked();
 await expect(page.getByLabel('需要署名')).toBeDisabled();
});
test('reviews the two copied thesis blocks in the existing editor',async({page})=>{
 const id='00000000-0000-4000-8000-000000000abc';
 const probes:string[]=[];
 page.on('request',req=>{if(new URL(req.url()).pathname==='/api/admin/topics')probes.push(req.url());});
 await page.route(`**/api/research/theses/${id}`,route=>route.fulfill({json:{
  thesis:{id,title:'Liquidity',status:'DRAFT',invalidation_conditions:[],watch_metrics:[]},
 }}));
 await page.goto(`/research/theses/${id}`);
 const link=page.getByRole('link',{name:'以此为起点新建公开专题'});
 await expect(link).toHaveAttribute('href',`/admin/topics/new?fromThesis=${id}`);
 expect(probes).toEqual([]);
 await link.click();await ready(page);
 await expect(page.getByLabel('中文标题',{exact:true})).toHaveCount(0);
 await page.getByLabel('slug',{exact:true}).fill(`from-thesis-${Date.now()}`);
 await page.getByRole('button',{name:'创建专题',exact:true}).click();
 await expect(page).toHaveURL(editorUrl);await ready(page);
 const card=page.locator('section').filter({has:page.getByRole('heading',{name:'未带入的私有内容'})});
 await card.getByRole('button',{name:'逐段审阅'}).click();
 await expect(card.getByRole('button',{name:'已检查，无私有内容'})).toHaveCount(2);
 await card.getByRole('button',{name:'已检查，无私有内容'}).first().click();
 await card.getByRole('button',{name:'改写'}).click();
 await expect(page.locator(':focus')).toHaveValue(/Liquidity/);
 await page.locator(':focus').fill('Public context');
 await expect(card.getByText('unreviewed_private_block')).toHaveCount(0);
});
