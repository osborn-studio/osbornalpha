/** Browser UI acceptance with synthetic HTTP fixtures, NOT server authorization
 * acceptance. Requires a separately started env-isolated local Next server. */
import {chromium,expect} from '@playwright/test';
const origin='http://127.0.0.1:3198';
const id='99999999-9999-4999-8999-999999999999';
const candidate={id,revision:0,status:'imported',created_at:'2026-10-04T00:00:00.000Z'};
const card={id:'card',occurrence_count:1,payload:{title:'Synthetic card',synthetic:true,recall_reason:'exploration',facts:[{text:'Synthetic fact',span:{start:0,end:14},source_ref:{raw_sha256:'synthetic'}}],inferences:[],counterevidence:[],related_companies:[],related_securities:[],next_ten_minutes:'Synthetic next step'}};
async function main(){
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const decisions:unknown[]=[];
 let optionsFailed=true;
 let nextFailed=true,nextRequests=0;
 let listFailed=true,denied=false,holdCitation=false,release:(()=>void)|undefined,citationStarted=false,holdDecision=false,decisionStarted=false,releaseDecision:(()=>void)|undefined;
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const respond=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(url.pathname.endsWith('/candidates')){
   if(url.searchParams.has('id')){nextRequests++;if(nextFailed)return respond({error:{code:'revocation_check_unavailable'}},503);expect(url.searchParams.get('createdAt')).toBe('2026-10-04T00:00:00.000001Z');return respond({candidates:[],nextCursor:null});}
   return listFailed?respond({error:{code:'revocation_check_unavailable'}},503):respond({candidates:[candidate],nextCursor:{id,createdAt:'2026-10-04T00:00:00.000001Z'}});
  }
  if(url.pathname.endsWith('/options'))return optionsFailed?respond({error:{code:'internal_error'}},500):respond({securities:[],companies:[]});
  if(url.pathname.endsWith('/history'))return respond({records:[],revision:1});
  if(url.pathname.endsWith('/status'))return denied?respond({error:{code:'revocation_check_unavailable'}},503):respond({observations:[]});
  if(url.pathname.endsWith('/decisions')){decisions.push(route.request().postDataJSON());decisionStarted=true;if(holdDecision)await new Promise<void>(resolve=>{releaseDecision=resolve;});return respond({ok:true});}
  if(url.pathname.endsWith('/reveal'))return respond({cards:[card],revision:decisions.length?1:0,labelId:decisions.length?'new-label':'label',exposureId:decisions.length?'new-exposure':'exposure'});
  if(url.pathname.endsWith('/citation')){citationStarted=true;if(holdCitation)await new Promise<void>(resolve=>{release=resolve;});return respond({text:'Delayed protected citation',source_ref:{raw_sha256:'synthetic'},span:{start:0,end:14}});}
  return respond({});
 });
 await page.goto(origin+'/research/observations');
 await expect(page.getByText('候选列表暂不可用，不能据此判断没有资料。')).toBeVisible();
 await expect(page.getByText(/此前材料已隐藏/)).toHaveCount(0);
 await expect(page.getByText('尚无可访问候选。导入后即可开始记录。')).toHaveCount(0);
 listFailed=false;await page.getByRole('button',{name:'重试读取候选'}).click();
 await page.getByRole('button',{name:'下一页候选'}).click();
 await expect(page.getByText('候选列表暂不可用，不能据此判断没有资料。')).toBeVisible();
 await page.getByRole('button',{name:'返回第一页'}).click();
 await page.getByRole('button',{name:'下一页候选'}).click();
 await expect(page.getByText('候选列表暂不可用，不能据此判断没有资料。')).toBeVisible();
 nextFailed=false;await page.getByRole('button',{name:'重试读取候选'}).click();
 await expect(page.getByText('本页没有更多候选。')).toBeVisible();expect(nextRequests).toBe(3);
 await expect(page.getByText('尚无可访问候选。导入后即可开始记录。')).toHaveCount(0);
 await page.getByRole('button',{name:'返回第一页'}).click();
 await expect(page.getByText('决定选项暂不可用，暂不能提交决定。')).toBeVisible();
 optionsFailed=false;await page.getByRole('button',{name:'重试读取决定选项'}).click();
 await expect(page.getByText('决定选项暂不可用，暂不能提交决定。')).toHaveCount(0);
 await page.getByLabel('选择候选',{exact:true}).selectOption(id);
 await page.getByLabel('已有判断',{exact:true}).fill('Synthetic unsent judgment');
 await page.getByRole('button',{name:'保存已有判断并查看变化卡'}).click();
 await expect(page.getByRole('region',{name:'本周变化卡'})).toBeVisible();
 await page.getByLabel('理由与待核实问题',{exact:true}).fill('Synthetic decision draft');
 holdCitation=true;await page.getByRole('button',{name:'查看引用 1',exact:true}).click();
 await expect.poll(()=>citationStarted).toBe(true);
 denied=true;
 await expect(page.getByRole('region',{name:'本周变化卡'})).toHaveCount(0,{timeout:15000});
 await expect(page.getByLabel('已有判断',{exact:true})).toHaveValue('Synthetic unsent judgment');
 await expect(page.getByLabel('理由与待核实问题',{exact:true})).toHaveValue('Synthetic decision draft');
 await expect(page.getByRole('button',{name:'保存决定与观察'})).toBeDisabled();
 const citationResponse=page.waitForResponse(r=>r.url().includes('/citation'));release!();await citationResponse;await page.evaluate(()=>new Promise(requestAnimationFrame));
 await expect(page.getByRole('region',{name:'引用原文'})).toHaveCount(0);
 await expect(page.getByText('Delayed protected citation')).toHaveCount(0);
 // A write completing after a failed access check must not silently disappear.
 denied=false;await page.getByRole('button',{name:'重新核实权限'}).click();
 await page.getByRole('button',{name:'保存已有判断并查看变化卡'}).click();
 await expect(page.getByRole('region',{name:'本周变化卡'})).toBeVisible();
 await expect(page.getByLabel('理由与待核实问题',{exact:true})).toHaveValue('Synthetic decision draft');
 holdDecision=true;await page.getByRole('button',{name:'保存决定与观察'}).click();
 await expect.poll(()=>decisionStarted).toBe(true);denied=true;
 await expect(page.getByRole('region',{name:'本周变化卡'})).toHaveCount(0,{timeout:15000});
 releaseDecision!();await expect(page.getByText(/提交结果尚未确认/)).toBeVisible();
 await expect(page.getByLabel('理由与待核实问题',{exact:true})).toHaveValue('Synthetic decision draft');
 denied=false;holdDecision=false;
 await page.getByRole('button',{name:'重新核实权限'}).click();
 await page.getByRole('button',{name:'保存已有判断并查看变化卡'}).click();
 await expect(page.getByRole('region',{name:'本周变化卡'})).toBeVisible();
 listFailed=true;await page.getByRole('button',{name:'保存决定与观察'}).click();
 await expect(page.getByText(/决定已保存，但资料刷新失败/)).toBeVisible();
 expect(decisions).toHaveLength(2);expect(decisions[1]).toEqual(decisions[0]);
 await expect(page.getByRole('region',{name:'本周变化卡'})).toBeVisible();
 await page.setViewportSize({width:320,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
 console.log('UI synthetic acceptance passed: unavailable != empty, manual retry, denied status hides cards, delayed citation discarded, draft preserved, 320px no overflow. HTTP fixtures mocked; no database/auth acceptance claim.');
 }finally{await browser.close();}
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
