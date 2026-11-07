// src/lib/macro/fomc.ts
// FOMC meeting calendar (spec §6.1 'calendar' events, kept separate from derived decisions). Holds the parser for
// the official federalreserve.gov calendar page and the committed calendar JSON. The JSON is an append-only list of retrieval
// versions, each with source URL, retrieval time and the SHA-256 of the exact page bytes. Those bytes are committed under
// src/lib/macro/fixtures/fomc/<sha256>.html (no DB, no bucket) and re-verified by fomc.test.ts.
import calendar from './data/fomc-meetings.json';
export const FOMC_SOURCE_URL='https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
export interface FomcMeeting{start:string;end:string}
export interface FomcVersion{retrieved_at:string;sha256:string;source_url:string;years:Record<string,FomcMeeting[]>}
export interface CalendarEvent{kind:'fomc_meeting';region:'US';start:string;end:string;source:'calendar';source_url:string;sha256:string;retrieved_at:string}
export const FOMC_VERSIONS:readonly FomcVersion[]=calendar as unknown as FomcVersion[];
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const pad=(n:number)=>String(n).padStart(2,'0');
function monthOf(label:string):number{
 const t=label.trim();const i=MONTHS.findIndex(m=>m===t||m.slice(0,3)===t);
 if(i<0)throw new Error(`fomc_parse:month:${label}`);
 return i+1;
}
/** Every "<year> FOMC Meetings" panel, ascending. Meeting rows are counted independently from the row markup
 *  (month and date cells); each must parse or be an explicit notation vote, else `fomc_parse_incomplete`. Any other
 *  unknown date shape throws so the recorder fails loudly instead of guessing. A December/January meeting ends in
 *  the next year. */
export function parseFomcCalendar(html:string):{year:number;meetings:FomcMeeting[]}[]{
 const heads=[...html.matchAll(/<h4><a id="\d+">(\d{4}) FOMC Meetings<\/a><\/h4>/g)];
 if(!heads.length)throw new Error('fomc_parse:no_year_panels');
 return heads.map((h,i)=>{
  const seg=html.slice(h.index!,i+1<heads.length?heads[i+1].index!:html.length);
  const year=Number(h[1]);const meetings:FomcMeeting[]=[];let excluded=0;
  for(const m of seg.matchAll(/fomc-meeting__month[^"]*"><strong>([^<]+)<\/strong><\/div>\s*<div class="fomc-meeting__date[^"]*">([^<]+)<\/div>/g)){
   const date=m[2].trim().replace(/\*$/,'');
   if(/notation vote/i.test(date)){excluded++;continue;}
   const dm=/^(\d{1,2})-(\d{1,2})$/.exec(date);
   if(!dm)throw new Error(`fomc_parse:date:${year}:${m[2].trim()}`);
   const months=m[1].split('/').map(monthOf);
   const startMonth=months[0],endMonth=months[months.length-1];
   const endYear=endMonth<startMonth?year+1:year;
   meetings.push({start:`${year}-${pad(startMonth)}-${pad(Number(dm[1]))}`,end:`${endYear}-${pad(endMonth)}-${pad(Number(dm[2]))}`});
  }
  const rows=(seg.match(/fomc-meeting__month/g)??[]).length,dates=(seg.match(/fomc-meeting__date/g)??[]).length;
  if(rows!==dates||rows!==meetings.length+excluded)throw new Error(`fomc_parse_incomplete:${year}:rows=${rows}:dates=${dates}:parsed=${meetings.length}:excluded=${excluded}`);
  return {year,meetings};
 }).sort((a,b)=>a.year-b.year);
}
/** The latest retrieval version with retrieved_at <= asOf (no asOf = latest); none → null (empty calendar). */
export function fomcVersionAsOf(asOf?:string,versions:readonly FomcVersion[]=FOMC_VERSIONS):FomcVersion|null{
 const limit=asOf===undefined?Infinity:Date.parse(asOf);
 if(Number.isNaN(limit))throw new Error(`fomc_bad_asof:${asOf}`);
 let best:FomcVersion|null=null;
 for(const v of versions){
  const t=Date.parse(v.retrieved_at);
  if(t<=limit&&(!best||t>=Date.parse(best.retrieved_at)))best=v;
 }
 return best;
}
export function fomcCalendarEvents(asOf?:string,versions:readonly FomcVersion[]=FOMC_VERSIONS):CalendarEvent[]{
 const v=fomcVersionAsOf(asOf,versions);
 if(!v)return [];
 return Object.values(v.years).flatMap(ms=>ms.map(m=>({kind:'fomc_meeting' as const,region:'US' as const,start:m.start,end:m.end,source:'calendar' as const,source_url:v.source_url,sha256:v.sha256,retrieved_at:v.retrieved_at})))
  .sort((a,b)=>a.start.localeCompare(b.start));
}
