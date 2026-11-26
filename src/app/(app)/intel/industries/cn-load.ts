import 'server-only';
import {createElement} from 'react';
import {notFound} from 'next/navigation';
import {CnConstituents,CnDetail,CnList,CnState} from '@/components/industries/cn/CnPages';
import {INDUSTRIES_PATH,constituentsPath,industryPath,type Search} from '@/components/industries/hrefs';
import {vendorPageDeps} from '@/lib/industry/vendor/page-deps';
import {cnConstituentsView,cnDetailView,cnListView,type ListMetric,type VendorPageDeps} from '@/lib/industry/vendor/page-read';
import {FINANCIAL_METRICS} from '@/lib/vendor/gildata/parse-financials';

async function read<T>(build:(deps:VendorPageDeps)=>Promise<T>){
 try{return await build(await vendorPageDeps());}
 catch{return {state:'error'} as const;}
}

function statePage(state:'withheld'|'empty'|'error',kind:'list'|'detail'|'constituents',path:string,search:Search){
 // Withheld responses are identical for every code, including unrecognized ones.
 return createElement(CnState,state==='withheld'?{state,kind:'list',path:INDUSTRIES_PATH,search:{}}:{state,kind,path,search});
}

const listMetrics:readonly ListMetric[]=['revenue_yoy','net_income_parent_yoy','gross_margin','roe_avg'];
export async function loadCnList(search:Search){
 const metric=listMetrics.find(key=>key===search.metric)??'revenue_yoy';
 const basis=search.basis==='quarter'?'quarter':'annual';
 const view=await read(deps=>cnListView(deps,{metric,basis}));
 if(view.state!=='ok')return statePage(view.state,'list',INDUSTRIES_PATH,search);
 return createElement(CnList,{view,search:{...search,metric,basis}});
}

export async function loadCnDetail(code:string,search:Search){
 const metric=FINANCIAL_METRICS.find(m=>m.metric===search.metric)?.metric??'revenue_yoy';
 const basis=search.basis==='quarter'?'quarter':'annual';
 const window=search.window==='5y'||search.window==='all'?search.window:'10y';
 const view=await read(deps=>cnDetailView(deps,{code,metric,basis,window}));
 if(view.state==='unknown_industry')notFound();
 if(view.state!=='ok')return statePage(view.state,'detail',industryPath('sw2021',code),search);
 return createElement(CnDetail,{view,search:{...search,metric,basis,window}});
}

export async function loadCnConstituents(code:string,search:Search){
 const page=search.page&&/^\d+$/.test(search.page)?Number(search.page):1;
 const view=await read(deps=>cnConstituentsView(deps,{code,page}));
 if(view.state==='unknown_industry')notFound();
 if(view.state!=='ok')return statePage(view.state,'constituents',constituentsPath('sw2021',code),search);
 return createElement(CnConstituents,{view,search});
}
