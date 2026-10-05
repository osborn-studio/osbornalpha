import {createPrivateKey,createPublicKey,randomUUID,sign} from 'node:crypto';
import {applyRevocationPage} from '../../src/lib/research/revocation/consumer';
import {chromium,expect} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Pool} from 'pg';
import {localSessionToken} from '../../src/lib/research/s4/auth';
import {replayObservation} from 'dsh-trade-strategy-evaluator/engine';
const state=JSON.parse(readFileSync(process.argv[2],'utf8')),web=JSON.parse(readFileSync(join(state.directory,'web-state.json'),'utf8')),demo=JSON.parse(readFileSync(join(state.directory,'s6-demo.json'),'utf8'));
async function main(){
 const db=new Pool({connectionString:state.adminUrl}),browser=await chromium.launch({headless:true});
 try{
  const ctx=await browser.newContext({viewport:{width:1280,height:1000}});await ctx.addCookies([{name:'alpha_s4_local_session',value:localSessionToken(demo.actor.userId,web.secret,Date.now()+3600000),url:web.origin,httpOnly:true,sameSite:'Strict'}]);
  const page=await ctx.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===web.origin?r.continue():r.abort());
  await page.goto(web.origin+'/research/observations');await page.getByLabel('选择候选',{exact:true}).selectOption(demo.candidateId);
  await page.getByRole('button',{name:'查看 / 刷新历史'}).click();await page.getByRole('button',{name:'查看计算报告'}).click();
  await expect(page.getByText('尚无计算版本。没有行情时可登记等待状态。')).toBeVisible();
  await page.getByRole('button',{name:'计算当前观察'}).click();await expect(page.getByText('计算版本已保存；缺行情或未到期会如实显示。')).toBeVisible();
  await expect(page.getByRole('heading',{name:'等待起点',exact:true})).toBeVisible();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'校验并导出 Replay'}).click();
  const file=join(state.directory,'s6-replay.json');await (await download).saveAs(file);
  const replay=JSON.parse(readFileSync(file,'utf8'));expect(replayObservation(replay.input,replay.outcome).matches).toBe(true);
  await page.screenshot({path:join(state.directory,'s6-desktop.png'),fullPage:true});
  await page.setViewportSize({width:320,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:join(state.directory,'s6-mobile.png'),fullPage:true});
  await page.reload();await page.getByLabel('选择候选',{exact:true}).selectOption(demo.candidateId);await page.getByRole('button',{name:'查看 / 刷新历史'}).click();await page.getByRole('button',{name:'查看计算报告'}).click();await expect(page.getByRole('heading',{name:'等待起点',exact:true})).toBeVisible();
  const count=(await db.query('select count(*) from research_s6_evaluations where user_id=$1',[demo.actor.userId])).rows[0].count;expect(count).toBe('1');
  const unauth=await browser.newContext();expect((await unauth.request.post(web.origin+'/api/research/s6/observations/'+demo.observationId,{headers:{Origin:web.origin},data:{action:'read'}})).status()).toBe(401);
  if(demo.revocation){
   writeFileSync(join(state.directory,'stop-feed'),'stop');await new Promise(r=>setTimeout(r,6000));
   await db.query("update research_revocation_candidate.feed set published_at=clock_timestamp()-interval '61 seconds' where feed_id=$1",[demo.revocation.feedId]);
   const stale=await ctx.request.post(web.origin+'/api/research/s6/observations/'+demo.observationId,{headers:{Origin:web.origin},data:{action:'read'}});expect(stale.status()).toBe(503);expect(await stale.json()).toEqual({error:{code:'revocation_check_unavailable'}});
   await page.getByRole('button',{name:'查看计算报告'}).click();await expect(page.getByText('暂时无法核实材料权限，请稍后重新查看报告。')).toBeVisible();
   await db.query('update research_revocation_candidate.feed set published_at=clock_timestamp() where feed_id=$1',[demo.revocation.feedId]);
   await page.getByRole('button',{name:'查看计算报告'}).click();await expect(page.getByRole('heading',{name:'等待起点',exact:true})).toBeVisible();
   const r=demo.revocation,at=new Date().toISOString(),key=createPrivateKey(r.privateKey),raw=Buffer.from(JSON.stringify({protocol_version:'pa-revocation/v1',feed_id:r.feedId,owner_scope:r.scope,from_seq:'0',through_seq:'1',latest_seq:'1',published_at:at,events:[{revocation_id:randomUUID(),monotonic_seq:'1',source_id:r.sourceId,grant_id:r.grantId,grant_version:1,effective_at:at}]}));
   await applyRevocationPage(db,{feedId:r.feedId,localOwner:demo.actor.userId,scope:r.scope,key:createPublicKey(key)},raw,sign(null,raw,key).toString('hex'));
  }else await db.query('update research_s4_bindings set revoked=true where user_id=$1',[demo.actor.userId]);
  const denied=await ctx.request.post(web.origin+'/api/research/s6/observations/'+demo.observationId,{headers:{Origin:web.origin},data:{action:'read'}});expect(denied.status()).toBe(403);expect(await denied.json()).toEqual({error:{code:'revocation_access_denied'}});
  await page.getByRole('button',{name:'查看计算报告'}).click();await expect(page.getByText('材料权限已撤回或当前账号无权访问。')).toBeVisible();await expect(page.getByRole('button',{name:'校验并导出 Replay'})).toHaveCount(0);
  expect(errors).toEqual([]);
  const evidence={passed:true,synthetic:true,real_next:true,serve_mode:'development',signed_revocation:!!demo.revocation,real_postgres:true,mocked_api_responses:0,checks:['synthetic_candidate','report_exposure','pending_start_persisted','offline_replay','reload_persistence','320px_no_overflow','revocation_clears_report','unauthenticated_401','no_uncaught_page_errors']};
  writeFileSync(join(state.directory,'s6-browser-result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }finally{await db.end();await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
