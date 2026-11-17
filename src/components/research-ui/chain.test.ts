import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it,vi} from 'vitest';
import zh from '../../../messages/zh/research.json';
import en from '../../../messages/en/research.json';
import {activeChainStep,chainVisible,chainItems,DEFAULT_CHAIN_AVAILABILITY} from './chain';
import {ResearchChain} from './ResearchChain';
const route=vi.hoisted(()=>({pathname:'/macro'}));
vi.mock('next/navigation',()=>({usePathname:()=>route.pathname}));
it.each([
 ['/macro',true,'macro'],['/macro/history',true,'macro'],['/intel',true,null],
 ['/intel/industries',true,'industry'],['/intel/industries/sic/3674',true,'industry'],
 ['/intel/companies/x',true,'company'],['/stock/AAPL',true,'company'],
 ['/intel/foreign-research',true,'foreign'],['/intel/topics/a',true,'topic'],
 ['/intel/methods/a',true,null],['/intel/industries-extra',true,null],
 ['/watchlist',false,null],['/',false,null],['/intelx',false,null],
] as const)('%s is segment aware',(path,visible,active)=>{
 expect(chainVisible(path)).toBe(visible);expect(activeChainStep(path)).toBe(active);
});
it('unavailable steps override current paths',()=>{
 for(const path of ['/intel/foreign-research','/intel/topics/a'])
 expect(chainItems(path,DEFAULT_CHAIN_AVAILABILITY).slice(3).map(i=>[i.state,i.href])).toEqual([['notServed',null],['notServed',null]]);
});
it.each(['zh','en'] as const)('renders available links and disabled steps in %s',locale=>{
 const render=(all=false)=>renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{research:locale==='zh'?zh:en},children:createElement(ResearchChain,all?{availability:{macro:true,industry:true,company:true,foreign:true,topic:true}}:{})}));
 route.pathname='/intel/industries/sic/3674';
 const html=render();const links=[...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(m=>m[0]);
 expect(links).toHaveLength(3);expect(links.filter(s=>s.includes('aria-current="page"'))).toHaveLength(1);
 expect(links.find(s=>s.includes('aria-current="page"'))).toContain(locale==='zh'?'行业研究':'Industry research');
 expect([...html.matchAll(/data-chain-state="notServed"/g)]).toHaveLength(2);
 expect([...html.matchAll(/aria-disabled="true"/g)]).toHaveLength(2);
 expect(html).toContain(locale==='zh'?'未服务':'Not served');
 expect(links.join('')).not.toContain('notServed');
 expect([...html.matchAll(/>0([1-5])</g)].map(m=>m[1])).toEqual(['1','2','3','4','5']);
 expect([...render(true).matchAll(/<a\b/g)]).toHaveLength(5);
 route.pathname='/watchlist';expect(render()).toBe('');
});
it('mounts after TopBar',()=>expect(readFileSync('src/app/(app)/layout.tsx','utf8')).toMatch(/<TopBar \/>\s*<ResearchChain/));

it.each(['zh','en'] as const)('renders short and full labels in %s',locale=>{route.pathname='/macro';const catalog=locale==='zh'?zh:en;const html=renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{research:catalog},children:createElement(ResearchChain)}));const short=locale==='zh'?['宏观','行业','公司','外资研报','专题']:['Macro','Industry','Company','Foreign','Topic'];for(const label of short) expect(html).toContain(`class="sm:hidden">${label}</span>`);for(const label of Object.values(catalog.chain.steps)) expect(html).toContain(`class="hidden sm:inline">${label}</span>`);});

it('industry step delegates the metric default to the page',()=>{
 expect(chainItems('/macro',DEFAULT_CHAIN_AVAILABILITY).find(i=>i.id==='industry')?.href).toBe('/intel/industries?scheme=sic');
});
