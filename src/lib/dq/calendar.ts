// src/lib/dq/calendar.ts
// Filing-calendar rules (spec §6.1, plan 3 C7; CALENDAR_RULES_VERSION 'filing-calendar/1'). Pure:
// profile + per-fiscal-year filer categories + calendar filings + upstream list + today → one
// expectation row per expected report period. deadline_state (is the due date known?) and
// disclosure_state (was it received / filed upstream?) are orthogonal. Missing stays missing:
// no category for FY N−1 → no_rule; an estimated (52/53-week) period end never counts as overdue;
// an unavailable upstream lookup gives unknown_upstream, never overdue.
// Dates are ISO 'YYYY-MM-DD' strings, compared as text, computed in UTC.
import type {CalendarFiling,Market} from '../facts/types';

export const CALENDAR_RULES_VERSION='filing-calendar/1';
export type ReportKind='10-K'|'10-Q'|'20-F'|'40-F'|'annual'|'semiannual'|'q1'|'q3';
export type DeadlineState='statutory'|'estimated'|'no_rule';
export type DisclosureState='pending'|'overdue'|'filed_not_ingested'|'received'|'received_late'|'unknown_upstream';
export type Acceleration='large_accelerated'|'accelerated'|'non_accelerated';
export interface FilingProfile{issuer_id:string;market:Market;category_raw_current:string|null;regime:'10-K'|'20-F'|'40-F'|'cn';fiscal_year_end:string|null;week52_pattern:boolean;source:string;source_sha256:string|null;as_of:string}
export interface FilerCategoryRow{issuer_id:string;fiscal_year:number;acceleration:Acceleration;smaller_reporting:boolean|null;category_raw:string;source:'ixbrl_dei';accession:string;evidence_sha256:string;as_of:string}
export interface UsUpstreamEntry{form:string;reportDate:string|null;filingDate:string;accessionNumber:string}
/** Dates ISO (calendar-sync converts Tushare YYYYMMDD with ymd()). */
export interface CnScheduleRow{end_date:string;ann_date:string|null;pre_date:string|null;actual_date:string|null;modify_date:string|null}
export interface CalendarUpstream{lookup:'ok'|'unavailable'|'not_applicable';us?:UsUpstreamEntry[];cn?:CnScheduleRow[];sha256?:string}
export interface ExpectationRow{issuer_id:string;market:Market;report_kind:ReportKind;period_end:string;period_end_estimated:boolean;deadline_state:DeadlineState;due_date:string|null;due_rule:string;expected_date:string|null;upstream_lookup:'ok'|'unavailable'|'not_applicable';upstream_filed_date:string|null;disclosure_state:DisclosureState;received_filing_id:string|null;received_date:string|null;profile_as_of:string|null;detail:Record<string,unknown>}

