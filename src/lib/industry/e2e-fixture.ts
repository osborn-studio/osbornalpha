// src/lib/industry/e2e-fixture.ts
// E2E fixture mode (spec §13.5): with INDUSTRY_E2E_FIXTURES=1 outside production, public-deps.ts
// serves these synthetic read dependencies instead of Supabase, so Playwright can drive the three
// routes, the drawer, the table view, the reconstruction badge and the unlicensed state on a dev
// server with no database. The cookie `industry_e2e=unlicensed` flips the SW licence. NODE_ENV is
// 'production' on every Vercel build, so this path can never serve a deployed page.
// Consistency (Codex plan audit round 1 #8): every displayed cell comes from a manifest COMPUTED by the
// real pipeline (computeAggregateCell → buildAggregateManifest, synthetic facts), one manifest per
// (code, period_end) group with its own members, values and counts, so the drawer's original replay
// reproduces each stored value — except E2E_TAMPERED, whose stored value is deliberately altered so the
// E2E run sees the "not reproduced" state too. Values are synthetic layout data, not facts.
import {cookies} from 'next/headers';
import type {FactRow} from '../facts/types';
import {computeAggregateCell} from './aggregate';
import type {IssuerFacts} from './aggregate';
import {BATCH,ISSUER_A,ISSUER_B,cellRow,classRow,membershipRow,runRow,stubIndustryDb} from './fixture-rows';
import {buildAggregateManifest,encodeManifest} from './manifest';
import type {IssuerCard,ReadDb,ReadDeps,ReplayDeps,ValuationReplayDeps} from './read';
import type {AggregateManifest,ManifestMember,MetricCellRow} from './types';

export const E2E_COOKIE='industry_e2e';
export const fixtureMode=(env:Record<string,string|undefined>=process.env)=>env.INDUSTRY_E2E_FIXTURES==='1'&&env.NODE_ENV!=='production';
/** The one cell whose stored value disagrees with its manifest (E2E checks the "not reproduced" drawer). */
export const E2E_TAMPERED={code:'801080.SI',periodEnd:'2025-12-31',metric:'gross_margin' as const,storedValue:'0.25'};

async function swLicensed():Promise<boolean>{
 try{return (await cookies()).get(E2E_COOKIE)?.value!=='unlicensed';}catch{return true;}
}
const RUN=runRow();
const YEARS=['2023','2024','2025'] as const;
let seq=0;
const fact=(issuer:string,concept:'revenue_operating'|'cost_of_revenue',year:string,value:string):FactRow=>({fact_id:`e2e-${String(++seq).padStart(5,'0')}`,issuer_id:issuer,market:'CN',
 filing_id:`e2e:${issuer}:${year}`,run_id:'e2e',concept,source_concept:concept,statement:'IS',period_start:`${year}-01-01`,period_end:`${year}-12-31`,duration:'12M',value,value_text:value,
 unit:'CNY',consolidation:'consolidated',available_date:`${Number(year)+1}-03-31`,mapping_gen:1,mapping_version:'e2e',status:'ok',raw_hash:`e2e-${seq}`,created_at:'2026-01-01T00:00:00.000Z',
 disclosure_seq:1,is_current:true,is_revision:false});
const memberOf=(id:string,ticker:string|null):ManifestMember=>({issuer_id:id,ticker,valid_from:'2021-07-30',valid_to:null,available_date:'2021-07-30',valid_to_available_date:null,
 source_membership_id:null,raw_hash:null,locator:null,resolution_method:'today'});
