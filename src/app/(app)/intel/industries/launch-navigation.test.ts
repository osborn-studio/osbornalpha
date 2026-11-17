import {createElement} from 'react';
import type {ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import en from '../../../../../messages/en/industries.json';
import zh from '../../../../../messages/zh/industries.json';
import {publicCell,runHeader} from '@/lib/industry/read';
import {cellRow,runRow} from '@/lib/industry/fixture-rows';
import type {ListView} from '@/lib/industry/read';

const state=vi.hoisted(()=>({view:null as ListView|null,locale:'en' as 'en'|'zh'}));
vi.mock('next-intl/server',()=>({getLocale:async()=>state.locale,getTranslations:async()=> (key:string,values?:Record<string,string|number>)=>{
 const message=key.split('.').reduce<unknown>((v,k)=>(v as Record<string,unknown>)?.[k],state.locale==='zh'?zh:en);
 return typeof message==='string'?message.replace(/\{(\w+)\}/g,(_,k:string)=>String(values?.[k]??'')):key;
}}));
vi.mock('next/link',()=>({default:({children,href}:{children:ReactNode;href:string})=>createElement('a',{href},children)}));
vi.mock('@/lib/industry/page-data',async original=>({
  ...await original<typeof import('@/lib/industry/page-data')>(),
  loadView:async()=>({view:state.view,error:null,preview:state.view!==null&&'preview' in state.view&&state.view.preview}),
}));
vi.mock('@/components/industries/SourceDrawer',()=>({SourceDrawerProvider:({children}:{children:ReactNode})=>children}));
vi.mock('@/components/industries/StateNotice',()=>({StateNotice:({kind,children}:{kind:string;children:ReactNode})=>createElement('div',{'data-state':kind},children)}));
vi.mock('@/components/industries/RunHeaderBar',()=>({RunHeaderBar:({extra}:{extra?:string})=>createElement('div',null,extra)}));
vi.mock('@/components/industries/SchemeLevelSwitch',()=>({SchemeSwitch:()=>null,SchemeLevelSwitch:()=>null,LinkMenu:()=>null,LinkSegment:()=>null}));
vi.mock('@/lib/industry/public-deps',()=>({adminReadDeps:()=>null,publicReadDeps:()=>({db:{isDatasetPublic:async()=>false}})}));
vi.mock('@/components/research-ui',()=>({PageHeader:()=>null,ResearchFooter:()=>null}));
vi.mock('@/components/industries/Heatmap',()=>({Heatmap:()=>null}));
vi.mock('@/components/industries/ListTable',()=>({ListTable:()=>null}));
vi.mock('@/components/industries/ValuationSnapshot',()=>({ValuationSnapshot:()=>null}));
import IndustriesPage from './page';
import ConstituentsPage from './[scheme]/[code]/constituents/page';

const node={code:'801120.SI',nameZh:'食品饮料',nameEn:null,parentCode:null,level:1};
const render=async(search:Record<string,string>={})=>renderToStaticMarkup(await IndustriesPage({searchParams:Promise.resolve(search)}));
beforeEach(()=>{state.locale='en';state.view={state:'empty',kind:'aggregate',datasetKey:'scheme:sw2021:2021',preview:false,freshness:'missing',nodes:[node]};});

describe('base industry navigation without aggregate publication',()=>{
  it.each([1,2,3])('exposes classification and constituent links at SW level %s without an active run',async level=>{
    if(state.view?.state==='empty')state.view.nodes=[{...node,level}];
    const html=await render({scheme:'sw2021',level:String(level)});
    expect(html).toContain('href="/intel/industries/sw2021/801120.SI"');
    expect(html).toContain('href="/intel/industries/sw2021/801120.SI/constituents"');
    expect(html).toContain('食品饮料');
    expect(html).toContain('data-state="empty"');
    expect(html).not.toContain('data-state="currentOnly"');
    expect(html).not.toContain('judgments.title');
  });
  it('labels an internal no-run preview without claiming a public licence',async()=>{
    if(state.view?.state==='empty')state.view.preview=true;
    const html=await render({scheme:'sw2021'});
    expect(html).toContain('data-state="adminPreview"');
    expect(html).toContain('href="/intel/industries/sw2021/801120.SI"');
  });
  it('does not invent rows when classifications have not loaded',async()=>{
    if(state.view?.state==='empty')state.view.nodes=[];
    const html=await render({scheme:'sw2021'});
    expect(html).not.toContain('<tbody>');
    expect(html).toContain('data-state="empty"');
  });
  it('keeps unlicensed SW hidden and provides the public SIC switch',async()=>{
    state.view={state:'unlicensed',datasetKey:'scheme:sw2021:2021'};
    const html=await render({scheme:'sw2021'});
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

it.each(['sw2021','sic'])('constituents breadcrumb preserves %s',async scheme=>{
 state.view=null;
 const html=renderToStaticMarkup(await ConstituentsPage({params:Promise.resolve({scheme,code:scheme==='sic'?'3674':'801120.SI'}),searchParams:Promise.resolve({})}));
 expect(html).toContain(`href="/intel/industries?scheme=${scheme}"`);
});

it.each(['zh','en'] as const)('shows latest current-metric coverage in the header in %s',async locale=>{
 state.locale=locale;
 const cell=publicCell(cellRow({metric:'revenue_sum',period_end:'2025-12-31'}));
 state.view={state:'ok',kind:'aggregate',datasetKey:'scheme:sic:sec-current',preview:false,freshness:'fresh',
  header:runHeader(runRow()),nodes:['a','b','c','d'].map(code=>({...node,code})),metric:'revenue_sum',duration:'12M',
  periodEnds:['2024-12-31','2025-12-31'],companion:[],valuation:{state:'not_enabled'},cells:[
   {...cell,code:'a',display:'value'}, {...cell,code:'b',display:'members'},
   {...cell,code:'b',periodEnd:'2024-12-31',display:'value'},
   {...cell,code:'c',metric:'member_count',display:'value'},
   {...cell,code:'outside',display:'value'},
  ]};
 const html=await render();
 expect(html).toContain(locale==='zh'?'有值 1 / 4 个行业':'1 of 4 industries have a value');
});
