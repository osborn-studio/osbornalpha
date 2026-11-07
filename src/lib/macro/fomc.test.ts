// FOMC calendar evidence (spec §6.1): every year entry is backed by committed page bytes that re-hash and re-parse.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {FOMC_CALENDAR,FOMC_SOURCE_URL,fomcCalendarEvents,parseFomcCalendar} from './fomc';
const FIX=join(process.cwd(),'src/lib/macro/fixtures/fomc');
describe('FOMC calendar',()=>{
 it('every committed year entry is backed by the committed page bytes',()=>{
  expect(FOMC_CALENDAR.length).toBeGreaterThan(0);
  for(const y of FOMC_CALENDAR){
   expect(y.source_url).toBe(FOMC_SOURCE_URL);
   expect(Number.isFinite(Date.parse(y.retrieved_at))).toBe(true);
   const bytes=readFileSync(join(FIX,`${y.sha256}.html`));
   expect(createHash('sha256').update(bytes).digest('hex')).toBe(y.sha256);
   expect(parseFomcCalendar(bytes.toString('utf8')).find(p=>p.year===y.year)?.meetings).toEqual(y.meetings);
  }
 });
 it('the real page yields the 2024 Apr/May cross-month meeting',()=>{
  expect(FOMC_CALENDAR.find(y=>y.year===2024)?.meetings).toContainEqual({start:'2024-04-30',end:'2024-05-01'});
 });
 it('parses cross-month meetings, strips SEP asterisks and skips notation votes',()=>{
  const html='<h4><a id="1">2024 FOMC Meetings</a></h4></div> <div class="row fomc-meeting" "> <div class="fomc-meeting__month col-xs-5"><strong>Apr/May</strong></div> <div class="fomc-meeting__date col-xs-4">30-1</div> <div class="fomc-meeting--shaded fomc-meeting__month col"><strong>June</strong></div> <div class="fomc-meeting__date col">11-12*</div> <h4><a id="2">2025 FOMC Meetings</a></h4> <div class="fomc-meeting__month c"><strong>August</strong></div> <div class="fomc-meeting__date c">22 (notation vote)</div>';
  expect(parseFomcCalendar(html)).toEqual([{year:2024,meetings:[{start:'2024-04-30',end:'2024-05-01'},{start:'2024-06-11',end:'2024-06-12'}]},{year:2025,meetings:[]}]);
 });
 it('throws on an unknown date shape or a page without year panels instead of guessing',()=>{
  expect(()=>parseFomcCalendar('<h4><a id="1">2020 FOMC Meetings</a></h4><div class="fomc-meeting__month x"><strong>March</strong></div> <div class="fomc-meeting__date x">15 (unscheduled)</div>')).toThrow(/fomc_parse:date/);
  expect(()=>parseFomcCalendar('<html></html>')).toThrow(/fomc_parse:no_year_panels/);
 });
 it('calendar events are labelled calendar and carry their evidence hash',()=>{
  const e=fomcCalendarEvents();
  expect(e.length).toBeGreaterThan(0);
  expect(e.every(x=>x.kind==='fomc_meeting'&&x.source==='calendar'&&/^[0-9a-f]{64}$/.test(x.sha256))).toBe(true);
  expect([...e].sort((a,b)=>a.start.localeCompare(b.start))).toEqual(e);
 });
});
