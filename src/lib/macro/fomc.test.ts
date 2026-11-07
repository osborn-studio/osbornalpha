// FOMC calendar evidence (spec §6.1): every year entry is backed by committed page bytes that re-hash and re-parse.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {FOMC_SOURCE_URL,FOMC_VERSIONS,fomcCalendarEvents,parseFomcCalendar,type FomcVersion} from './fomc';
const FIX=join(process.cwd(),'src/lib/macro/fixtures/fomc');
describe('FOMC calendar',()=>{
 it('every committed version is backed by the committed page bytes',()=>{
  expect(FOMC_VERSIONS.length).toBeGreaterThan(0);
  for(const v of FOMC_VERSIONS){
   expect(v.source_url).toBe(FOMC_SOURCE_URL);
   expect(Number.isFinite(Date.parse(v.retrieved_at))).toBe(true);
   const bytes=readFileSync(join(FIX,`${v.sha256}.html`));
   expect(createHash('sha256').update(bytes).digest('hex')).toBe(v.sha256);
   const parsed=parseFomcCalendar(bytes.toString('utf8'));
   expect(Object.fromEntries(parsed.map(p=>[String(p.year),p.meetings]))).toEqual(v.years);
  }
  const times=FOMC_VERSIONS.map(v=>Date.parse(v.retrieved_at));
  expect([...times].sort((a,b)=>a-b)).toEqual(times);
 });
 it('the real page yields the 2024 Apr/May cross-month meeting',()=>{
  expect(FOMC_VERSIONS[0].years['2024']).toContainEqual({start:'2024-04-30',end:'2024-05-01'});
 });
 it('the real page: wrapping one meeting date in a span throws instead of dropping the meeting',()=>{
  const html=readFileSync(join(FIX,`${FOMC_VERSIONS[0].sha256}.html`),'utf8');
  expect(()=>parseFomcCalendar(html)).not.toThrow();
  const m=/(<div class="fomc-meeting__date[^"]*">)(\d{1,2}-\d{1,2}\*?)(<\/div>)/.exec(html)!;
  const broken=html.replace(m[0],`${m[1]}<span>${m[2]}</span>${m[3]}`);
  expect(()=>parseFomcCalendar(broken)).toThrow(/fomc_parse_incomplete/);
 });
 it('a December/January meeting ends in the next year',()=>{
  const html='<h4><a id="1">2026 FOMC Meetings</a></h4> <div class="fomc-meeting__month a"><strong>Dec/Jan</strong></div> <div class="fomc-meeting__date a">30-2</div>';
  expect(parseFomcCalendar(html)).toEqual([{year:2026,meetings:[{start:'2026-12-30',end:'2027-01-02'}]}]);
 });
 it('calendar versions: none before the first retrieval, the latest at or before asOf after it',()=>{
  const v1:FomcVersion={retrieved_at:'2026-01-01T00:00:00.000Z',sha256:'a'.repeat(64),source_url:FOMC_SOURCE_URL,years:{'2026':[{start:'2026-01-27',end:'2026-01-28'}]}};
  const v2:FomcVersion={...v1,retrieved_at:'2026-06-01T00:00:00.000Z',sha256:'b'.repeat(64),years:{'2026':[{start:'2026-01-27',end:'2026-01-28'},{start:'2026-03-17',end:'2026-03-18'}]}};
  expect(fomcCalendarEvents('2025-12-31T23:59:59.000Z',[v1,v2])).toEqual([]);
  expect(fomcCalendarEvents('2026-03-01T00:00:00.000Z',[v1,v2]).map(e=>[e.start,e.retrieved_at])).toEqual([['2026-01-27',v1.retrieved_at]]);
  expect(fomcCalendarEvents('2026-06-01T00:00:00.000Z',[v1,v2]).map(e=>[e.start,e.retrieved_at])).toEqual([['2026-01-27',v2.retrieved_at],['2026-03-17',v2.retrieved_at]]);
  expect(fomcCalendarEvents(undefined,[v1,v2])).toHaveLength(2);
  const first=Date.parse(FOMC_VERSIONS[0].retrieved_at);
  expect(fomcCalendarEvents(new Date(first-1).toISOString())).toEqual([]);
  expect(fomcCalendarEvents(new Date(first).toISOString()).every(e=>e.retrieved_at===FOMC_VERSIONS[0].retrieved_at)).toBe(true);
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
  expect(e.every(x=>x.kind==='fomc_meeting'&&x.source==='calendar'&&/^[0-9a-f]{64}$/.test(x.sha256)&&Number.isFinite(Date.parse(x.retrieved_at)))).toBe(true);
  expect([...e].sort((a,b)=>a.start.localeCompare(b.start))).toEqual(e);
 });
});
