// src/app/(app)/admin/broker-research/pages.test.ts
// Every admin page is a force-dynamic server component that runs adminGate() itself.
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';
import {describe,expect,it} from 'vitest';

const ROOT=join(process.cwd(),'src/app/(app)/admin/broker-research');
const pages=(d:string):string[]=>readdirSync(d).flatMap(f=>{const p=join(d,f);return statSync(p).isDirectory()?pages(p):f==='page.tsx'?[p]:[];});

describe('broker-research admin pages',()=>{
 for(const p of pages(ROOT))it(relative(ROOT,p),()=>{
  const src=readFileSync(p,'utf8');
  expect(src.includes("'use client'")).toBe(false);
  expect(src).toMatch(/export const dynamic\s*=\s*'force-dynamic'/);
  expect(src).toMatch(/if\(!await adminGate\([`']\/admin\/broker-research/);
 });
});

it('keeps server loaders outside every admin client dependency graph',async()=>{
 const ts=await import('typescript');
 const root=process.cwd();
 const seen=new Set<string>();
 function visit(file:string){
  if(seen.has(file))return;seen.add(file);
  expect(file).not.toMatch(/broker-research\/(admin-read|db|public-read|pg-db)\.ts$/);
  const src=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  for(const node of src.statements){
   if(!ts.isImportDeclaration(node)||!ts.isStringLiteral(node.moduleSpecifier))continue;
   const name=node.moduleSpecifier.text;
   if(!name.startsWith('.')&&!name.startsWith('@/'))continue;
   const found=ts.resolveModuleName(name,file,{moduleResolution:ts.ModuleResolutionKind.Bundler,baseUrl:root,paths:{'@/*':['src/*']}},ts.sys).resolvedModule;
   if(found)visit(found.resolvedFileName);
  }
 }
 function scan(dir:string){for(const f of readdirSync(dir)){const p=join(dir,f);if(statSync(p).isDirectory())scan(p);else if(p.endsWith('.tsx')&&readFileSync(p,'utf8').includes("'use client'"))visit(p);}}
 scan(ROOT);
});

// Render against the shared production messages.
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {vi} from 'vitest';
import {NextIntlClientProvider} from 'next-intl';
import {OverviewView} from './OverviewView';
import {UploadClient} from './upload/UploadClient';
import {LicencesClient} from './licences/LicencesClient';
import {AccessLogClient} from './access-log/AccessLogClient';
import type {OverviewData} from './_shared/admin-fetch';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()}),redirect:(url:string)=>{throw new Error(url);}}));
const additions=['zh','en'].map(locale=>JSON.parse(readFileSync(join(process.cwd(),`messages/${locale}/foreign-research.json`),'utf8')));
const empty:OverviewData={settings:{public_enabled:false,approved_gold_corpus_hash:null,approved_gold_corpus_by:null,approved_gold_corpus_at:null,updated_by:null,updated_at:''},counts:{toParse:0,toExtract:0,toReview:0,toPublish:0,published:0,withdrawn:0},gates:{d1:{ok:false,confirmed:0,total:0},gold:{ok:false}},gold:null,batches:[],quarantine:{total:0,rows:[]},attention:{mappingUpdates:0,outboxFailed:0,licencesPending:0},reviewQueue:[],recentDocuments:[]};
function keys(v:Record<string,unknown>,prefix=''):string[]{return Object.entries(v).flatMap(([k,x])=>typeof x==='object'&&x!==null?keys(x as Record<string,unknown>,`${prefix}${k}.`):[`${prefix}${k}`]).sort();}
it('hands off matching zh/en keys and placeholders',()=>{
 expect(additions).toHaveLength(2);expect(keys(additions[0])).toEqual(keys(additions[1]));
 function placeholders(v:unknown):unknown{return typeof v==='string'?[...v.replace(/'[^']*'/g,'').matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort():Object.fromEntries(Object.entries(v as object).map(([k,x])=>[k,placeholders(x)]));}
 expect(placeholders(additions[0])).toEqual(placeholders(additions[1]));
});
for(const [i,locale] of ['zh','en'].entries())it(`renders the four empty admin pages in ${locale} with enabling disabled`,()=>{
 const errors:unknown[]=[];
 const render=(children:import('react').ReactNode)=>renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{'foreign-research':additions[i]},onError:e=>errors.push(e),children}));
 const html=render(createElement(OverviewView,{data:empty}));
 expect(html).toMatch(/<button[^>]*disabled=""/);expect(html).toContain(additions[i].admin.overview.switch.enable);
 expect(html).toContain(additions[i].admin.overview.gates.storageDetail);
 expect(render(createElement(UploadClient,{licences:[]}))).toContain(additions[i].admin.upload.title);
 expect(render(createElement(LicencesClient,{views:[],today:'2026-11-06'}))).toContain(additions[i].admin.licences.empty);
 expect(render(createElement(AccessLogClient,{rows:[],documentId:null}))).toContain(additions[i].admin.accessLog.empty);
 expect(errors).toEqual([]);
});
