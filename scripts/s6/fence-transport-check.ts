import {buildSync} from 'esbuild';
import {expect,type Page,type Route} from '@playwright/test';
/** Production exports + real authenticated route/PG. The first committed reply
 * is intentionally lost; no response body is mocked or parser exposed. */
export async function checkFenceTransport(page:Page,origin:string,id:string,scope:string,kind:'json'|'date'='json'){
 const bundle=buildSync({entryPoints:['src/components/research/s4/evaluation-journal.ts'],bundle:true,write:false,format:'iife',globalName:'journalTransport',platform:'browser'}).outputFiles[0].text;
 await page.addScriptTag({content:bundle});
 await page.evaluate(({scope,kind})=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('pending','readwrite');tx.objectStore('pending').put(kind==='date'?{data:new Date('2026-01-01')}:{synthetic:'never-post-this-damage'},scope);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(Error('fixture_seed'));};};}),{scope,kind});
 const handle=await page.evaluate(scope=>(window as unknown as {journalTransport:typeof import('../../src/components/research/s4/evaluation-journal')}).journalTransport.claimEvaluationRecovery(scope,'http-recovery'),scope);expect(handle).not.toBeNull();
 const bodies:unknown[]=[];let lose=true;
 const interceptor=async(route:Route)=>{
  const body=route.request().postDataJSON();if(body?.action!=='fence-intents')return route.continue();
  bodies.push(body);expect(body).toEqual({action:'fence-intents',key:handle!.key});
  if(!lose)return route.continue();lose=false;
  const response=await route.fetch();expect(response.status()).toBe(200);expect(await response.json()).toMatchObject({status:'fenced',key:handle!.key,observationId:id,journalScope:scope});
  await route.abort('failed');
 };
 await page.route(origin+'/api/research/s6/observations/'+id,interceptor);
 try{
  expect(await page.evaluate(async({scope,id,handle})=>{const api=(window as unknown as {journalTransport:typeof import('../../src/components/research/s4/evaluation-journal')}).journalTransport;try{await api.requestEvaluationFence(id,scope,handle);return false;}catch{return true;}},{scope,id,handle:handle!})).toBe(true);
  await page.reload();await page.addScriptTag({content:bundle});
  expect(await page.evaluate(scope=>(window as unknown as {journalTransport:typeof import('../../src/components/research/s4/evaluation-journal')}).journalTransport.claimEvaluationRecovery(scope,'must-not-replace'),scope)).toEqual(handle);
  expect(await page.evaluate(async({scope,id,handle})=>{const api=(window as unknown as {journalTransport:typeof import('../../src/components/research/s4/evaluation-journal')}).journalTransport;const ack=await api.requestEvaluationFence(id,scope,handle);return api.acknowledgeEvaluationRecovery(scope,handle,ack);},{scope,id,handle:handle!})).toEqual({status:'cleared'});
  expect(await page.evaluate(scope=>(window as unknown as {journalTransport:typeof import('../../src/components/research/s4/evaluation-journal')}).journalTransport.pendingEvaluation(scope),scope)).toBeNull();
  expect(bodies).toEqual([{action:'fence-intents',key:handle!.key},{action:'fence-intents',key:handle!.key}]);
  const retained=await page.evaluate(scope=>new Promise<{count:number;date:boolean}>((resolve,reject)=>{const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('pending','readonly'),prefix='quarantine:'+scope+':',rows=tx.objectStore('pending').getAll(IDBKeyRange.bound(prefix,prefix+'\uffff'));tx.oncomplete=()=>{db.close();resolve({count:rows.result.length,date:rows.result[0]?.value?.data instanceof Date&&rows.result[0].value.data.toISOString()==='2026-01-01T00:00:00.000Z'});};tx.onabort=()=>{db.close();reject(Error('quarantine_read'));};};}),scope);
  expect(retained).toEqual(kind==='date'?{count:1,date:true}:{count:0,date:false});
  return handle!.key;

 }finally{await page.unroute(origin+'/api/research/s6/observations/'+id,interceptor);}
}
