import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it,vi} from 'vitest';
import zh from '../../messages/zh/common.json';
import en from '../../messages/en/common.json';
import {TopBar} from './TopBar';
const route=vi.hoisted(()=>({pathname:'/macro'}));
vi.mock('next/link',()=>({default:({children,...props}:import('react').ComponentProps<'a'>)=>createElement('a',props,children)}));
vi.mock('next/navigation',()=>({usePathname:()=>route.pathname,useRouter:()=>({refresh:vi.fn()})}));
vi.mock('./SearchInput',()=>({SearchInput:()=>createElement('input',{'aria-label':'Search'})}));
vi.mock('./ThemeToggle',()=>({ThemeToggle:()=>createElement('button',null,'Theme')}));
function render(locale:'zh'|'en',path='/macro'){route.pathname=path;return renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{common:locale==='zh'?zh:en},children:createElement(TopBar)}));}
it.each(['zh','en'] as const)('renders seven desktop links and compact phone controls in %s',locale=>{
 const html=render(locale);const nav=/<nav\b([^>]*)>([\s\S]*?)<\/nav>/.exec(html)!;
 expect(nav).not.toBeNull();expect(nav[1]).toContain('hidden lg:flex');expect(nav[1]).toContain(locale==='zh'?'主导航':'Main navigation');
 const links=[...nav[2].matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)];
 expect(links.map(l=>l[1])).toEqual(['/macro','/watchlist','/intel','/portfolio','/analyst','/tools','/settings']);
 expect(links.map(l=>l[2])).toEqual(locale==='zh'?['宏观','股票池','研究','我的投资','分析','工具','设置']:['Macro','Watchlist','Research','Portfolio','Analyst','Tools','Settings']);
 const search=[...html.matchAll(/<button\b([^>]*)>/g)].find(b=>b[1].includes('aria-expanded="false"'))!;expect(search[1]).toContain('lg:hidden');expect(search[1]).toContain(`aria-label="${locale==='zh'?'搜索':'Search'}"`);
 const group=/<div[^>]*role="group"[^>]*>([\s\S]*?)<\/div>/.exec(html)![1];expect(group).toContain('中');expect(group).toContain('EN');expect([...group.matchAll(/aria-pressed="true"/g)]).toHaveLength(1);expect(group).toMatch(new RegExp(`aria-pressed="true"[^>]*>${locale==='zh'?'中':'EN'}</button>`));
});
it.each([['/macro','/macro'],['/macro/history','/macro'],['/intel','/intel'],['/intel/industries/sic/3674','/intel'],['/intel/companies/x','/intel'],['/intel/methods/a','/intel'],['/stock/AAPL','/intel'],['/watchlist/tracking','/watchlist'],['/portfolio/review','/portfolio'],['/analyst/x','/analyst'],['/tools/dcf','/tools'],['/settings','/settings'],['/intelx',null],['/',null],['/briefs',null]])('selects one or zero on %s',(path,href)=>{const html=render('en',path!);const current=[...html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>/g)];expect(current).toHaveLength(href?1:0);if(href)expect(current[0][0]).toContain(`href="${href}"`);});

it('toggles a single search input into the phone row and measures the header',async()=>{
 const {act}=await import('react');const {create}=await import('react-test-renderer');
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const setProperty=vi.fn();const removeProperty=vi.fn();const disconnect=vi.fn();
 vi.stubGlobal('document',{documentElement:{style:{setProperty,removeProperty}}});vi.stubGlobal('ResizeObserver',class {observe=vi.fn();disconnect=disconnect;});
 let root:ReturnType<typeof create>;
 try {
  await act(async()=>{root=create(createElement(NextIntlClientProvider,{locale:'en',timeZone:'UTC',messages:{common:en},children:createElement(TopBar)}),{createNodeMock:element=>element.type==='header'?{getBoundingClientRect:()=>({height:49})}:null});});
  const button=()=>root!.root.findAllByType('button').find(node=>node.props['aria-expanded']!==undefined)!;
  expect(button().props['aria-expanded']).toBe(false);expect(root!.root.findAllByType('input')).toHaveLength(1);
  await act(async()=>button().props.onClick());expect(button().props['aria-expanded']).toBe(true);expect(root!.root.findByType('input').parent!.parent!.props.className).toContain('flex order-last w-full');
  expect(setProperty).toHaveBeenCalledWith('--app-topbar-height','49px');await act(async()=>root!.unmount());expect(disconnect).toHaveBeenCalled();
 } finally {vi.unstubAllGlobals();}
});
