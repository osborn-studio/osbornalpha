import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {expect,type Browser,type BrowserContext,type Route} from '@playwright/test';
/** Test-only React root preserves the actual component instance across id props.
 * Mutations are confined to an in-memory bundle, never production source. */
export async function checkJournalInstance(browser:Browser,source:BrowserContext,origin:string,id:string){
 const panel=resolve('src/components/research/s4/EvaluationPanel.tsx'),original=readFileSync(panel,'utf8');
 const guard='active=()=>generation.current===epoch&&journalLoad.current===load';
 expect(original.includes(guard)).toBe(true);
 for(const mutant of [false,true]){
  const bundle=(await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {EvaluationPanel} from './EvaluationPanel';const node=document.createElement('div');node.id='instance-harness';document.body.appendChild(node);const root=createRoot(node);export function render(id){root.render(React.createElement(EvaluationPanel,{id}));}`,resolveDir:dirname(panel),loader:'tsx'},bundle:true,write:false,format:'iife',globalName:'instanceHarness',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'isolated-mutation',setup(b){b.onLoad({filter:/EvaluationPanel\.tsx$/},()=>({contents:mutant?original.replace(guard,'active=()=>true'):original,loader:'tsx',resolveDir:dirname(panel)}));}}]})).outputFiles[0].text;
  for(const oldDenied of [true,false]){
   const context=await browser.newContext();await context.addCookies(await source.cookies());
   let release!:()=>void;
   try{
    const page=await context.newPage(),missing=randomUUID(),oldId=oldDenied?missing:id,newId=oldDenied?id:missing;
    const ctxReply=await context.request.post(origin+'/api/research/s6/observations/'+id,{headers:{Origin:origin},data:{action:'journal-context'}});expect(ctxReply.status()).toBe(200);const scope=(await ctxReply.json()).journalScope;
    await page.goto(origin+'/journal-instance-only');
    await page.evaluate(scope=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('alpha-evaluation-intents-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('pending');r.onsuccess=()=>{const db=r.result,tx=db.transaction('pending','readwrite');tx.objectStore('pending').put({action:'evaluate',asOf:'2026-10-05T00:00:00Z',key:'instance-only-unsent',revision:0,marketIds:[]},scope);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(Error('seed_failed'));};};}),scope);
    let held=false,delivered=false;const gate=new Promise<void>(r=>{release=r;});
    const handler=async(route:Route)=>{if(route.request().postDataJSON()?.action!=='journal-context')return route.continue();const response=await route.fetch();const isOld=route.request().url().endsWith('/'+oldId);expect(response.status()).toBe(route.request().url().endsWith('/'+missing)?404:200);if(isOld){held=true;await gate;}await route.fulfill({response});if(isOld)delivered=true;};
    await page.route(origin+'/api/research/s6/observations/*',handler);await page.addScriptTag({content:bundle});
    await page.evaluate(id=>(window as unknown as {instanceHarness:{render:(id:string)=>void}}).instanceHarness.render(id),oldId);
    await expect.poll(()=>held).toBe(true);
    const region=page.locator('#instance-harness section');await expect(region).toHaveCount(1);
    await page.evaluate(()=>{(window as unknown as {savedRegion:Element|null}).savedRegion=document.querySelector('#instance-harness section');});
    await page.evaluate(id=>(window as unknown as {instanceHarness:{render:(id:string)=>void}}).instanceHarness.render(id),newId);
    if(oldDenied){await region.getByRole('button',{name:'查看计算报告'}).click();await expect(region.getByRole('heading',{name:'等待起点',exact:true}).first()).toBeVisible();}
    else await expect(region.getByText('未完成：not_found',{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>(window as unknown as {savedRegion:Element|null}).savedRegion===document.querySelector('#instance-harness section'))).toBe(true);
    release();await expect.poll(()=>delivered).toBe(true);
    if(mutant){
     // A killed mutant requires a positive wrong-state witness, not a timeout.
     if(oldDenied)await expect(region.getByText('未完成：not_found',{exact:true})).toBeVisible();
     else await expect(region.getByRole('button',{name:'重试同一计算',exact:true})).toBeEnabled();
    }else{
     const until=Date.now()+6000;
     while(Date.now()<until){if(oldDenied)expect(await region.getByRole('heading',{name:'等待起点',exact:true}).count()).toBeGreaterThan(0);else expect(await region.getByRole('button',{name:'重试同一计算',exact:true}).count()).toBe(0);await new Promise(r=>setTimeout(r,100));}
    }
   }finally{release?.();await context.close();}
  }
 }
 expect(readFileSync(panel,'utf8')).toBe(original);
}
