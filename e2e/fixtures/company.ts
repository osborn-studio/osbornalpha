// Synthetic layout payloads only. Keep contracts checked at construction, not cast at the route.
import type {StatementsResponse,FactSeriesResponse,OverviewResponse,MetricsResponse,FreshnessResponse,CompanyFilingsResponse,FactIdsResponse} from '../../src/lib/company/client';
import type {EvidenceDto,FactCell,FilingSummary} from '../../src/lib/company/types';
import type {EventsResponse,InboxResponse,WatchesResponse,WatchCard,InboxRowDto} from '../../src/lib/company/tracking-client';
import type {IssuerIndustriesView} from '../../src/lib/industry/read';
import type {JudgmentsListResponse,WireCard} from '../../src/components/judgments/api-types';
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
