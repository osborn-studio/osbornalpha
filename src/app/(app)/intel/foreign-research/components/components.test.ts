// Public component privacy and synthetic report rendering (spec §9.3).
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import React,{createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {require as tsxRequire} from 'tsx/cjs/api';
import {describe,expect,it} from 'vitest';
import type {PublicReportDetailDto} from '@/lib/broker-research/public-dto';
const {ReportView}=tsxRequire('./ReportView.tsx',import.meta.url) as typeof import('./ReportView');
const {ReportsTable}=tsxRequire('./ReportsTable.tsx',import.meta.url) as typeof import('./ReportsTable');
const {NotFoundCallout}=tsxRequire('./NotFoundCallout.tsx',import.meta.url) as typeof import('./NotFoundCallout');
const {NextIntlClientProvider}=tsxRequire('next-intl',import.meta.url) as typeof import('next-intl');
(globalThis as typeof globalThis & {React:typeof React}).React=React;
const zh=JSON.parse(readFileSync(resolve(process.cwd(),'messages/zh/foreign-research.json'),'utf8'));
const renderEl=(el:React.ReactElement)=>renderToStaticMarkup(createElement(NextIntlClientProvider,{locale:'zh',timeZone:'UTC',messages:{'foreign-research':zh},children:el}));
const render=(r:PublicReportDetailDto)=>renderEl(createElement(ReportView,{data:{report:r,history:[],spread:[],focusTargetKey:'600000.SH'}}));
const base:PublicReportDetailDto={reportId:'11111111-1111-4111-8111-111111111111',revision:1,scope:'single_issuer',institution:{id:'22222222-2222-4222-8222-222222222222',nameEn:'Synthetic Securities',nameZh:null},primaryTargetKey:'600000.SH',targets:[{currency:'CNY',targetKey:'600000.SH',tickerAsStated:'600000.SH',securityTicker:'600000.SH',issuerId:'iss',publicationId:'pub',rating:{raw:'Buy',normalized:'buy',scaleId:null},target:{price:'10',currency:'CNY',horizonMonths:12},priceAtReport:{value:'8',currency:'CNY',asOf:'2026-01-01'},upsidePct:'0.25',upsideFormulaVersion:'upside/1'}],title:{text:'Synthetic title',isRewritten:false,zh:null,en:null,isTranslation:false,modelId:null},publishedDate:'2026-01-01',reportType:null,sectorAsStated:null,availableAt:'2026-01-02',codeVersion:'v',hasSummary:{zh:true,en:false},snippetCount:0,targetPricePublic:true,rulesVersion:'broker-rules/1',citations:[],snippets:[],summaries:{zh:{summaryId:'s',lang:'zh',label:'independent_summary',modelId:'m',promptVersion:'p',generatedAt:'2026-01-01',markdown:'Summary <script>',groundingAssertions:[]},en:null},analysts:[],licence:{snippetMaxChars:80,targetPricePublic:true,summaryPublic:true},settlement:null};
describe('report view',()=>{
 it('shows labelled third-party judgments and escapes summary text',()=>{const h=render(base);expect(h).toContain('第三方判断（未结算）');expect(h).toContain('报告所载');expect(h).toContain('&lt;script&gt;');expect(h).not.toContain('<script>');});
 it('hides unlicensed target prices in the display layer',()=>{const h=render({...base,targetPricePublic:false});expect(h).not.toContain('10 CNY');expect(h).not.toContain('+25.0%');expect(h).toContain('许可不允许公开');});
 it('uses the absent state when the report gives no target',()=>{const h=render({...base,targets:[{...base.targets[0],target:null,upsidePct:null}]});expect(h).toContain('报告未给出目标价');});
 it('shows preview status and omits history',()=>{const h=renderEl(createElement(ReportView,{data:{report:base,history:[],spread:[],focusTargetKey:'600000.SH'},preview:{status:'draft',reviewStatus:'in_review'}}));expect(h).toContain('draft · 复核 in_review');expect(h).toContain('预览不含历史与跨机构分歧');});
 it('renders neutral rating chips and uniform 404 wording',()=>{const h=renderEl(createElement(ReportsTable,{reports:[base]}));expect(h).not.toContain('增持');expect(h).toContain('买入');expect(h).toContain('CNY 10');expect(h).not.toMatch(/text-(up|down|bullish|bearish)/);const n=renderEl(createElement(NotFoundCallout,{kind:'report'}));expect(n).toContain('找不到这份报告');expect(n).toContain('报告不存在，或已不再公开。');});
});
