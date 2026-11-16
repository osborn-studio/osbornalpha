import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(join(process.cwd(),path),'utf8');

describe('macro navigation',()=>{
 it('uses macro as the first tab and segment-aware active check',()=>{
  const source=read('src/components/TabBar.tsx');
  expect(source).toMatch(/const TABS: TabDef\[\] = \[\s*\{\s*id: 'macro', navKey: 'macro', href: '\/macro'/);
  expect(source).not.toContain('/today');
  expect(source).toContain('const active = isTabActive(pathname, t.href);');
  expect(source).not.toContain('pathname.startsWith(t.href)');
 });
 it.each(['zh','en'])('%s common messages name macro and omit today',locale=>{
  const {nav}=JSON.parse(read(`messages/${locale}/common.json`));
  expect(nav.macro).toBe(locale==='zh'?'宏观':'Macro');
  expect(nav).not.toHaveProperty('today');
  expect(Object.keys(nav)[0]).toBe('macro');
 });
});

// Render the real navigation with both supported message catalogs; no app server or data APIs.
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {vi} from 'vitest';
import {NextIntlClientProvider} from 'next-intl';
import en from '../../messages/en/common.json';
import zh from '../../messages/zh/common.json';
const route=vi.hoisted(()=>({pathname:'/macro'}));
vi.mock('next/navigation',()=>({usePathname:()=>route.pathname}));
import {TabBar} from './TabBar';

const renderNav=(locale:'zh'|'en',pathname:string)=>{
 route.pathname=pathname;
 const html=renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,messages:{common:locale==='zh'?zh:en},children:createElement(TabBar)}));
 return [...html.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav>/g)].map(nav=>({
  attributes:nav[1],
  links:[...nav[2].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(link=>({
   href:/href="([^"]+)"/.exec(link[1])![1].replaceAll('&amp;','&'),
   current:link[1].includes('aria-current="page"'),
   highlighted:link[1].includes('text-accent'),
   marker:link[2].includes('bg-accent'),
   label:link[2].replace(/<[^>]*>/g,''),
  })),
 }));
};

describe('rendered research navigation',()=>{
 it.each(['zh','en'] as const)('exposes explicit desktop research destinations in %s without crowding mobile',locale=>{
  const navs=renderNav(locale,'/macro');
  expect(navs).toHaveLength(2);
  const desktop=navs.find(nav=>nav.attributes.includes('hidden lg:flex'))!;
  const mobile=navs.find(nav=>nav.attributes.includes('lg:hidden'))!;
  expect(desktop).toBeDefined();
  expect(mobile).toBeDefined();
  expect(mobile.links.map(link=>link.href)).toEqual(['/macro','/watchlist','/intel','/portfolio','/analyst','/tools','/settings']);
  expect(desktop.links.map(link=>link.href)).toEqual(['/macro','/watchlist','/intel/industries?scheme=sic&metric=member_count','/intel/companies',...mobile.links.slice(2).map(link=>link.href)]);
  expect(desktop.links[2].label).toBe(locale==='zh'?'行业研究（美国 SIC）':'Industry research (US SIC)');
  expect(desktop.links[3].label).toBe(locale==='zh'?'公司研究':'Company research');
 });
 it.each([
  ['/intel/industries','/intel/industries?scheme=sic&metric=member_count'],
  ['/intel/industries/sic/3674/constituents','/intel/industries?scheme=sic&metric=member_count'],
  ['/intel/industries/sw2021/801120.SI','/intel/industries?scheme=sic&metric=member_count'],
  ['/intel/companies','/intel/companies'],
  ['/intel/companies/issuer-123/financials','/intel/companies'],
  ['/intel','/intel'],
  ['/intel/methods/a','/intel'],
  ['/intel/companies-extra','/intel'],
  ['/intel/industries-extra','/intel'],
  ['/macro/transmission','/macro'],
 ])('selects one desktop destination on %s and preserves mobile policy',(pathname,href)=>{
  const navs=renderNav('zh',pathname);
  const desktop=navs.find(nav=>nav.attributes.includes('hidden lg:flex'))!;
  const mobile=navs.find(nav=>nav.attributes.includes('lg:hidden'))!;
  expect(desktop).toBeDefined();
  expect(desktop.links.filter(link=>link.current).map(link=>link.href)).toEqual([href]);
  expect(mobile.links.filter(link=>link.current).map(link=>link.href)).toEqual([pathname.startsWith('/intel')?'/intel':'/macro']);
  for(const nav of [desktop,mobile])for(const link of nav.links){
   expect(link.highlighted).toBe(link.current);
   expect(link.marker).toBe(link.current);
  }
 });
});
