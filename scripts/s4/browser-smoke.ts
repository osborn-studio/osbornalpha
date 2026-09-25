import {chromium,expect} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Pool} from 'pg';
import {localSessionToken} from '../../src/lib/research/s4/auth';
const state=JSON.parse(readFileSync(process.argv[2],'utf8')),web=JSON.parse(readFileSync(join(state.directory,'web-state.json'),'utf8'));
const actor='99999999-9999-4999-8999-999999999999';
async function main(){
 const db=new Pool({connectionString:state.adminUrl});const browser=await chromium.launch({headless:true});
 try{
 const context=await browser.newContext({viewport:{width:1280,height:1000}});await context.addCookies([{name:'alpha_s4_local_session',value:localSessionToken(actor,web.secret,Date.now()+3600000),url:web.origin,httpOnly:true,sameSite:'Strict'}]);
 const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).origin===web.origin?route.continue():route.abort());
 await page.goto(web.origin+'/research/observations');await expect(page.getByRole('heading',{name:'变化与观察'})).toBeVisible();
 const candidate=(await db.query('select id from research_s4_candidates where user_id=$1',[actor])).rows[0].id;
 await page.getByLabel('选择候选',{exact:true}).selectOption(candidate);
 await expect(page.getByRole('region',{name:'本周变化卡'})).toHaveCount(0);
 await page.getByLabel('已有判断',{exact:true}).fill('合成资料的代理界面验收，不是独立人工判断。');
 await page.getByRole('button',{name:'保存已有判断并查看变化卡'}).click();await expect(page.getByRole('region',{name:'本周变化卡'})).toBeVisible();
 await page.getByRole('button',{name:'查看引用 1',exact:true}).click();await expect(page.getByRole('region',{name:'引用原文'})).toBeVisible();
 await page.getByLabel('观察证券',{exact:true}).selectOption('S4SYNTH');await page.getByLabel('理由与待核实问题',{exact:true}).fill('真实浏览器验收：保存观察并等待行情。');
 await page.getByRole('button',{name:'保存决定与观察'}).click();await expect(page.getByRole('status')).toContainText('决定已保存');
 await expect(page.getByRole('heading',{name:'冻结观察 · 等待起点'}).first()).toBeVisible();
 await page.screenshot({path:join(state.directory,'s4-desktop.png'),fullPage:true});
 await page.setViewportSize({width:320,height:900});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:join(state.directory,'s4-mobile.png'),fullPage:true});
 await page.reload();await page.getByLabel('选择候选',{exact:true}).selectOption(candidate);await expect(page.getByRole('region',{name:'本周变化卡'})).toHaveCount(0);
 await page.getByRole('button',{name:'查看 / 刷新历史'}).click();await expect(page.getByRole('heading',{name:'冻结观察 · 等待起点'}).first()).toBeVisible();
 const unauth=await browser.newContext();expect((await unauth.request.get(web.origin+'/api/research/s4/candidates')).status()).toBe(401);
 expect((await context.request.post(web.origin+'/api/research/s4/candidates',{headers:{Origin:'https://evil.example'},data:'{}'})).status()).toBe(403);
 expect(errors).toEqual([]);
 const evidence={status:'passed',real_server:true,real_database:true,mocked_routes:0,actor_kind:'agent',synthetic:true,checks:['prelabel_before_card','citation','decision_persistence','pending_observation','reload_history','320px_no_overflow','unauth_401','cross_origin_403','no_page_errors']};
 writeFileSync(join(state.directory,'browser-result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({...evidence,artifacts:state.directory}));
 }finally{await browser.close();await db.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
