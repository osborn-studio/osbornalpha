vi.mock('next-intl/server',()=>({getTranslations:async()=> (key:string)=>key}));
vi.mock('@/components/macro/AnalysisRunView',()=>({AnalysisRunView:()=>null}));
import {expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('404');}}));
vi.mock('@/lib/macro/strategy/flags',()=>({strategyEnabled:()=>true}));
vi.mock('@/lib/macro/strategy/port',()=>({strategyPort:()=>({})}));
vi.mock('@/components/macro/strategy/StrategyScreens',()=>({HistoryScreen:()=>null,ReviewIndexScreen:()=>null,StrategyPageHeader:()=>null}));
import HistoryPage from './history/page';
import ReviewIndexPage from './review/page';
it('preserves the CN query scope on history and review navigation',async()=>{
 const history=await HistoryPage({searchParams:Promise.resolve({region:'CN',boundary:'month_end'})});
 expect(history.props.region).toBe('CN');
 const review=await ReviewIndexPage({searchParams:Promise.resolve({region:'CN'})});
 expect(review.props.region).toBe('CN');
});
it('preserves analysis query scope while its saved run is loading',async()=>{
 const {default:AnalysisPage}=await import('./analyses/[runId]/page');
 const page=await AnalysisPage({params:Promise.resolve({runId:'r'}),searchParams:Promise.resolve({region:'CN'})});
 expect(page.props.children[1].props.initialRegion).toBe('CN');
 expect(page.props.children[0].props.href).toBe('/macro?region=CN&tab=correlation');
});