// ---------------------------------------------------------------- dates
const DAY=86_400_000;
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const toMs=(iso:string)=>{if(!ISO.test(iso))throw new Error(`invalid_date:${iso}`);return Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10));};
const fromMs=(ms:number)=>new Date(ms).toISOString().slice(0,10);
export const addDays=(iso:string,n:number)=>fromMs(toMs(iso)+n*DAY);
export const diffDays=(a:string,b:string)=>Math.round((toMs(a)-toMs(b))/DAY);
/** Last day of month m (1..12; values outside 1..12 roll over years). */
export const monthEnd=(y:number,m:number)=>fromMs(Date.UTC(y,m,0));
const ym=(iso:string)=>({y:+iso.slice(0,4),m:+iso.slice(5,7)});
export const isMonthEnd=(iso:string)=>{const {y,m}=ym(iso);return monthEnd(y,m)===iso;};
/** The month end closest to the date (52/53-week period ends fall within a week of one). */
export function nearestMonthEnd(iso:string):string{
 const {y,m}=ym(iso);const cur=monthEnd(y,m),prev=monthEnd(y,m-1);
 return Math.abs(diffDays(iso,prev))<Math.abs(diffDays(cur,iso))?prev:cur;
}
/** n months later; a month-end stays a month-end, any other day is clamped to the target month's length. */
export function addMonthsAnchored(iso:string,n:number):string{
 const {y,m}=ym(iso);
 if(isMonthEnd(iso))return monthEnd(y,m+n);
 const last=monthEnd(y,m+n);
 return +iso.slice(8,10)>+last.slice(8,10)?last:`${last.slice(0,8)}${iso.slice(8,10)}`;
}
/** Fiscal year label = calendar year of the month end nearest the fiscal-year-end date (shared with filer-categories). */
export const fiscalYearOfPeriodEnd=(periodEnd:string)=>+nearestMonthEnd(periodEnd).slice(0,4);
/** Rule 12b-2 applicability: periods of fiscal year N use the category from the FY N−1 10-K cover; none → null (no_rule). */
export const applicableCategory=(categories:readonly FilerCategoryRow[],fiscalYear:number):FilerCategoryRow|null=>categories.find(c=>c.fiscal_year===fiscalYear-1)??null;

// ---------------------------------------------------------------- Rule 0-3 roll-forward
/**
 * Federal holidays (5 U.S.C. 6103) as observed — OPM "Federal Holidays" schedule
 * (https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/, checked 2026-11-05).
 * 17 CFR 240.0-3(a): papers due on a Saturday, Sunday or holiday may be filed on the first
 * business day following. 2027-12-31 is the observed New Year's Day 2028 (Jan 1 2028 is a Saturday).
 * Maintained per year; a year without an entry throws (the row becomes no_rule, never a guessed date).
 */
export const SEC_HOLIDAYS:Readonly<Record<number,readonly string[]>>={
 2024:['2024-01-01','2024-01-15','2024-02-19','2024-05-27','2024-06-19','2024-07-04','2024-09-02','2024-10-14','2024-11-11','2024-11-28','2024-12-25'],
 2025:['2025-01-01','2025-01-20','2025-02-17','2025-05-26','2025-06-19','2025-07-04','2025-09-01','2025-10-13','2025-11-11','2025-11-27','2025-12-25'],
 2026:['2026-01-01','2026-01-19','2026-02-16','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-10-12','2026-11-11','2026-11-26','2026-12-25'],
 2027:['2027-01-01','2027-01-18','2027-02-15','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-10-11','2027-11-11','2027-11-25','2027-12-24','2027-12-31'],
};
/**
 * Additional days EDGAR was closed and the SEC announced filings due that day are timely on the next
 * operational business day: 2024-12-24 (sec.gov/newsroom/whats-new/edgar-closed-24-25-december-2024),
 * 2025-01-09 (national day of mourning), 2025-12-24 and 2025-12-26
 * (sec.gov/newsroom/whats-new/edgar-will-be-closed-december-24-2025-through-december-26-2025).
 */
export const SEC_CLOSURES:Readonly<Record<number,readonly string[]>>={2024:['2024-12-24'],2025:['2025-01-09','2025-12-24','2025-12-26'],2026:[],2027:[]};
export class HolidayTableMissing extends Error{constructor(public readonly year:number){super(`holiday_table_missing:${year}`);this.name='HolidayTableMissing';}}
export function isSecBusinessDay(iso:string):boolean{
 const dow=new Date(toMs(iso)).getUTCDay();
 if(dow===0||dow===6)return false;
 const y=+iso.slice(0,4);const h=SEC_HOLIDAYS[y];
 if(!h)throw new HolidayTableMissing(y);
 return !h.includes(iso)&&!(SEC_CLOSURES[y]??[]).includes(iso);
}
/** Rule 0-3: a due date on a weekend, holiday or closure moves to the next SEC business day. */
export function rollForward(iso:string):string{
 let d=iso;for(let i=0;i<15&&!isSecBusinessDay(d);i++)d=addDays(d,1);
 return d;
}

