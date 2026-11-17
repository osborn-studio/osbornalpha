import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

const read=(path:string)=>readFileSync(join(process.cwd(),path),'utf8');

describe('macro navigation',()=>{
 it('uses macro as the first tab and segment-aware active check',()=>{
  const source=read('src/components/TabBar.tsx');
  expect(source).toContain('PHONE_TAB_IDS');
  expect(source).not.toContain('/today');
  expect(source).toContain('activeNavId(pathname)');
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
vi.mock('next/navigation',()=>({usePathname:()=>route.pathname,useRouter:()=>({refresh:vi.fn()})}));
import {TabBar} from './TabBar';

const renderNav=(locale:'zh'|'en',pathname:string)=>{
 route.pathname=pathname;
 const html=renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{common:locale==='zh'?zh:en},children:createElement(TabBar)}));
 return [...html.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav>/g)].map(nav=>({
  attributes:nav[1],
  more:[...nav[2].matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)],
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
  expect(navs[0].links.map(l=>l.href)).toEqual(['/macro','/watchlist','/intel','/portfolio']);
  expect(navs[0].links.map(l=>l.label)).toEqual(locale==='zh'?['宏观','股票池','研究','我的投资']:['Macro','Watchlist','Research','Portfolio']);
  expect(navs[0].attributes).toContain('lg:hidden');
  expect(navs[0].more).toHaveLength(1);
  expect(navs[0].more[0][1]).toContain('aria-haspopup="dialog"');
  expect(navs[0].more[0][1]).toContain('aria-expanded="false"');
  expect(navs[0].more[0][2]).toContain(locale==='zh'?'更多':'More');
  const catalog=locale==='zh'?zh:en;
  expect(catalog.nav).not.toHaveProperty('industries'); expect(catalog.nav).not.toHaveProperty('companies');
 });
 it.each(['/intel','/intel/industries/sic/3674/constituents','/intel/companies/issuer-1/financials','/intel/methods/a','/macro/transmission','/stock/AAPL'])('selects the parent on %s',path=>{
  const links=renderNav('zh',path)[0].links;
  expect(links.filter(l=>l.current).map(l=>l.href)).toEqual((path.startsWith('/intel')||path.startsWith('/stock/'))?['/intel']:path.startsWith('/macro')?['/macro']:[]);
  for(const link of links){expect(link.highlighted).toBe(link.current);expect(link.marker).toBe(link.current);}
 });
});

it('selects More for tools without selecting a link',()=>{const nav=renderNav('en','/tools/dcf')[0];expect(nav.links.filter(l=>l.current)).toHaveLength(0);expect(nav.more[0][1]).toContain('text-accent');expect(nav.more[0][2]).toContain('bg-accent');});

it.each([
 ['/macro','/macro'],['/macro/history','/macro'],['/intel','/intel'],
 ['/intel/industries/sic/3674','/intel'],['/intel/companies/x','/intel'],['/intel/methods/a','/intel'],['/stock/AAPL','/intel'],
 ['/watchlist/tracking','/watchlist'],['/portfolio/review','/portfolio'],
 ['/analyst/x',null],['/tools/dcf',null],['/settings',null],['/intelx',null],['/',null],['/briefs',null],
])('phone current item is segment-aware on %s',(path,href)=>{
 const nav=renderNav('en',path!)[0];
 expect(nav.links.filter(link=>link.current).map(link=>link.href)).toEqual(href?[href]:[]);
 expect(nav.more[0][1].includes('text-accent')).toBe(['/analyst/x','/tools/dcf','/settings'].includes(path!));
});
