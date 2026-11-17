import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {MacroTabs, macroTabHref} from './MacroTabs';
vi.mock('./use-macro-t',()=>({useMacroT:()=>({t:(k:string)=>k,locale:'en'})}));
it('renders seven ordered links with region and exactly one active page on every surface',()=>{
 for(const active of ['overview','indicators','correlation','transmission','history','review','methodology'] as const){
  const html=renderToStaticMarkup(React.createElement(MacroTabs,{active,region:'CN'}));
  const links=[...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)];
  expect(links.map(m=>m[2])).toEqual(['overview','indicators','correlation','transmission','history','review','methodology'].map(k=>`tabs.${k}`));
  expect(links.map(m=>m[1].replaceAll('&amp;','&'))).toEqual(['overview','indicators','correlation'].map(k=>`/macro?region=CN&tab=${k}`).concat(['/macro/transmission?region=CN','/macro/history?region=CN','/macro/review?region=CN','/macro?region=CN&tab=methodology']));
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  expect(links.find(m=>m[0].includes('aria-current="page"'))?.[2]).toBe(`tabs.${active}`);
 }
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
