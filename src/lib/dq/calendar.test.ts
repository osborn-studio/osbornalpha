// src/lib/dq/calendar.test.ts
import {describe,expect,it} from 'vitest';
import {SEC_HOLIDAYS,addMonthsAnchored,applicableCategory,computeExpectations,estimatePeriodEnd,filingsWindowStart,fiscalYearOfPeriodEnd,isSecBusinessDay,nearestMonthEnd,rollForward} from './calendar';
import type {CalendarUpstream,ExpectationRow,FilerCategoryRow,FilingProfile} from './calendar';
import type {CalendarFiling} from '../facts/types';

const ISSUER='00000000-0000-4000-8000-0000000000c1';
const profile=(p:Partial<FilingProfile>={}):FilingProfile=>({issuer_id:ISSUER,market:'US',category_raw_current:'Large accelerated filer',regime:'10-K',fiscal_year_end:'1231',week52_pattern:false,source:'sec_submissions',source_sha256:'s'.repeat(64),as_of:'2026-11-01',...p});
const cat=(fy:number,acceleration:FilerCategoryRow['acceleration']):FilerCategoryRow=>({issuer_id:ISSUER,fiscal_year:fy,acceleration,smaller_reporting:null,category_raw:acceleration,source:'ixbrl_dei',accession:`0000000000-${fy}-000001`,evidence_sha256:'e'.repeat(64),as_of:'2026-11-01'});
let n=0;
// complete C4 CalendarFiling (FilingRow incl. acceptance_source) before the override spread (plan audit P9)
const filing=(form:CalendarFiling['form_type'],periodEnd:string,available:string,p:Partial<CalendarFiling>={}):CalendarFiling=>({filing_id:`10000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,issuer_id:ISSUER,market:'US',source:'edgar',origin:'sec',form_type:form,fiscal_year:null,fiscal_period:null,period_end:periodEnd,available_date:available,source_ref:`acc-${n}`,url:null,document_ref:null,document_url:null,link_attempts:0,mapping_gen:1,run_id:'r',created_at:`${available}T00:00:00Z`,run_status:'published',accepted_at:null,acceptance_source:null,...p});
const OK:CalendarUpstream={lookup:'ok',us:[]};
const run=(o:{profile?:Partial<FilingProfile>;categories?:FilerCategoryRow[];filings?:CalendarFiling[];upstream?:CalendarUpstream;today?:string})=>
 computeExpectations({profile:profile(o.profile),categories:o.categories??[cat(2024,'accelerated'),cat(2025,'large_accelerated')],filings:o.filings??[],upstream:o.upstream??OK,today:o.today??'2026-11-05'});
const at=(rows:ExpectationRow[],periodEnd:string)=>{const r=rows.find(x=>x.period_end===periodEnd);if(!r)throw new Error(`no row ${periodEnd}: ${rows.map(x=>x.period_end).join(',')}`);return r;};

describe('Rule 0-3 roll-forward',()=>{
 it.each([
  ['2026-03-01','2026-03-02','Sunday → Monday'],
  ['2026-02-28','2026-03-02','Saturday → Monday'],
  ['2025-11-27','2025-11-28','Thanksgiving → Friday'],
  ['2026-07-03','2026-07-06','observed Independence Day (Fri) + weekend → Monday'],
  ['2025-12-24','2025-12-29','EDGAR closures 12-24 and 12-26 around Christmas → Monday'],
  ['2024-12-24','2024-12-26','EDGAR closure + Christmas → Thursday'],
  ['2025-01-09','2025-01-10','national day of mourning closure → Friday'],
  ['2027-12-31','2028-01-03','observed New Year 2028 on 2027-12-31 → next year (needs 2028 table)'],
  ['2026-03-16','2026-03-16','business day unchanged'],
 ])('%s → %s (%s)',(d,want)=>{
  if(want.startsWith('2028'))expect(()=>rollForward(d)).toThrow('holiday_table_missing:2028');
  else expect(rollForward(d)).toBe(want);
 });
 it('covers 2024–2027 with 11 federal holidays each (12 in 2027 with the observed New Year 2028) and refuses other years',()=>{
  expect(Object.keys(SEC_HOLIDAYS)).toEqual(['2024','2025','2026','2027']);
  expect([2024,2025,2026].map(y=>SEC_HOLIDAYS[y].length)).toEqual([11,11,11]);
  expect(SEC_HOLIDAYS[2027]).toHaveLength(12);
  for(const y of [2024,2025,2026,2027])for(const d of SEC_HOLIDAYS[y]){expect(d.startsWith(String(y))).toBe(true);expect(isSecBusinessDay(d)).toBe(false);}
  expect(()=>isSecBusinessDay('2023-12-29')).toThrow('holiday_table_missing:2023');
 });
});

describe('date helpers',()=>{
 it('nearest month end, anchored months and fiscal-year labels',()=>{
  expect(nearestMonthEnd('2025-09-27')).toBe('2025-09-30');
  expect(nearestMonthEnd('2025-10-02')).toBe('2025-09-30');
  expect(nearestMonthEnd('2025-01-02')).toBe('2024-12-31');
  expect(addMonthsAnchored('2025-12-31',4)).toBe('2026-04-30');
  expect(addMonthsAnchored('2025-06-30',4)).toBe('2025-10-31');
  expect(addMonthsAnchored('2025-09-27',4)).toBe('2026-01-27');
  expect(addMonthsAnchored('2025-10-31',4)).toBe('2026-02-28');
  expect(fiscalYearOfPeriodEnd('2025-01-02')).toBe(2024);
  expect(fiscalYearOfPeriodEnd('2025-09-27')).toBe(2025);
 });
 it('applies the FY N−1 cover category to fiscal year N and nothing else',()=>{
  const cs=[cat(2024,'accelerated'),cat(2025,'large_accelerated')];
  expect(applicableCategory(cs,2026)?.acceleration).toBe('large_accelerated');
  expect(applicableCategory(cs,2025)?.acceleration).toBe('accelerated');
  expect(applicableCategory(cs,2024)).toBeNull();
 });
});

describe('deadline table (10-K regime, FYE 12-31, today 2026-11-05)',()=>{
 const rows=run({});
 it('expects the 6 most recent ended quarter periods, newest first, 10-K at the fiscal year end',()=>{
  expect(rows.map(r=>[r.period_end,r.report_kind])).toEqual([['2026-09-30','10-Q'],['2026-06-30','10-Q'],['2026-03-31','10-Q'],['2025-12-31','10-K'],['2025-09-30','10-Q'],['2025-06-30','10-Q']]);
 });
 it.each([
  ['2026-09-30','2026-11-09','us.laf/1','FY2026 uses the FY2025 cover (large accelerated): +40 = Mon 11-09'],
  ['2026-06-30','2026-08-10','us.laf/1','+40 = Sun 08-09 → Mon 08-10'],
  ['2026-03-31','2026-05-11','us.laf/1','+40 = Sun 05-10 → Mon 05-11'],
  ['2025-12-31','2026-03-16','us.acc/1','the FY2025 10-K uses the FY2024 cover (accelerated): +75 = Mon 03-16'],
  ['2025-09-30','2025-11-10','us.acc/1','+40 = Sun 11-09 → Mon 11-10'],
  ['2025-06-30','2025-08-11','us.acc/1','+40 = Sat 08-09 → Mon 08-11'],
 ])('%s due %s by %s (%s)',(pe,due,rule)=>{
  const r=at(rows,pe);
  expect(r).toMatchObject({deadline_state:'statutory',due_date:due,due_rule:rule,period_end_estimated:false});
 });
 it('large accelerated 10-K is +60 rolled past a Sunday; non-accelerated is +90 / +45',()=>{
  const laf=run({categories:[cat(2024,'large_accelerated'),cat(2025,'large_accelerated')]});
  expect(at(laf,'2025-12-31')).toMatchObject({due_date:'2026-03-02',due_rule:'us.laf/1'});
  const non=run({categories:[cat(2024,'non_accelerated'),cat(2025,'non_accelerated')]});
  expect(at(non,'2025-12-31')).toMatchObject({due_date:'2026-03-31',due_rule:'us.non/1'});
  expect(at(non,'2026-09-30')).toMatchObject({due_date:'2026-11-16',due_rule:'us.non/1'});   // +45 = Sat 11-14 → Mon 11-16
 });
 it('a fiscal year without an FY N−1 cover category has no rule and no due date',()=>{
  const r=run({categories:[cat(2025,'large_accelerated')]});
  expect(at(r,'2025-12-31')).toMatchObject({deadline_state:'no_rule',due_date:null,due_rule:'none.no_category_for_fy/1',disclosure_state:'pending'});
  expect(at(r,'2025-12-31').detail).toMatchObject({no_category:true,fiscal_year:2025});
  expect(at(r,'2026-09-30').deadline_state).toBe('statutory');
 });
 it('20-F: six ended annual periods (annual-only slots a year apart, plan audit P6), due 4 months later; years without a holiday table are no_rule; no quarterly rows',()=>{
  const r=run({profile:{regime:'20-F'}});
  expect(r.map(x=>[x.report_kind,x.period_end,x.due_date,x.due_rule])).toEqual([
   ['20-F','2025-12-31','2026-04-30','us.20f/1'],['20-F','2024-12-31','2025-04-30','us.20f/1'],['20-F','2023-12-31','2024-04-30','us.20f/1'],
   ['20-F','2022-12-31',null,'none.holiday_table_missing/1'],['20-F','2021-12-31',null,'none.holiday_table_missing/1'],['20-F','2020-12-31',null,'none.holiday_table_missing/1']]);
  expect(r[3].detail).toMatchObject({holiday_year:2023});
 });
 it('40-F: six ended annual periods, no rule, and can still be received (plan audit P6)',()=>{
  const f=filing('40-F','2025-12-31','2026-03-20');
  const r=run({profile:{regime:'40-F'},filings:[f]});
  expect(r).toHaveLength(6);
  expect(r.map(x=>[x.report_kind,x.period_end,x.deadline_state,x.disclosure_state])).toEqual(['2025','2024','2023','2022','2021','2020'].map((y,i)=>['40-F',`${y}-12-31`,'no_rule',i===0?'received':'pending']));
  expect(r[0]).toMatchObject({deadline_state:'no_rule',due_rule:'none.40f/1',due_date:null,disclosure_state:'received',received_filing_id:f.filing_id,received_date:'2026-03-20'});
 });
 it('filingsWindowStart covers the oldest annual slot, its match window and one year of 52/53-week basis (plan audit P6)',()=>{
  expect(filingsWindowStart('2026-11-05')).toBe('2017-11-23');   // month end 108 months back (2017-11-30) − 7 days
  const oldest=run({profile:{regime:'20-F'}}).at(-1)!.period_end;
  expect(filingsWindowStart('2026-11-05')<oldest).toBe(true);
 });
 it('no fiscal_year_end → no rows',()=>{expect(run({profile:{fiscal_year_end:null}})).toEqual([]);});
 it('a fiscal year end that differs from the latest received 10-K: anchor on the 10-K and flag fye_mismatch',()=>{
  const r=run({profile:{fiscal_year_end:'1231'},filings:[filing('10-K','2025-09-30','2025-11-20')]});
  expect(r.map(x=>[x.period_end,x.report_kind])).toEqual([['2026-09-30','10-K'],['2026-06-30','10-Q'],['2026-03-31','10-Q'],['2025-12-31','10-Q'],['2025-09-30','10-K'],['2025-06-30','10-Q']]);
  expect(r.every(x=>x.detail.fye_mismatch===true)).toBe(true);
 });
});

describe('status matrix',()=>{
 const today='2026-11-05';
 it('received on time, received late, and amendments / staged / inactive generations never count',()=>{
  const onTime=filing('10-Q','2026-06-30','2026-08-03');
  const late=filing('10-Q','2026-03-31','2026-05-20');
  const amended=filing('10-Q/A','2025-09-30','2025-11-01');
  const staged=filing('10-Q','2025-06-30','2025-08-01',{run_status:'staged'});
  const gen0=filing('10-K','2025-12-31','2026-02-20',{mapping_gen:0});
  const r=run({filings:[onTime,late,amended,staged,gen0],today});
  expect(at(r,'2026-06-30')).toMatchObject({disclosure_state:'received',received_filing_id:onTime.filing_id,received_date:'2026-08-03'});
  expect(at(r,'2026-03-31')).toMatchObject({disclosure_state:'received_late',received_date:'2026-05-20'});
  expect(at(r,'2025-09-30')).toMatchObject({disclosure_state:'overdue',received_filing_id:null});
  expect(at(r,'2025-06-30')).toMatchObject({disclosure_state:'overdue',received_filing_id:null});
  expect(at(r,'2025-12-31')).toMatchObject({disclosure_state:'overdue',received_filing_id:null});
 });
 it('the first disclosure wins when two filings report the same period',()=>{
  const a=filing('10-Q','2026-06-30','2026-08-05'),b=filing('10-Q','2026-06-30','2026-08-01');
  expect(at(run({filings:[a,b]}),'2026-06-30').received_filing_id).toBe(b.filing_id);
 });
 it('filed upstream but not ingested (reportDate within ±7 days, exact form) beats overdue',()=>{
  const up:CalendarUpstream={lookup:'ok',us:[{form:'10-Q',reportDate:'2026-06-30',filingDate:'2026-08-04',accessionNumber:'0000000001-26-000010'},{form:'10-Q/A',reportDate:'2026-03-31',filingDate:'2026-05-01',accessionNumber:'x'}]};
  const r=run({upstream:up});
  expect(at(r,'2026-06-30')).toMatchObject({disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-08-04',upstream_lookup:'ok'});
  expect(at(r,'2026-06-30').detail.upstream_accession).toBe('0000000001-26-000010');
  expect(at(r,'2026-03-31').disclosure_state).toBe('overdue');
 });
 it('pending before the due date, overdue after it; unknown_upstream when the lookup is unavailable, never overdue',()=>{
  const r=run({});
  expect(at(r,'2026-09-30')).toMatchObject({disclosure_state:'pending',due_date:'2026-11-09'});
  expect(at(r,'2026-06-30').disclosure_state).toBe('overdue');
  const u=run({upstream:{lookup:'unavailable'}});
  expect(u.every(x=>x.disclosure_state==='unknown_upstream'&&x.upstream_lookup==='unavailable')).toBe(true);
  const f=filing('10-Q','2026-06-30','2026-08-03');
  expect(at(run({upstream:{lookup:'unavailable'},filings:[f]}),'2026-06-30')).toMatchObject({disclosure_state:'received',upstream_lookup:'unavailable'});
 });
 it('a no_rule row past any date stays pending',()=>{
  const r=run({categories:[]});
  expect(r.every(x=>x.deadline_state==='no_rule'&&x.disclosure_state==='pending'&&x.due_date===null)).toBe(true);
 });
 it('rows carry the profile as_of and the rules version',()=>{
  const r=run({});
  expect(r.every(x=>x.profile_as_of==='2026-11-01'&&x.detail.rules_version==='filing-calendar/1'&&x.market==='US'&&x.issuer_id===ISSUER)).toBe(true);
 });
 it('a due date in a year without a holiday table becomes no_rule (no guessed date)',()=>{
  const r=run({today:'2027-12-01',categories:[cat(2026,'non_accelerated'),cat(2027,'non_accelerated')]});
  expect(at(r,'2027-09-30')).toMatchObject({deadline_state:'statutory',due_date:'2027-11-15'});   // +45 = Sun 11-14 → Mon 11-15
  const late=run({today:'2028-02-15',categories:[cat(2026,'non_accelerated'),cat(2027,'non_accelerated')]});
  expect(at(late,'2027-12-31')).toMatchObject({deadline_state:'no_rule',due_rule:'none.holiday_table_missing/1',due_date:null});
  expect(at(late,'2027-12-31').detail.holiday_year).toBe(2028);
 });
});

describe('52/53-week filers',()=>{
 const wk=(p:Partial<FilingProfile>={})=>({fiscal_year_end:'0927',week52_pattern:true,...p});
 const history=[filing('10-K','2025-09-27','2025-10-31'),filing('10-Q','2025-06-28','2025-08-01'),filing('10-Q','2025-03-29','2025-05-02'),filing('10-Q','2024-12-28','2025-01-31')];
 it('estimates unreceived periods from the latest actual of the same position (+364), marks them estimated, never overdue',()=>{
  const r=run({profile:wk(),filings:history,categories:[cat(2024,'large_accelerated'),cat(2025,'large_accelerated')]});
  expect(r.map(x=>[x.period_end,x.report_kind,x.period_end_estimated])).toEqual([
   ['2026-09-26','10-K',true],['2026-06-27','10-Q',true],['2026-03-28','10-Q',true],['2025-12-27','10-Q',true],['2025-09-27','10-K',false],['2025-06-28','10-Q',false]]);
  const est=at(r,'2026-06-27');
  expect(est).toMatchObject({deadline_state:'estimated',due_rule:'us.laf/1/est',due_date:'2026-08-06',disclosure_state:'pending'});
  expect(est.detail).toMatchObject({estimated_due_passed:true,estimate_basis:{source:'filing',from:'2025-06-28'}});
  expect(r.some(x=>x.disclosure_state==='overdue')).toBe(false);
  expect(at(r,'2025-09-27')).toMatchObject({deadline_state:'statutory',disclosure_state:'received'});
 });
 it('a received filing within ±7 days of the estimate replaces it with the actual period end',()=>{
  const actual=filing('10-Q','2026-06-27','2026-07-31');
  const r=run({profile:wk(),filings:[...history,actual],categories:[cat(2024,'large_accelerated'),cat(2025,'large_accelerated')]});
  expect(at(r,'2026-06-27')).toMatchObject({period_end_estimated:false,deadline_state:'statutory',due_rule:'us.laf/1',disclosure_state:'received',received_filing_id:actual.filing_id});
  const off=filing('10-Q','2026-07-06','2026-08-01');   // 9 days off the estimate: not this period
  expect(at(run({profile:wk(),filings:[...history,off]}),'2026-06-27').period_end_estimated).toBe(true);
 });
 it('+364 per missing year, +7 when the step leaves the anchor month; no observation → the month end',()=>{
  expect(estimatePeriodEnd('2023-09-30',[{date:'2022-09-24',source:'filing'}])).toEqual({periodEnd:'2023-09-23',basis:{source:'filing',from:'2022-09-24'}});
  expect(estimatePeriodEnd('2026-09-30',[{date:'2024-09-28',source:'filing'}]).periodEnd).toBe('2026-09-26');
  expect(estimatePeriodEnd('2025-01-31',[{date:'2024-02-03',source:'filing'}]).periodEnd).toBe('2025-02-08');
  expect(estimatePeriodEnd('2026-03-31',[])).toEqual({periodEnd:'2026-03-31',basis:{source:'month_end'}});
 });
 it('uses SEC submissions reportDate as an estimation basis when no filing is stored',()=>{
  const up:CalendarUpstream={lookup:'ok',us:[{form:'10-Q',reportDate:'2025-06-28',filingDate:'2025-08-01',accessionNumber:'a1'}]};
  const r=run({profile:wk(),upstream:up});
  expect(at(r,'2026-06-27').detail.estimate_basis).toEqual({source:'sec_submissions',from:'2025-06-28'});
  expect(at(r,'2025-06-30')).toMatchObject({disclosure_state:'filed_not_ingested',period_end_estimated:true,upstream_filed_date:'2025-08-01'});   // no earlier June observation: month-end estimate, upstream entry within ±7 days
 });
});

describe('CN statutory nodes',()=>{
 const cn=(o:{filings?:CalendarFiling[];upstream?:CalendarUpstream;today?:string}={})=>computeExpectations({profile:profile({market:'CN',regime:'cn',fiscal_year_end:'1231',category_raw_current:null,source:'cn_statutory',source_sha256:null}),categories:[],filings:o.filings??[],upstream:o.upstream??{lookup:'ok',cn:[]},today:o.today??'2026-11-05'});
 it('annual by 04-30 of the next year, Q1 04-30, H1 08-31, Q3 10-31, never rolled forward',()=>{
  expect(cn().map(r=>[r.period_end,r.report_kind,r.due_date,r.due_rule])).toEqual([
   ['2026-09-30','q3','2026-10-31','cn.q3/1'],['2026-06-30','semiannual','2026-08-31','cn.semiannual/1'],['2026-03-31','q1','2026-04-30','cn.q1/1'],
   ['2025-12-31','annual','2026-04-30','cn.annual/1'],['2025-09-30','q3','2025-10-31','cn.q3/1'],['2025-06-30','semiannual','2025-08-31','cn.semiannual/1']]);
 });
 it('expected_date from the latest-announced schedule row of the same end_date; actual_date → filed_not_ingested; modify_date flagged',()=>{
  const up:CalendarUpstream={lookup:'ok',cn:[
   {end_date:'2026-09-30',ann_date:'2026-07-01',pre_date:'2026-10-20',actual_date:null,modify_date:null},
   {end_date:'2026-09-30',ann_date:'2026-09-01',pre_date:'2026-10-28',actual_date:'2026-10-28',modify_date:'2026-09-01'},
   {end_date:'2026-06-30',ann_date:'2026-05-01',pre_date:'2026-08-25',actual_date:null,modify_date:null}]};
  const r=cn({upstream:up});
  expect(at(r,'2026-09-30')).toMatchObject({expected_date:'2026-10-28',disclosure_state:'filed_not_ingested',upstream_filed_date:'2026-10-28'});
  expect(at(r,'2026-09-30').detail.schedule_modified).toBe(true);
  expect(at(r,'2026-06-30')).toMatchObject({expected_date:'2026-08-25',disclosure_state:'overdue'});
 });
 it('without the disclosure_date lookup every unreceived CN row is unknown_upstream, received rows stay received',()=>{
  const f=filing('annual','2025-12-31','2026-03-28',{market:'CN',source:'tushare',origin:'sse'});
  const r=cn({upstream:{lookup:'unavailable'},filings:[f]});
  expect(at(r,'2025-12-31')).toMatchObject({disclosure_state:'received',expected_date:null});
  expect(r.filter(x=>x.period_end!=='2025-12-31').every(x=>x.disclosure_state==='unknown_upstream')).toBe(true);
 });
 it('acceptance case: the 2025 annual not ingested on 2026-05-01',()=>{
  const sched=(actual:string|null):CalendarUpstream=>({lookup:'ok',cn:[{end_date:'2025-12-31',ann_date:'2025-12-20',pre_date:'2026-04-25',actual_date:actual,modify_date:null}]});
  expect(at(cn({upstream:sched('2026-04-25'),today:'2026-05-01'}),'2025-12-31').disclosure_state).toBe('filed_not_ingested');
  expect(at(cn({upstream:sched(null),today:'2026-05-01'}),'2025-12-31').disclosure_state).toBe('overdue');
  expect(at(cn({upstream:{lookup:'unavailable'},today:'2026-05-01'}),'2025-12-31').disclosure_state).toBe('unknown_upstream');
 });
});
