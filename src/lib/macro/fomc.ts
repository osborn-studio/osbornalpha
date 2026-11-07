// src/lib/macro/fomc.ts
// FOMC meeting calendar (spec §6.1 'calendar' events, kept separate from derived decisions). Holds the parser for
// the official federalreserve.gov calendar page and the committed calendar JSON. Each year entry carries the
// source URL, retrieval time and the SHA-256 of the exact page bytes. Those bytes are committed under
// src/lib/macro/fixtures/fomc/<sha256>.html (no DB, no bucket) and re-verified by fomc.test.ts.
import calendar from './data/fomc-meetings.json';
export const FOMC_SOURCE_URL='https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
export interface FomcMeeting{start:string;end:string}
export interface FomcYear{year:number;meetings:FomcMeeting[];source_url:string;retrieved_at:string;sha256:string}
export interface CalendarEvent{kind:'fomc_meeting';region:'US';start:string;end:string;source:'calendar';source_url:string;sha256:string}
export const FOMC_CALENDAR:readonly FomcYear[]=calendar as unknown as FomcYear[];
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const pad=(n:number)=>String(n).padStart(2,'0');
function monthOf(label:string):number{
 const t=label.trim();const i=MONTHS.findIndex(m=>m===t||m.slice(0,3)===t);
 if(i<0)throw new Error(`fomc_parse:month:${label}`);
 return i+1;
}
/** Every "<year> FOMC Meetings" panel, ascending. Notation votes (one unscheduled day) are not meetings and are skipped;
 *  any other unknown date shape throws so the recorder fails loudly instead of guessing. */
export function parseFomcCalendar(html:string):{year:number;meetings:FomcMeeting[]}[]{
 const heads=[...html.matchAll(/<h4><a id="\d+">(\d{4}) FOMC Meetings<\/a><\/h4>/g)];
 if(!heads.length)throw new Error('fomc_parse:no_year_panels');
 return heads.map((h,i)=>{
  const seg=html.slice(h.index!,i+1<heads.length?heads[i+1].index!:html.length);
  const year=Number(h[1]);const meetings:FomcMeeting[]=[];
  for(const m of seg.matchAll(/fomc-meeting__month[^"]*"><strong>([^<]+)<\/strong><\/div>\s*<div class="fomc-meeting__date[^"]*">([^<]+)<\/div>/g)){
   const date=m[2].trim().replace(/\*$/,'');
   if(/notation vote/i.test(date))continue;
   const dm=/^(\d{1,2})-(\d{1,2})$/.exec(date);
   if(!dm)throw new Error(`fomc_parse:date:${year}:${m[2].trim()}`);
   const months=m[1].split('/').map(monthOf);
   meetings.push({start:`${year}-${pad(months[0])}-${pad(Number(dm[1]))}`,end:`${year}-${pad(months[months.length-1])}-${pad(Number(dm[2]))}`});
  }
  return {year,meetings};
 }).sort((a,b)=>a.year-b.year);
}
export function fomcCalendarEvents():CalendarEvent[]{
 return FOMC_CALENDAR.flatMap(y=>y.meetings.map(m=>({kind:'fomc_meeting' as const,region:'US' as const,start:m.start,end:m.end,source:'calendar' as const,source_url:y.source_url,sha256:y.sha256})))
  .sort((a,b)=>a.start.localeCompare(b.start));
}
