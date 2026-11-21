import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {MacroTabs, macroTabHref} from './MacroTabs';
import {StrategyFlagProvider} from './strategy-flag';
vi.mock('./use-macro-t',()=>({useMacroT:()=>({t:(k:string)=>k,locale:'en'})}));
it('renders seven ordered links with region and exactly one active page on every surface',()=>{
 for(const active of ['overview','indicators','correlation','transmission','history','review','methodology'] as const){
  const html=renderToStaticMarkup(React.createElement(StrategyFlagProvider,{enabled:true,children:React.createElement(MacroTabs,{active,region:'CN'})}));
  if(active==='overview')expect(html).toBe('<nav aria-label="tabs.label" class="flex flex-nowrap gap-1 overflow-x-auto whitespace-nowrap border-b border-border"><a aria-current="page" class="px-3 py-2 text-sm border-b-2 border-accent font-semibold text-text" href="/macro?region=CN&amp;tab=overview">tabs.overview</a><a class="px-3 py-2 text-sm text-text-dim" href="/macro?region=CN&amp;tab=indicators">tabs.indicators</a><a class="px-3 py-2 text-sm text-text-dim" href="/macro?region=CN&amp;tab=correlation">tabs.correlation</a><a class="px-3 py-2 text-sm text-text-dim" href="/macro/transmission?region=CN">tabs.transmission</a><a class="px-3 py-2 text-sm text-text-dim" href="/macro/history?region=CN">tabs.history</a><a class="px-3 py-2 text-sm text-text-dim" href="/macro/review?region=CN">tabs.review</a><a class="px-3 py-2 text-sm text-text-dim" href="/macro?region=CN&amp;tab=methodology">tabs.methodology</a></nav>');
  const links=[...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)];
  expect(links.map(m=>m[2])).toEqual(['overview','indicators','correlation','transmission','history','review','methodology'].map(k=>`tabs.${k}`));
  expect(links.map(m=>m[1].replaceAll('&amp;','&'))).toEqual(['overview','indicators','correlation'].map(k=>`/macro?region=CN&tab=${k}`).concat(['/macro/transmission?region=CN','/macro/history?region=CN','/macro/review?region=CN','/macro?region=CN&tab=methodology']));
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  expect(links.find(m=>m[0].includes('aria-current="page"'))?.[2]).toBe(`tabs.${active}`);
 }
});

it.each(['disabled','missing'])('renders only the four view links when the provider is %s',mode=>{
 const tabs=React.createElement(MacroTabs,{active:'indicators',region:'CN'});
 const html=renderToStaticMarkup(mode==='disabled'?React.createElement(StrategyFlagProvider,{enabled:false,children:tabs}):tabs);
 const hrefs=[...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&'));
 expect(hrefs).toEqual(['overview','indicators','correlation','methodology'].map(tab=>`/macro?region=CN&tab=${tab}`));
 expect(html).not.toMatch(/href="[^"]*\/macro\/(transmission|history|review)/);
 expect(html.match(/aria-current="page"/g)).toHaveLength(1);
});

it('builds canonical region-first URLs through repeated boundary switches',()=>{
 for(const region of ['US','CN'] as const){
  expect(macroTabHref('review',region)).toBe(`/macro/review?region=${region}`);
  for(const boundary of ['event_day','month_end','first_trading_day','event_day'] as const){
   const href=macroTabHref('history',region,boundary);
   expect(href).toBe(`/macro/history?region=${region}&boundary=${boundary}`);
   const query=new URL(href,'http://fixture.test').searchParams;
   expect(query.getAll('region')).toEqual([region]);
   expect(query.getAll('boundary')).toEqual([boundary]);
  }
 }
});
