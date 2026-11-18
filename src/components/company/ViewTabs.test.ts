import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it} from 'vitest';
import {VIEW_IDS} from '@/lib/company/client';
import {ViewTabs,PRIMARY_VIEWS,SECONDARY_VIEWS} from './ViewTabs';
import en from '../../../messages/en/company.json';
import zh from '../../../messages/zh/company.json';
it('splits every view exactly once in the required order',()=>{
 expect(PRIMARY_VIEWS).toEqual(['overview','statements','metrics','filings','tracking','judgments']);
 expect(SECONDARY_VIEWS).toEqual(['ai','signals','holdings']);
 expect([...PRIMARY_VIEWS,...SECONDARY_VIEWS].sort()).toEqual([...VIEW_IDS].sort());
});
for(const locale of ['en','zh'] as const) for(const view of VIEW_IDS) it(`tabs ${locale} ${view}`,()=>{
 const messages=locale==='en'?en:zh;
 const html=renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,messages:{company:messages},children:createElement(ViewTabs,{ticker:'TEST',view,asOf:'2025-01-01'})}));
 expect(html).not.toContain('aria-haspopup');
 expect(html).toContain('<ul');
 expect(html).toContain('aria-expanded="false"');
 expect(html).not.toContain('role="menu');
 expect(html.match(/<li>/g)).toHaveLength(3);
 expect(html.match(/aria-current="page"/g)).toHaveLength(1);
 expect(html).toContain('asOf=2025-01-01');
 if(['ai','signals','holdings'].includes(view)) expect(html).toContain(`${locale==='zh'?'更多':'More'} · ${messages.tabs[view]}`);
});

const {parse}=createRequire(import.meta.url)('next/dist/compiled/node-html-parser');

it('scrolls the dropdown into view when More opens',()=>{
 const source=readFileSync(new URL('./ViewTabs.tsx',import.meta.url),'utf8');
 const effects=source.matchAll(/useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\n  \},\s*\[([^\]]*)\]\)/g);
 const openEffect=Array.from(effects).find(([, ,deps])=>deps.trim()==='open');
 expect(openEffect?.[1]).toMatch(/scrollIntoView\?\.\(\{[^}]*\bblock:\s*'nearest'/);
});

it('puts trailing controls after a full-width mobile tab strip',()=>{
 const root=parse(renderToStaticMarkup(createElement(NextIntlClientProvider,{locale:'zh',messages:{company:zh},
  children:createElement(ViewTabs,{ticker:'TEST',view:'overview',asOf:null}),
 })));
 const strip=root.querySelector('nav[data-testid="company-tabs-strip"]');
 expect(strip,'company-tabs-strip nav').toBeTruthy();
 expect(strip.classList.value).toEqual(expect.arrayContaining(['basis-full','overflow-x-auto','lg:flex-1']));
 expect(strip.classList.value).not.toContain('flex-1');
 const trailing=root.querySelector('[data-testid="company-tabs-trailing"]');
 expect(trailing,'company-tabs-trailing wrapper').toBeTruthy();
 expect(strip.range[1]).toBeLessThanOrEqual(trailing.range[0]);
 expect(trailing.querySelector('button[data-testid="company-more"]')).toBeTruthy();
 const menu=root.querySelector('ul');
 expect(menu.classList.value).toEqual(expect.arrayContaining(['left-0','lg:left-auto','lg:right-0']));
 expect(menu.classList.value).not.toContain('right-0');
});
