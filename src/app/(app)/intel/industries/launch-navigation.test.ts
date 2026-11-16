import {createElement} from 'react';
import type {ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {ListView} from '@/lib/industry/read';

const state=vi.hoisted(()=>({view:null as ListView|null}));
vi.mock('next-intl/server',()=>({getLocale:async()=> 'en',getTranslations:async()=> (key:string)=>key}));
vi.mock('next/link',()=>({default:({children,href}:{children:ReactNode;href:string})=>createElement('a',{href},children)}));
vi.mock('@/lib/industry/page-data',async original=>({
  ...await original<typeof import('@/lib/industry/page-data')>(),
  loadView:async()=>({view:state.view,error:null,preview:state.view!==null&&'preview' in state.view&&state.view.preview}),
}));
vi.mock('@/components/industries/SourceDrawer',()=>({SourceDrawerProvider:({children}:{children:ReactNode})=>children}));
vi.mock('@/components/industries/StateNotice',()=>({StateNotice:({kind,children}:{kind:string;children:ReactNode})=>createElement('div',{'data-state':kind},children)}));
vi.mock('@/components/industries/RunHeaderBar',()=>({RunHeaderBar:()=>null}));
vi.mock('@/components/industries/SchemeLevelSwitch',()=>({SchemeLevelSwitch:()=>null,LinkMenu:()=>null,LinkSegment:()=>null}));
vi.mock('@/components/industries/SourcesFooter',()=>({SourcesFooter:()=>null}));
import IndustriesPage from './page';

const node={code:'801120.SI',nameZh:'食品饮料',nameEn:null,parentCode:null,level:1};
const render=async(search:Record<string,string>={})=>renderToStaticMarkup(await IndustriesPage({searchParams:Promise.resolve(search)}));
beforeEach(()=>{state.view={state:'empty',kind:'aggregate',datasetKey:'scheme:sw2021:2021',preview:false,freshness:'missing',nodes:[node]};});

describe('base industry navigation without aggregate publication',()=>{
  it.each([1,2,3])('exposes classification and constituent links at SW level %s without an active run',async level=>{
    if(state.view?.state==='empty')state.view.nodes=[{...node,level}];
    const html=await render({level:String(level)});
    expect(html).toContain('href="/intel/industries/sw2021/801120.SI"');
    expect(html).toContain('href="/intel/industries/sw2021/801120.SI/constituents"');
    expect(html).toContain('食品饮料');
    expect(html).toContain('data-state="empty"');
    expect(html).not.toContain('data-state="currentOnly"');
    expect(html).not.toContain('judgments.title');
  });
  it('labels an internal no-run preview without claiming a public licence',async()=>{
    if(state.view?.state==='empty')state.view.preview=true;
    const html=await render();
    expect(html).toContain('data-state="adminPreview"');
    expect(html).toContain('href="/intel/industries/sw2021/801120.SI"');
  });
  it('does not invent rows when classifications have not loaded',async()=>{
    if(state.view?.state==='empty')state.view.nodes=[];
    const html=await render();
    expect(html).not.toContain('<tbody>');
    expect(html).toContain('data-state="empty"');
  });
  it('keeps unlicensed SW hidden and provides the public SIC switch',async()=>{
    state.view={state:'unlicensed',datasetKey:'scheme:sw2021:2021'};
    const html=await render();
    expect(html).not.toContain('801120.SI');
    expect(html).toContain('href="/intel/industries?scheme=sic"');
  });
  it('preserves SIC current-only navigation and observed counts',async()=>{
    state.view={state:'ok',kind:'navigation',datasetKey:'scheme:sic:sec-current',preview:false,freshness:'fresh',nodes:[{...node,code:'3674',members:62}]};
    const html=await render({scheme:'sic'});
    expect(html).toContain('data-state="currentOnly"');
    expect(html).toContain('href="/intel/industries/sic/3674/constituents"');
    expect(html).toContain('>62</td>');
  });
});
