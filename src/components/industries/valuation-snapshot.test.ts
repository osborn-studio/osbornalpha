import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import en from '../../../messages/en/industries.json';
import zh from '../../../messages/zh/industries.json';
import type {NodeView,PublicValuation,ValuationBlock} from '@/lib/industry/read';

const h=vi.hoisted(()=>({locale:'en' as 'en'|'zh'}));
vi.mock('next-intl',()=>({useLocale:()=>h.locale,useTranslations:(namespace:string)=>(key:string,values?:Record<string,string>)=>{
 const messages=h.locale==='en'?en:zh;
 const template=[...namespace.split('.').slice(1),...key.split('.')].reduce<unknown>((v,k)=>(v as Record<string,unknown>)[k],messages) as string;
 return template.replace(/\{(\w+)\}/g,(_,k:string)=>values?.[k]??'');
}}));
import {ValuationSnapshot} from './ValuationSnapshot';

const node:NodeView={code:'801010',level:1,nameEn:'Agriculture',nameZh:'农林牧渔',parentCode:null};
const cell=(metric:PublicValuation['metric'],tradeDate:string,value:string,extra:Partial<PublicValuation>={}):PublicValuation=>({code:node.code,metric,tradeDate,value,factsAsOf:tradeDate,nMembers:10,nWithData:9,nUnresolved:0,mcapCoverage:'0.9',manifestHash:'fixture-only',updatedAt:null,...extra});
const published=(cells:PublicValuation[]):ValuationBlock=>({state:'published',runId:'fixture-run',methodVersion:'fixture-only',reconciliation:{},cells});
const render=(block:ValuationBlock,nodes=[node])=>renderToStaticMarkup(createElement(ValuationSnapshot,{scheme:'sw2021',nodes,block,preview:true,title:'titleDetail'}));
const sourceValues=(html:string)=>[...html.matchAll(/<button\b[^>]*data-source-button=""[^>]*>(.*?)<\/button>/g)].map(m=>m[1]);

describe.each(['en','zh'] as const)('valuation snapshot (%s)',locale=>{
 it('selects the latest date regardless of input order and excludes unrelated metrics',()=>{
  h.locale=locale;
  const cells=[cell('pe_ttm','2026-11-01','11'),cell('pb','2026-11-07','2'),cell('pe_ttm','2026-11-07','22'),cell('pb','2026-11-01','1'),cell('market_cap','2026-11-08','999')];
  for(const ordered of [cells,[...cells].reverse()]){
   const html=render(published(ordered));
   expect(sourceValues(html)).toEqual(['22.00','2.00']);
   expect(html).toContain('2026-11-07');
   expect(html).not.toContain('2026-11-01');
   expect(html).not.toContain('2026-11-08');
  }
 });
 it.each(['pe_ttm','pb'] as const)('does not backfill an older %s into an incomplete latest snapshot',olderMetric=>{
  h.locale=locale;
  const latestMetric=olderMetric==='pb'?'pe_ttm':'pb';
  const html=render(published([cell(olderMetric,'2026-11-01','77'),cell(latestMetric,'2026-11-07','3')]));
  expect(sourceValues(html)).toEqual(['3.00']);
  expect(html).not.toContain('2026-11-01');
  expect(html).toContain((locale==='en'?en:zh).valuation.unpublished);
  expect(html).toContain('2026-11-07');
 });
 it('shows each metric coverage independently, including unknown coverage',()=>{
  h.locale=locale;
  const html=render(published([cell('pe_ttm','2026-11-07','22',{mcapCoverage:'0.81'}),cell('pb','2026-11-07','2',{mcapCoverage:'0.94'})]));
  expect(html).toContain('81.0%');
  expect(html).toContain('94.0%');
  const unknown=render(published([cell('pe_ttm','2026-11-07','22',{mcapCoverage:null}),cell('pb','2026-11-07','2',{mcapCoverage:'0'})]));
  expect(unknown).toContain('0.0%');
  expect(unknown).toContain('—');
 });
 it('withholds a cell whose facts date differs from its trade date without falling back',()=>{
  h.locale=locale;
  const html=render(published([cell('pe_ttm','2026-11-01','11'),cell('pe_ttm','2026-11-07','22',{factsAsOf:'2026-11-06'}),cell('pb','2026-11-07','2')]));
  expect(sourceValues(html)).toEqual(['2.00']);
  expect(html).toContain('2026-11-06 ≠ 2026-11-07');
  expect(html).not.toContain('2026-11-01');
 });
 it('keeps latest dates local to each industry and omits industries without PE/PB',()=>{
  h.locale=locale;
  const other={...node,code:'801020',nameEn:'Mining',nameZh:'采掘'};
  const html=render(published([cell('pe_ttm','2026-11-07','22'),cell('pb','2026-11-01','4',{code:other.code})]),[node,other]);
  expect(sourceValues(html)).toEqual(['22.00','4.00']);
  expect(render(published([cell('market_cap','2026-11-08','999')]))).not.toContain('<tbody><tr');
 });
 it.each([{state:'not_enabled'} as const,{state:'unpublished',runId:'fixture',reconciliation:{}} as const])('keeps $state free of valuation numbers',block=>{
  h.locale=locale;
  const html=render(block);
  expect(html).not.toContain('<table');
  expect(sourceValues(html)).toEqual([]);
 });
});
