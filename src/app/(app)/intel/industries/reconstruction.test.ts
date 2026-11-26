import {createElement,type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it,vi} from 'vitest';
import zh from '../../../../../messages/zh/industries.json';
import en from '../../../../../messages/en/industries.json';
import researchZh from '../../../../../messages/zh/research.json';
import researchEn from '../../../../../messages/en/research.json';
import type {ListView,DetailView} from '@/lib/industry/read';
const state=vi.hoisted(()=>({locale:'zh' as 'zh'|'en',list:null as ListView|null,detail:null as DetailView|null}));
vi.mock('next-intl/server',()=>({getLocale:async()=>state.locale,getTranslations:async()=> (key:string,values?:Record<string,string|number>)=>{
 const catalog=state.locale==='zh'?zh:en;
 const template=key.split('.').reduce<unknown>((v,k)=>(v as Record<string,unknown>)[k],catalog) as string;
 return template.replace(/\{(\w+)\}/g,(_,k:string)=>String(values?.[k]??''));
}}));
vi.mock('@/lib/industry/public-deps',()=>({publicReadDeps:()=>({db:{isDatasetPublic:async()=>false}}),adminReadDeps:()=>null}));
vi.mock('@/lib/industry/page-data',async original=>({...await original<typeof import('@/lib/industry/page-data')>(),loadView:async(key:string)=>({view:key.startsWith('list:')?state.list:state.detail,preview:false,error:null})}));
vi.mock('@/components/industries/SourceDrawer',()=>({SourceDrawerProvider:({children}:{children:ReactNode})=>children,SourceButton:({children}:{children:ReactNode})=>children,SourceDot:()=>null}));
vi.mock('@/components/industries/JudgmentArea',()=>({JudgmentArea:()=>null}));
vi.mock('@/lib/industry/memberships',()=>({isMemberAt:()=>true}));
vi.mock('@/lib/industry/replay',()=>({replayFromManifest:()=>({cells:[]})}));
import ListPage from './page';
import DetailPage from './[scheme]/[code]/page';
import {runHeader} from '@/lib/industry/read';
import {runRow} from '@/lib/industry/fixture-rows';
it.each(['zh','en'] as const)('renders scheme-specific reconstruction once on list and detail in %s',async locale=>{
 state.locale=locale;
 const scheme='sic';
 for(const membershipOn of ['2026-11-03',null]){
  const header={...runHeader(runRow()),membershipOn,factsAsOf:'2026-11-10'};
  const node={code:'3674',level:1,nameEn:'Industry',nameZh:'行业',parentCode:null};
  const common={state:'ok' as const,datasetKey:'scheme:sic:sec-current' as const,preview:false,freshness:'fresh' as const,header,periodEnds:[],valuation:{state:'not_enabled' as const}};
  state.list={...common,kind:'aggregate',nodes:[],metric:'revenue_sum',duration:'12M',cells:[],companion:[]};
  state.detail={...common,node,ancestors:[],children:[],aggregated:true,members:{count:0,unresolved:0,lastAddition:null},series:[],method:{methodVersion:header.methodVersion,configHash:header.configHash,formulaVersion:header.formulaVersion,codeVersion:header.codeVersion,config:{}},sources:['sec_submissions']};
  const catalog=locale==='zh'?zh:en;
  const expected=catalog.states.reconstruction.bodySic.replace('{date}',membershipOn??header.factsAsOf);
  for(const tree of [await ListPage({searchParams:Promise.resolve({scheme})}),await DetailPage({params:Promise.resolve({scheme,code:'3674'}),searchParams:Promise.resolve({})})]){
   const html=renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{industries:catalog,research:locale==='zh'?researchZh:researchEn},children:tree}));
   expect(html.match(/data-state="reconstruction"/g)).toHaveLength(1);
   // Desktop copy is contiguous once markup is stripped; phone repeats only the reachable remainder.
   const text=html.replace(/<[^>]*>/g,'').replaceAll('&#x27;',"'").replaceAll('&quot;','"');
   expect(text).toContain(expected);
   expect(html).not.toContain('data-state="snapshotConstituents"');
  }
 }
});
