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
 const html=renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{common:locale==='zh'?zh:en},children:createElement(TabBar)}));
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
 it.each(['zh','en'] as const)('renders one unified navigation in %s',locale=>{
  const navs=renderNav(locale,'/macro'); expect(navs).toHaveLength(1);
  expect(navs[0].links.map(l=>l.href)).toEqual(['/macro','/watchlist','/intel','/portfolio','/analyst','/tools','/settings']);
  expect(navs[0].links.map(l=>l.label)).toEqual(locale==='zh'?['宏观','股票池','研究','我的投资','分析','工具','设置']:['Macro','Watchlist','Research','Portfolio','Analyst','Tools','Settings']);
  const catalog=locale==='zh'?zh:en;
  expect(catalog.nav).not.toHaveProperty('industries'); expect(catalog.nav).not.toHaveProperty('companies');
 });
 it.each(['/intel','/intel/industries/sic/3674/constituents','/intel/companies/issuer-1/financials','/intel/methods/a','/macro/transmission','/stock/AAPL'])('selects the parent on %s',path=>{
  const links=renderNav('zh',path)[0].links;
  expect(links.filter(l=>l.current).map(l=>l.href)).toEqual(path.startsWith('/intel')?['/intel']:path.startsWith('/macro')?['/macro']:[]);
  for(const link of links){expect(link.highlighted).toBe(link.current);expect(link.marker).toBe(link.current);}
 });
});
