// Synthetic layout payloads only. Keep contracts checked at construction, not cast at the route.
import type {StatementsResponse,FactSeriesResponse,OverviewResponse,MetricsResponse,FreshnessResponse,CompanyFilingsResponse,FactIdsResponse} from '../../src/lib/company/client';
import type {EvidenceDto,FactCell,FilingSummary} from '../../src/lib/company/types';
import type {EventsResponse,InboxResponse,WatchesResponse,WatchCard,InboxRowDto} from '../../src/lib/company/tracking-client';
import type {IssuerIndustriesView} from '../../src/lib/industry/read';
import type {Input,JudgmentRow} from '../../src/lib/judgments/types';
import type {JudgmentDetailResponse,JudgmentsListResponse,WireCard} from '../../src/components/judgments/api-types';
import type {ResolvedIssuer} from '../../src/lib/entities/resolve';
import type {DirectoryRow} from '../../src/lib/company/directory';
import {COMPANY_FIXTURE_US,COMPANY_FIXTURE_CN,fixtureCompanyPageData} from '../../src/lib/company/e2e-fixture';
export const US=COMPANY_FIXTURE_US;
export const CN=COMPANY_FIXTURE_CN;
export const DAY='2026-01-31';
// Match the unconfigured GET response; local mode cannot start a migration PUT.
export const watchlistSync={mode:'local',groups:null} satisfies {mode:'local';groups:null};
export const resolvedIssuer=fixtureCompanyPageData('FIXT',DAY)!.issuer! satisfies ResolvedIssuer;
export const PERIOD='2024-01-01:2024-12-31:12M';
export const noWithheld={citationPending:0,evidenceIncomplete:0};
const base={issuerId:US,ticker:'FIXT',market:'US' as const,asOf:DAY,mappingGen:1,stateRev:1,truncated:false};
export const filing={filingId:'fixture-filing',formType:'10-K',fiscalYear:2024,fiscalPeriod:'FY',periodEnd:'2024-12-31',availableDate:'2025-03-01',sourceRef:'fixture-accession',source:'edgar',url:'https://example.invalid/fixture-filing',documentUrl:null,citation:'edgar',linkAttempts:0,factCount:1,mappingGen:1} satisfies FilingSummary;
const evidence={factId:'fixture-revenue',rawHash:'fixture-raw',snapshot:{source:'edgar',sha256:'a'.repeat(64),path:'fixture.json',api:'companyfacts',url:filing.url,params:null,capturedAt:'2025-03-01T12:00:00Z',httpStatus:200,page:null,download:null},locator:{hashLocator:'fixture-locator',jsonPointer:'/fixture/revenue',field:null,pdf:null},run:{runId:'fixture-run',codeVersion:'fixture-code',toolVersions:null},mappingVersion:'fixture/1',unitRule:'USD',sourceDocument:null} satisfies EvidenceDto;
export const fact={kind:'fact',factId:evidence.factId,value:'123000000',unit:'USD',availableDate:filing.availableDate,filingId:filing.filingId,disclosureSeq:1,isRevision:false,mappingGen:1,rawHash:evidence.rawHash,runId:evidence.run.runId,otherUnits:false} satisfies FactCell;
export const statements={...base,statement:'IS',basis:'disclosed',periods:[{key:PERIOD,periodStart:'2024-01-01',periodEnd:'2024-12-31',duration:'12M'}],rows:[{concept:'revenue',unit:'USD',unitKind:'money',sourceConcepts:['Revenues'],notes:null,cells:{[PERIOD]:fact}}],filings:{[filing.filingId]:filing},otherUnitOnly:{},otherUnitsAlso:{},evidence:{[fact.factId]:evidence},withheld:noWithheld} satisfies StatementsResponse;
export const cnStatements={...statements,issuerId:CN,ticker:'999999.SH',market:'CN',rows:[{concept:'revenue_operating',unit:'CNY',unitKind:'money',sourceConcepts:['revenue'],notes:null,cells:{[PERIOD]:{kind:'withheld',reason:'citation_pending',factId:'fixture-withheld'}}}],filings:{},evidence:{},withheld:{citationPending:1,evidenceIncomplete:0}} satisfies StatementsResponse;
export const series={...base,history:true,concept:'revenue',periodStart:'2024-01-01',periodEnd:'2024-12-31',unit:'USD',otherUnits:[],series:[{...fact,isCurrent:true,sourceConcept:'Revenues',mappingVersion:'fixture/1',unitRule:'USD',delta:null,relChange:null}],otherUnitSeries:[],filings:statements.filings,evidence:statements.evidence,withheld:noWithheld} satisfies FactSeriesResponse;
export const factKeys={facts:[{factId:fact.factId,concept:'revenue',periodStart:'2024-01-01',periodEnd:'2024-12-31',duration:'12M',unit:'USD'}]} satisfies FactIdsResponse;
export const overview={ticker:'FIXT',market:'US',asOf:DAY,coverage:fixtureCompanyPageData('FIXT',DAY)!.coverage,coverageOtherMarket:null,latestFiling:filing,latest:{periodKey:PERIOD,facts:{revenue:fact},derived:{},stateRev:1,truncated:false},recentEvents:[],eventsComputed:'materialized',evidence:statements.evidence,withheld:noWithheld} satisfies OverviewResponse;
export const metrics={...base,formulaVersion:'metrics/1',stale:false,metrics:[{metric:'gross_margin',periodStart:'2024-01-01',periodEnd:'2024-12-31',duration:'12M',inputUnit:'USD',basis:'reported',basedOnRev:1,computedAt:'2025-03-01T12:00:00Z',computedAtKind:'materialized',cell:{kind:'derived',metric:'gross_margin',value:'0.4',unit:'pure',inputUnit:'USD',basis:'reported',formulaVersion:'metrics/1',inputs:[{factId:fact.factId,concept:'revenue',filingId:filing.filingId,availableDate:filing.availableDate}]}}],evidence:statements.evidence,withheld:noWithheld} satisfies MetricsResponse;
export const freshness={datasets:[{dataset:'facts.us',status:'fresh',lastOkAt:'2025-03-01T12:00:00Z',lastAttemptAt:'2025-03-01T12:00:00Z'}]} satisfies FreshnessResponse;
export const filings={...base,filings:[filing]} satisfies CompanyFilingsResponse;
export const industries={state:'ok',issuerId:US,on:DAY,industries:[{scheme:'sic',version:'sec-current',datasetKey:'scheme:sic:sec-current',currentOnly:true,since:'2020-01-01',membershipId:'fixture-membership',path:[{code:'7372',level:1,nameZh:'夹具软件',nameEn:'Fixture Software',parentCode:null}]}],schemes:[{scheme:'sic',version:'sec-current',datasetKey:'scheme:sic:sec-current',public:true}]} satisfies IssuerIndustriesView;
export const card={judgment_id:'ffffffff-0000-4000-8000-000000000010',subject:{type:'issuer',key:US},judgment_type:'synthetic_fact_metric',kind:'probability',lifecycle:'open',outcome:null,calibration:'insufficient',retrospective:false,as_of:'2026-01-01',registered_at:'2026-01-01T12:00:00Z',methodology:{id:'synthetic_fact_metric',version:'v1',title:{zh:'夹具方法',en:'Fixture method'},href:'/intel/methods'},display:{headline:{zh:'夹具判断',en:'Fixture judgment'},value:null},condition:null,settlement:null,calibration_summary:null,inputs:[]} satisfies WireCard;
export const judgments={codeVersion:'fixture',subject:card.subject,view:'latest',asOf:null,cards:[card]} satisfies JudgmentsListResponse;
const galleryBase=(n:number,zh:string,en:string)=>({...card,judgment_id:`ffffffff-0000-4000-8000-${String(100+n).padStart(12,'0')}`,display:{headline:{zh,en},value:null}});
const summary={n_independent:12,n_total:20,threshold_n:100,brier:null,brier_skill:null,ece_raw_holdout:null,valid_until:'2026-03-01T00:00:00Z',hit_rate:null,href:'/intel/methods'} satisfies NonNullable<WireCard['calibration_summary']>;
const measured={...summary,n_independent:120,n_total:150};
const settlement={kind:'settled',outcome:null,realized:null,settled_at:'2026-01-30T12:00:00Z',evidence_summary:{zh:'已核对期末收盘价。',en:'The closing price was verified.'}} satisfies NonNullable<WireCard['settlement']>;
const price={ticker:'FIXT',market:'US',date:card.as_of,source:'datagateway',adjustment:'qfq'} as const;
const metric={issuer_id:US,market:'US',metric:'gross_margin',period_start:'2024-01-01',period_end:filing.periodEnd,input_unit:'USD',basis:'reported',formula_version:metrics.formulaVersion} as const;
const inputBase={available_at:card.registered_at,hash:'a'.repeat(64),origin:{publisher:'Fixture',adapter:'fixture',locator:'fixture.json'}};
const galleryInputs=[
 {...inputBase,kind:'financial_fact',ref:{fact_id:fact.factId},snapshot:{fact_id:fact.factId,issuer_id:US,market:'US',concept:'revenue',period_start:metric.period_start,period_end:metric.period_end,duration:'12M',value_text:fact.value,unit:fact.unit,consolidation:'reported',available_date:fact.availableDate,filing_id:filing.filingId,mapping_gen:1}},
 {...inputBase,kind:'price_bar',ref:price,snapshot:{...price,open:null,high:null,low:null,close:42,volume:null,amount:null,fields_present:['close']}},
 {...inputBase,kind:'financial_metric',ref:metric,origin:{...inputBase.origin,transform:metrics.formulaVersion},snapshot:{...metric,value_text:'0.4',unit:'pure',duration:'12M',as_of:card.as_of,based_on_rev:1,lineage:[],derivation:{formula_version:metrics.formulaVersion,as_of:card.as_of,state_rev:1,rows:[]}}},
] satisfies Input[];
const forecast=galleryBase(1,'根据最新财务报告中的营收、毛利率与收盘价，判断这家公司未来二十个交易日的股价能否在市场波动中保持增长并高于期初水平','Will the share price close higher after twenty trading sessions given the latest reported revenue, gross margin and closing price?');
const calibrated=galleryBase(2,'股价上涨概率','Probability of a price increase');
const hit=galleryBase(3,'股价如期上涨','Shares rose as forecast');
const verdict=galleryBase(5,'估值判断','Valuation verdict');
const regime=galleryBase(12,'宏观周期判断','Economic regime forecast');
const score=galleryBase(6,'经营质量评分','Operating quality score');
const range=galleryBase(7,'预期收益区间','Expected return range');
export const judgmentGallery={...judgments,cards:[
 {...forecast,display:{...forecast.display,value:0.62,band:'mid'},calibration_summary:summary,
  condition:{text:{zh:'收盘价高于期初价格',en:'The closing price exceeds the initial price'},target:{kind:'session_index',base_date:price.date,n:20},horizon:{unit:'trading_sessions',n:20},label_policy:'first_observed',settle_after:'2026-01-30T00:00:00Z',settle_by:'2026-02-02T00:00:00Z'},
  inputs:galleryInputs.map(({kind,ref,available_at,origin})=>({kind,ref,available_at,origin,href:kind==='financial_fact'?filing.url:null}))},
 {...calibrated,calibration:'calibrated',display:{...calibrated.display,value:0.64,percent:64},calibration_summary:{...measured,hit_rate:{rate:0.61,low:0.52,high:0.69}}},
 {...hit,lifecycle:'settled',outcome:'hit',calibration:'calibrated',display:{...hit.display,value:0.64,percent:64},settlement:{...settlement,outcome:'hit',realized:{value:true,label:'yes',unit:null,from:price.date,to:DAY,label_policy:'first_observed'}}},
 {...galleryBase(4,'回顾股价预测','Retrospective price forecast'),lifecycle:'settled',outcome:'miss',calibration:'failed',retrospective:true,calibration_summary:{...measured,ece_raw_holdout:0.12},settlement:{...settlement,outcome:'miss'}},
 {...verdict,judgment_type:'valuation_verdict',kind:'categorical',display:{...verdict.display,value:'undervalued'}},
 {...regime,judgment_type:'macro_regime',kind:'categorical',display:{...regime.display,value:'recovery'},
  methodology:{id:'macro_regime',version:'v2',title:{zh:'宏观周期',en:'Macro regime'},href:'/intel/methods/macro_regime/v2'},
  condition:{text:{zh:'年末经济周期',en:'Economic regime at year end'},target:{kind:'fiscal_period',period_end:'2026-12-31',calendar:{anchor_period_end:'2025-12-31',months:3},extrapolated:true},horizon:{unit:'fiscal_quarters',n:4},label_policy:'first_observed',settle_after:'2027-01-01T00:00:00Z',settle_by:'2027-05-01T00:00:00Z'}},
 {...score,kind:'score',calibration:'evaluated',calibration_summary:{...measured,spearman:0.31},display:{...score.display,value:72,scale:{min:0,max:100},dims:[
  {id:'growth',label:{zh:'增长',en:'Growth'},value:70,coverage:true},{id:'profit',label:{zh:'盈利',en:'Profit'},value:74,coverage:true},{id:'cash',label:{zh:'现金流',en:'Cash flow'},value:null,coverage:false}]}},
 {...range,judgment_type:'return_range',kind:'interval',calibration:'self_assessed',display:{...range.display,value:[-0.05,0.12],nominal_coverage:0.8}},
 {...galleryBase(8,'数据缺失','Missing observations'),lifecycle:'abstained',abstain_reason:'input_unavailable',missing:['revenue','gross_margin','fixture_unknown_concept']},
 {...galleryBase(9,'报价失效','Invalid price observation'),lifecycle:'void',settlement:{...settlement,kind:'void',evidence_summary:{zh:'交易所撤销了原始报价。',en:'The exchange cancelled the original quote.'}}},
 {...galleryBase(10,'预测已撤回','Forecast withdrawn'),lifecycle:'withdrawn',settlement:{...settlement,kind:'withdrawn'}},
 {...galleryBase(11,'等待成交','Awaiting execution'),lifecycle:'pending_fill',display:{headline:{zh:'等待成交',en:'Awaiting execution'},value:0.25,band:'low'}},
]} satisfies JudgmentsListResponse;
export const judgmentDetail=(id:string)=>{
 const c=[...judgmentGallery.cards,card].find(c=>c.judgment_id===id);
 if(!c)throw new Error(`Unknown fixture judgment ${id}`);
 const condition=c.condition;
 const judgment={judgment_id:id,subject_type:c.subject.type,subject_key:c.subject.key,judgment_type:c.judgment_type,methodology_id:c.methodology.id,methodology_version:c.methodology.version,
  kind:c.kind,producer_kind:'rule',producer_ref:{},producer_nonce:id,as_of:c.as_of,registered_at:c.registered_at,retrospective:c.retrospective,inputs:c.inputs.length?galleryInputs:[],inputs_hash:'a'.repeat(64),
  abstained:c.lifecycle==='abstained',abstain_reason:'abstain_reason' in c?c.abstain_reason??null:null,claim:null,condition:condition?{resolver:'price_return',params:{ticker:price.ticker,market:price.market,adjustment:price.adjustment,source:price.source,base_date:price.date},predicate:{op:'>',rhs:0},text:condition.text}:null,
  horizon:condition?.horizon??null,target:condition?.target??null,label_policy:condition?.label_policy??null,settle_after:condition?.settle_after??null,settle_by:condition?.settle_by??null,
  code_version:judgments.codeVersion,batch_id:'fixture',created_at:c.registered_at} satisfies JudgmentRow;
 return {codeVersion:judgments.codeVersion,view:judgments.view,asOf:judgments.asOf,card:c,judgment,settlements:[],calibration:null} satisfies JudgmentDetailResponse;
};
export const emptyJudgments={...judgments,cards:[]} satisfies JudgmentsListResponse;
export const emptyEvents={rows:[],nextCursor:null,evidence:{},computed:'materialized',withheld:noWithheld} satisfies EventsResponse;
export const withheldEvents={...emptyEvents,withheld:{citationPending:2,evidenceIncomplete:1}} satisfies EventsResponse;
export const emptyInbox={rows:[],nextCursor:null,evidence:{}} satisfies InboxResponse;
export function watch(n:number) {
 const issuerId=n===1?US:`ffffffff-0000-4000-8000-${String(100+n).padStart(12,'0')}`;
 return {issuerId,names:{zh:`夹具公司 ${n}`,en:`Fixture ${n}`},tickers:[{ticker:`FIX${n}`,stream:'US',isPrimary:true}],primaryTicker:{US:`FIX${n}`},streams:[{market:'US',latestPeriodEnd:'2024-12-31',latestAvailableDate:'2025-03-01'}],hkOnly:false,note:null,muted:false,createdAt:'2025-03-01T00:00:00Z',updatedAt:'2025-03-01T00:00:00Z',unread:0,unreadLabel:'0'} satisfies WatchCard;
}
export const watches={count:3,limit:100,unreadComplete:true,watches:[watch(1),watch(2),watch(3)]} satisfies WatchesResponse;
// More than one batch proves the all-failed circuit stops at the default concurrency (4).
export const manyWatches={...watches,count:6,watches:Array.from({length:6},(_,i)=>watch(i+1))} satisfies WatchesResponse;
export const noWatches={...watches,count:0,watches:[]} satisfies WatchesResponse;
export const inboxA={...emptyInbox,rows:[1,2].map(n=>({eventId:`fixture-event-${n}`,issuerId:US,market:'US',kind:'filing_published',naturalKey:`fixture-filing-${n}`,occurredOn:`2025-03-0${n}`,periodEnd:'2024-12-31',concept:null,filingId:`fixture-filing-${n}`,payload:{formType:'10-K'},meta:{},firstSeenAt:`2025-03-0${n}T12:00:00Z`,payloadChangedAt:null,filing:{formType:'10-K',url:filing.url,documentUrl:null,citation:'edgar'},read:true} satisfies InboxRowDto))} satisfies InboxResponse;
const directoryRow={issuerId:US,market:'US',names:{zh:'夹具公司',en:'Fixture Corp'},primaryTicker:'FIXT',tickers:['FIXT'],latestPeriodEnd:'2024-12-31',latestAvailableDate:'2025-03-01',conceptsCovered:1,citationSummary:{linked:0,pending:0,edgar:1},scopeLastSuccessAt:'2025-03-01T00:00:00Z',scopeLastStatus:'success'} satisfies DirectoryRow;
export const directory={total:1,conceptsTotal:1,rows:[directoryRow]} satisfies {total:number;conceptsTotal:number;rows:DirectoryRow[]};