// ---------------------------------------------------------------- deadlines
const US_DAYS:Record<Acceleration,{annual:number;quarterly:number;rule:string}>={
 large_accelerated:{annual:60,quarterly:40,rule:'us.laf/1'},accelerated:{annual:75,quarterly:40,rule:'us.acc/1'},non_accelerated:{annual:90,quarterly:45,rule:'us.non/1'},
};
const CN_DUE:Record<'annual'|'q1'|'semiannual'|'q3',(y:number)=>string>={annual:y=>`${y+1}-04-30`,q1:y=>`${y}-04-30`,semiannual:y=>`${y}-08-31`,q3:y=>`${y}-10-31`};
interface Deadline{state:DeadlineState;due:string|null;rule:string;detail:Record<string,unknown>}
const noRule=(rule:string,detail:Record<string,unknown>={}):Deadline=>({state:'no_rule',due:null,rule,detail});
function statutory(rule:string,raw:string,roll:boolean,detail:Record<string,unknown>={}):Deadline{
 if(!roll)return {state:'statutory',due:raw,rule,detail};
 try{return {state:'statutory',due:rollForward(raw),rule,detail};}
 catch(e){if(e instanceof HolidayTableMissing)return noRule('none.holiday_table_missing/1',{...detail,holiday_year:e.year});throw e;}
}
function deadlineOf(regime:FilingProfile['regime'],kind:ReportKind,periodEnd:string,fiscalYear:number,categories:readonly FilerCategoryRow[]):Deadline{
 if(regime==='cn')return statutory(`cn.${kind}/1`,CN_DUE[kind as keyof typeof CN_DUE](+periodEnd.slice(0,4)),false);
 if(regime==='40-F')return noRule('none.40f/1');
 if(regime==='20-F')return statutory('us.20f/1',addMonthsAnchored(periodEnd,4),true);
 const cat=applicableCategory(categories,fiscalYear);
 if(!cat)return noRule('none.no_category_for_fy/1',{fiscal_year:fiscalYear,no_category:true});
 const d=US_DAYS[cat.acceleration];
 return statutory(d.rule,addDays(periodEnd,kind==='10-K'?d.annual:d.quarterly),true,{fiscal_year:fiscalYear,category_fiscal_year:cat.fiscal_year,acceleration:cat.acceleration});
}

// ---------------------------------------------------------------- periods
const ANNUAL:Record<FilingProfile['regime'],ReportKind>={'10-K':'10-K','20-F':'20-F','40-F':'40-F',cn:'annual'};
const CN_KIND:Record<number,ReportKind>={3:'q1',6:'semiannual',9:'q3',12:'annual'};
function kindOf(regime:FilingProfile['regime'],month:number,anchor:number):ReportKind|null{
 if(regime==='cn')return CN_KIND[month]??null;
 if(month===anchor)return ANNUAL[regime];
 return regime==='10-K'?'10-Q':null;
}
/** A filing counts as received only when its run is published and its mapping generation is active (> 0); amendments never match (form_type exact). */
const counts=(f:CalendarFiling,kind:ReportKind)=>f.form_type===kind&&f.run_status==='published'&&f.mapping_gen>0&&f.period_end!==null;
export const MATCH_DAYS=7;
export const PERIODS=6;
/** Slots generated before filtering: PERIODS ended ones plus the current slot and one whose 52/53-week end may still lie after today. */
const SLOT_COUNT=PERIODS+2;
/** Months between slots: 20-F / 40-F issuers file only the annual report, so their slots are a year apart (plan audit P6). */
const strideOf=(regime:FilingProfile['regime'])=>regime==='20-F'||regime==='40-F'?12:3;
/** Earliest period_end the rules can look at (the oldest slot at the widest stride, its ±7-day match window, and one year of 52/53-week estimation basis): calendar-sync passes it as filingsForCalendar fromPeriodEnd and as the submissions coverFrom. */
export function filingsWindowStart(today:string):string{const {y,m}=ym(today);return addDays(monthEnd(y,m-12*SLOT_COUNT-12),-MATCH_DAYS);}