interface GroupSpec{code:string;financial:boolean;members:{id:string;ticker:string|null;rev?:string;cost?:string}[];unresolved:number}
/** One (code, Dec-31) group through the real computation, so its manifest replays to exactly these cells. */
function groupManifest(year:string,g:GroupSpec):AggregateManifest{
 const issuers=new Map<string,IssuerFacts>(g.members.map(m=>[m.id,{issuer_id:m.id,stateRev:1,truncated:false,
  rows:m.rev!==undefined&&m.cost!==undefined?[fact(m.id,'revenue_operating',year,m.rev),fact(m.id,'cost_of_revenue',year,m.cost)]:[],derived:[]}]));
 const result=computeAggregateCell({code:g.code,period_end:`${year}-12-31`,financial:g.financial,members:g.members.map(m=>m.id),nUnresolved:g.unresolved,issuers});
 return buildAggregateManifest({header:{scheme:'sw2021',version:'2021',code:g.code,level:1,period_end:`${year}-12-31`,facts_as_of:RUN.facts_as_of,knowledge_date:RUN.knowledge_date,
   history_class:RUN.history_class,method_version:RUN.method_version,config_hash:RUN.config_hash,formula_version:RUN.formula_version,code_version:RUN.code_version},
  members:g.members.map(m=>memberOf(m.id,m.ticker)),
  unresolved:Array.from({length:g.unresolved},(_,i)=>({ts_code:`68899${i}.SH`,in_date:'2021-07-30',out_date:null,source_membership_id:`e2e00000-0000-4000-8000-00000000000${i}`})),
  memberStateRevs:g.members.map(m=>({issuer_id:m.id,state_rev:1})),result,filings:new Map()});
}
const ELEC=Array.from({length:10},(_,i)=>`eeeeeeee-eeee-4eee-8eee-00000000000${i}`);
const BANKS=['bbbbbbbb-bbbb-4bbb-8bbb-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-000000000002'];
/** 食品饮料 47.8% / 47.0% / 46.1%; 电子 21.5% / 21% / 20% with 9/6/9 of 10 members reporting and 2 unresolved in 2023; 银行 financial_excluded. */
const SPECS=(year:typeof YEARS[number]):GroupSpec[]=>{
 const k=YEARS.indexOf(year);
 return [
  {code:'801120.SI',financial:false,unresolved:0,members:[{id:ISSUER_A,ticker:'600519.SH',rev:'600',cost:['323.4','318','313.2'][k]},{id:ISSUER_B,ticker:'600059.SH',rev:'400',cost:['215.6','212','208.8'][k]}]},
  {code:'801080.SI',financial:false,unresolved:k===0?2:0,members:ELEC.map((id,i)=>({id,ticker:null,...(i<(k===1?6:9)?{rev:'100',cost:['80','79','78.5'][k]}:{})}))},
  {code:'801780.SI',financial:true,unresolved:0,members:BANKS.map(id=>({id,ticker:null}))},
 ];
};
const MANIFESTS=new Map<string,AggregateManifest>();
const cells:MetricCellRow[]=[];
for(const year of YEARS)for(const g of SPECS(year)){
 const m=groupManifest(year,g);const hash=encodeManifest(m).hash;MANIFESTS.set(hash,m);
 for(const c of m.cells.filter(x=>(x.metric==='gross_margin'&&x.duration==='12M')||x.metric==='member_count')){
  const tampered=g.code===E2E_TAMPERED.code&&`${year}-12-31`===E2E_TAMPERED.periodEnd&&c.metric===E2E_TAMPERED.metric;
  cells.push(cellRow({code:g.code,metric:c.metric,duration:c.duration,period_start:c.period_start,period_end:`${year}-12-31`,status:c.status,missing_reason:c.missing_reason??null,
   value:c.status==='ok'?(tampered?E2E_TAMPERED.storedValue:c.value_text??null):null,unit:c.unit,n_members:c.n_members,n_with_data:c.n_with_data,n_unresolved:c.n_unresolved,manifest_hash:c.status==='ok'?hash:null}));
 }
}
/** The fixture's cells and their manifests (tests assert every ok cell but E2E_TAMPERED replays exactly). */
export const e2eCells=():MetricCellRow[]=>cells.map(c=>({...c}));
export const e2eManifest=(hash:string):AggregateManifest=>{const m=MANIFESTS.get(hash);if(!m)throw new Error(`manifest_not_found:${hash}`);return m;};
const TREE=[
 classRow(),classRow({code:'801080.SI',name_zh:'电子'}),classRow({code:'801780.SI',name_zh:'银行'}),
 classRow({code:'801124.SI',level:2,name_zh:'食品加工',parent_code:'801120.SI'}),classRow({code:'850111.SI',level:3,name_zh:'白酒Ⅲ',parent_code:'801124.SI'}),
 classRow({scheme:'sic',version:'sec-current',code:'3674',name_zh:null,name_en:'Semiconductors & Related Devices'}),
];
const MEMBERS=[
 membershipRow(),membershipRow({membership_id:'dddddddd-dddd-4ddd-8ddd-dddddddddd02',level:2,code:'801124.SI'}),membershipRow({membership_id:'dddddddd-dddd-4ddd-8ddd-dddddddddd03',level:3,code:'850111.SI'}),
 membershipRow({membership_id:'dddddddd-dddd-4ddd-8ddd-dddddddddd04',issuer_id:ISSUER_B,valid_from:'2014-02-21',available_date:'2014-02-21',batch_id:BATCH}),
];
const CARDS=new Map<string,IssuerCard>([[ISSUER_A,{issuerId:ISSUER_A,nameZh:'贵州茅台',nameEn:'Kweichow Moutai',ticker:'600519.SH'}],[ISSUER_B,{issuerId:ISSUER_B,nameZh:'古越龙山',nameEn:null,ticker:'600059.SH'}]]);

function fixtureDb(now:Date):ReadDb{
 const base=stubIndustryDb({tree:TREE,runs:[RUN],cells,memberships:MEMBERS,
  freshness:[{dataset:'industry.agg.sw2021',status:'fresh',last_ok_at:new Date(now.getTime()-86_400_000).toISOString()},{dataset:'industry.sw2021.memberships',status:'fresh',last_ok_at:new Date(now.getTime()-86_400_000).toISOString()}]});
 return {...base,isDatasetPublic:async k=>k==='scheme:sic:sec-current'||(k==='scheme:sw2021:2021'&&await swLicensed())};
}
export function fixtureReadDeps(now:Date,preview=false):ReadDeps{
 return {db:fixtureDb(now),unresolved:{unresolvedCount:async()=>1},issuers:async ids=>new Map(ids.flatMap(id=>CARDS.has(id)?[[id,CARDS.get(id)!] as const]:[])),
  memberCounts:async()=>new Map([['3674',0]]),now,preview};
}
export function fixtureReplayDeps(now:Date):ReplayDeps{
 const db=fixtureDb(now);
 return {db:{...db,metricRunVisible:async r=>r===RUN.run_id&&await db.isDatasetPublic('scheme:sw2021:2021')},manifests:{get:async h=>e2eManifest(h)},
  recompute:async q=>{const hit=cells.find(c=>c.code===q.code&&c.period_end===q.periodEnd&&c.manifest_hash!==null);return e2eManifest(hit!.manifest_hash!);},now};
}
export function fixtureValuationReplayDeps():ValuationReplayDeps{
 return {db:fixtureDb(new Date()),officialValue:async()=>null};
}
