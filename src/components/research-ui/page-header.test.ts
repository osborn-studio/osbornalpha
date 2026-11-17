import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it} from 'vitest';
import zh from '../../../messages/zh/research.json';
import en from '../../../messages/en/research.json';
import {PageHeader} from './PageHeader';
import {FreshnessChip} from './FreshnessChip';
it.each(['zh','en'] as const)('orders header content and translates freshness in %s',locale=>{
 const catalog=locale==='zh'?zh:en;
 const render=(children:React.ReactNode)=>renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{research:catalog},children}));
 const html=render(createElement(PageHeader,{title:'Title',altTitle:'Alternate',scope:'Scope sentence',scopeSwitch:createElement('button',null,'Scope'),freshness:{status:'fresh',asOf:'2026-11-14'}}));
 expect(html).toContain('data-research-page-header');
 const indices=['<h1','Scope sentence','data-scope-switch','data-freshness','role="group"'].map(s=>html.indexOf(s));
 for(let i=0;i<indices.length;i++){expect(indices[i]).toBeGreaterThan(-1);if(i)expect(indices[i]).toBeGreaterThan(indices[i-1]);}
 expect(html.indexOf('Title')).toBeLessThan(html.indexOf('Alternate'));
 const minimal=render(createElement(PageHeader,{title:'Title',scope:'Scope',legend:false,freshness:null}));
 expect(minimal).not.toContain('role="group"');expect(minimal).not.toContain('data-freshness');
 const chip=render(createElement(FreshnessChip,{status:'fresh',asOf:'2026-11-14'}));
 expect(chip.replace(/<[^>]*>/g,'')).toBe(locale==='zh'?'事实截至 2026-11-14 · 正常':'Facts as of 2026-11-14 · Current');
 for(const status of ['fresh','stale','error','missing'] as const){
  const markup=render(createElement(FreshnessChip,{status}));
  expect(markup.replace(/<[^>]*>/g,'')).toBe(catalog.freshness.status[status]);expect(markup).toContain('aria-hidden="true"');
 }
});
