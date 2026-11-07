// Stock-page library block rendering and response parsing (spec §9.4).
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import React,{createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {require as tsxRequire} from 'tsx/cjs/api';
import {describe,expect,it} from 'vitest';
import type {PublicReportDto} from '@/lib/broker-research/public-dto';
const {LibraryReportsView,parseByTicker}=tsxRequire('./LibraryReportsBlock.tsx',import.meta.url) as typeof import('./LibraryReportsBlock');
const {NextIntlClientProvider}=tsxRequire('next-intl',import.meta.url) as typeof import('next-intl');
(globalThis as typeof globalThis & {React:typeof React}).React=React;

const zh=JSON.parse(readFileSync(resolve(process.cwd(),'messages/zh/foreign-research.json'),'utf8'));
const r=(n:number,over:Partial<PublicReportDto>={}):PublicReportDto=>({reportId:`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`,revision:1,scope:'single_issuer',institution:{id:'i',nameEn:'Synthetic Securities',nameZh:null},primaryTargetKey:'600000.SH',
 targets:[{currency:'CNY',targetKey:'600000.SH',tickerAsStated:'600000',securityTicker:'600000.SH',issuerId:'iss',publicationId:null,rating:{raw:'Buy',normalized:'buy',scaleId:null},target:{price:'10.5',currency:'CNY',horizonMonths:null},priceAtReport:null,upsidePct:null,upsideFormulaVersion:null}],
 title:{text:`Synthetic ${n}`,isRewritten:false,zh:null,en:null,isTranslation:false,modelId:null},publishedDate:'2026-10-01',reportType:null,sectorAsStated:null,availableAt:null,codeVersion:null,hasSummary:{zh:false,en:false},snippetCount:0,targetPricePublic:true,rulesVersion:null,...over});

describe('library block',()=>{
 it('renders heading with count, rows and the filtered list link',()=>{
  const html=renderToStaticMarkup(createElement(NextIntlClientProvider,{locale:'zh',messages:{'foreign-research':zh},children:createElement(LibraryReportsView,{ticker:'600000.SH',reports:[r(1),r(2,{targetPricePublic:false})],count:2})}));
  expect(html).toContain('馆藏研报（2）');expect(html).toContain('/intel/foreign-research?ticker=600000.SH');
  expect(html).toContain('CNY 10.5');expect(html).toContain('—（许可不允许公开）');expect(html).toContain('买入');
 });
 it('parses only well-formed 200 bodies; anything else hides the block',async()=>{
  const ok=new Response(JSON.stringify({ticker:'600000.SH',issuerId:'iss',reports:[r(1)],count:1}),{status:200});
  expect((await parseByTicker(ok))?.count).toBe(1);
  expect(await parseByTicker(new Response('{}',{status:404}))).toBeNull();
  expect(await parseByTicker(new Response(JSON.stringify({reports:[]}),{status:200}))).toBeNull();
  expect(await parseByTicker(new Response('not json',{status:200}))).toBeNull();
 });
});