interface Estimate{periodEnd:string;basis:Record<string,unknown>}
/** 52/53-week estimate for the slot ending in grid month-end `grid`: latest observed actual of the same position + 364 days per year (+7 when the result leaves the anchor month); no observation → the grid month end. */
export function estimatePeriodEnd(grid:string,observed:readonly {date:string;source:string}[]):Estimate{
 const month=ym(grid).m;
 const prior=observed.filter(o=>ym(nearestMonthEnd(o.date)).m===month&&nearestMonthEnd(o.date)<grid).sort((a,b)=>b.date.localeCompare(a.date))[0];
 if(!prior)return {periodEnd:grid,basis:{source:'month_end'}};
 let e=prior.date;
 for(let i=0;i<10&&nearestMonthEnd(e)<grid;i++){e=addDays(e,364);if(ym(e).m!==month)e=addDays(e,7);}
 if(nearestMonthEnd(e)!==grid)return {periodEnd:grid,basis:{source:'month_end',fallback_from:prior.date}};
 return {periodEnd:e,basis:{source:prior.source,from:prior.date}};
}

export function computeExpectations(input:{profile:FilingProfile;categories:FilerCategoryRow[];filings:CalendarFiling[];upstream:CalendarUpstream;today:string}):ExpectationRow[]{
 const {profile,categories,filings,upstream,today}=input;
 const regime=profile.regime;
 const fye=regime==='cn'?'1231':profile.fiscal_year_end;
 if(fye===null)return [];   // spec §8: no fiscal_year_end → no rows (calendar-sync counts no_fiscal_year_end)
 const week52=regime!=='cn'&&profile.week52_pattern;
 const base:Record<string,unknown>={rules_version:CALENDAR_RULES_VERSION};
 // Anchor month: the latest received annual report's actual period end wins over submissions fiscalYearEnd (§6.1).
 let anchor=+fye.slice(0,2);
 const latestAnnual=filings.filter(f=>counts(f,ANNUAL[regime])).sort((a,b)=>b.period_end!.localeCompare(a.period_end!))[0];
 if(latestAnnual&&regime!=='cn'){
  const pe=latestAnnual.period_end!;const m=ym(nearestMonthEnd(pe)).m;
  if(m!==anchor||(!week52&&pe.slice(5).replace('-','')!==fye))base.fye_mismatch=true;
  anchor=m;
 }
 const usEntries=upstream.lookup==='ok'?upstream.us??[]:[];
 const cnRows=upstream.lookup==='ok'?upstream.cn??[]:[];
 // slot grid, newest first: quarter months around the anchor, or the anchor month only for annual-only regimes
 const stride=strideOf(regime);
 const slots:{grid:string;month:number}[]=[];
 for(let {y,m}=ym(today),i=0;slots.length<SLOT_COUNT&&i<SLOT_COUNT*stride+12;i++,m--){
  if(m<1){m+=12;y--;}
  if(((m-anchor)%stride+stride)%stride===0)slots.push({grid:monthEnd(y,m),month:m});
 }
 const rows:ExpectationRow[]=[];
 const planned:{grid:string;month:number;kind:ReportKind|null;periodEnd:string;estimated:boolean;received:CalendarFiling|null;basis?:Record<string,unknown>}[]=[];
 for(const s of slots){
  const kind=kindOf(regime,s.month,anchor);
  if(!kind||!week52){
   const received=kind?earliest(filings.filter(f=>counts(f,kind)&&f.period_end===s.grid)):null;
   planned.push({...s,kind,periodEnd:s.grid,estimated:false,received});
   continue;
  }
  const observed=[...filings.filter(f=>counts(f,kind)).map(f=>({date:f.period_end!,source:'filing'})),...usEntries.filter(e=>e.form===kind&&e.reportDate).map(e=>({date:e.reportDate!,source:'sec_submissions'}))];
  const est=estimatePeriodEnd(s.grid,observed);
  const matches=filings.filter(f=>counts(f,kind)&&Math.abs(diffDays(f.period_end!,est.periodEnd))<=MATCH_DAYS);
  const received=earliest(matches);
  if(received)planned.push({...s,kind,periodEnd:received.period_end!,estimated:false,received,basis:{replaced_estimate:est.periodEnd}});
  else planned.push({...s,kind,periodEnd:est.periodEnd,estimated:true,received:null,basis:est.basis});
 }
 // applicable report kinds first, THEN the PERIODS limit (plan audit P6: a slot without a kind never takes a place)
 const ended=planned.filter(p=>p.kind!==null&&p.periodEnd<today).slice(0,PERIODS);
 for(const p of ended){
  if(!p.kind)continue;
  const monthsAhead=((anchor-p.month)%12+12)%12;
  const fiscalYear=+monthEnd(+p.grid.slice(0,4),p.month+monthsAhead).slice(0,4);
  let dl=deadlineOf(regime,p.kind,p.periodEnd,fiscalYear,categories);
  const detail:Record<string,unknown>={...base,...dl.detail};
  if(p.basis)detail[p.estimated?'estimate_basis':'estimate']=p.basis;
  if(p.estimated&&dl.state==='statutory')dl={...dl,state:'estimated',rule:`${dl.rule}/est`};
  let expected:string|null=null,upstreamFiled:string|null=null,state:DisclosureState;
  const cnRow=regime==='cn'?cnRows.filter(r=>r.end_date===p.periodEnd).sort((a,b)=>(b.ann_date??'').localeCompare(a.ann_date??''))[0]:undefined;
  if(cnRow){expected=cnRow.pre_date;if(cnRow.modify_date)detail.schedule_modified=true;}
  if(p.received){
   state=dl.due!==null&&p.received.available_date>dl.due?'received_late':'received';
  }else if(upstream.lookup==='unavailable'){
   state='unknown_upstream';
  }else{
   const up=regime==='cn'?(cnRow?.actual_date?{date:cnRow.actual_date,accession:null}:null)
    :earliestEntry(usEntries.filter(e=>e.form===p.kind&&e.reportDate!==null&&Math.abs(diffDays(e.reportDate,p.periodEnd))<=MATCH_DAYS));
   if(up){state='filed_not_ingested';upstreamFiled=up.date;if(up.accession)detail.upstream_accession=up.accession;}
   else if(dl.due!==null&&today>dl.due){
    if(dl.state==='statutory')state='overdue';
    else{state='pending';if(dl.state==='estimated')detail.estimated_due_passed=true;}
   }else state='pending';
  }
  rows.push({issuer_id:profile.issuer_id,market:profile.market,report_kind:p.kind,period_end:p.periodEnd,period_end_estimated:p.estimated,
   deadline_state:dl.state,due_date:dl.due,due_rule:dl.rule,expected_date:expected,upstream_lookup:upstream.lookup,upstream_filed_date:upstreamFiled,
   disclosure_state:state,received_filing_id:p.received?.filing_id??null,received_date:p.received?.available_date??null,profile_as_of:profile.as_of,detail});
 }
 return rows;
}
const earliest=(fs:CalendarFiling[])=>[...fs].sort((a,b)=>a.available_date.localeCompare(b.available_date)||a.filing_id.localeCompare(b.filing_id))[0]??null;
const earliestEntry=(es:UsUpstreamEntry[])=>{const e=[...es].sort((a,b)=>a.filingDate.localeCompare(b.filingDate))[0];return e?{date:e.filingDate,accession:e.accessionNumber}:null;};
