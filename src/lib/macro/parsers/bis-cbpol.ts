// BIS SDMX CSV, monthly end-of-period CN LPR only. csv_row.column is a zero-based
// field index, as in fred-csv.ts (not a character offset); line is the physical file line.
import {canonical} from '../decimal';
import {isIsoDate,monthEnd} from '../periods';
import type {ParsedPoint} from '../types';
export const BIS_PARSER_VERSION='bis-cbpol-cn-lpr1y/1';
export type BisParseCode='bis_bad_encoding'|'bis_bad_header'|'bis_bad_row'|'bis_bad_period'|'bis_bad_value'|'bis_definition_changed'|'bis_conflicting_rows'|'bis_invalid_today';
export class BisParseError extends Error{
 constructor(readonly code:BisParseCode){super(code);this.name='BisParseError';}
}
/** Single physical-line RFC-4180 fields; embedded newlines are refused, never half-read. */
function fields(line:string):string[]{
 const out:string[]=[];let pos=0;
 for(;;){
  let value='';
  if(line[pos]==='"'){
   pos++;let closed=false;
   while(pos<line.length){
    const ch=line[pos++];
    if(ch!=='"'){value+=ch;continue;}
    if(line[pos]==='"'){value+='"';pos++;}else{closed=true;break;}
   }
   if(!closed||(pos<line.length&&line[pos]!==','))throw new BisParseError('bis_bad_row');
  }else{
   while(pos<line.length&&line[pos]!==','){if(line[pos]==='"')throw new BisParseError('bis_bad_row');value+=line[pos++];}
  }
  out.push(value);if(pos===line.length)return out;pos++;
 }
}
export function parseBisCbpolLpr1y(bytes:Uint8Array,opts:{seriesId:string;today:string}):ParsedPoint[]{
 if(!isIsoDate(opts.today))throw new BisParseError('bis_invalid_today');
 let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new BisParseError('bis_bad_encoding');}
 const lines=text.split('\n').map(l=>l.endsWith('\r')?l.slice(0,-1):l);if(lines.at(-1)==='')lines.pop();
 let header:string[];try{header=fields(lines[0]??'');}catch{throw new BisParseError('bis_bad_header');}
 const required=['FREQ','REF_AREA','COMPILATION','SOURCE_REF','TIME_PERIOD','OBS_VALUE','OBS_STATUS'];
 if(required.some(c=>header.filter(h=>h===c).length!==1))throw new BisParseError('bis_bad_header');
 const index=(name:string)=>header.indexOf(name),out:ParsedPoint[]=[],seen=new Map<string,string>();
 for(let i=1;i<lines.length;i++){
  const row=fields(lines[i]);if(row.length!==header.length)throw new BisParseError('bis_bad_row');
  const get=(name:string)=>row[index(name)];
  if(get('FREQ')!=='M'||get('REF_AREA')!=='CN'||!get('COMPILATION').replace(/\s+/g,' ').includes('From 20 Aug 2019 onwards: Loan Prime Rate (1 year)')||get('SOURCE_REF')!=="People's Bank of China")throw new BisParseError('bis_definition_changed');
  const period=get('TIME_PERIOD');if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new BisParseError('bis_bad_period');
  if(period<'2019-08'||period>=opts.today.slice(0,7))continue;
  const raw=get('OBS_VALUE');if(raw===''||raw==='NaN')continue;
  if(!/^-?[0-9]+(\.[0-9]+)?$/.test(raw))throw new BisParseError('bis_bad_value');
  let valueText:string;try{valueText=canonical(raw);}catch{throw new BisParseError('bis_bad_value');}
  if(get('OBS_STATUS')!=='A')continue;
  if(seen.has(period)){if(seen.get(period)!==valueText)throw new BisParseError('bis_conflicting_rows');continue;}
  seen.set(period,valueText);
  out.push({seriesId:opts.seriesId,periodEnd:monthEnd(Number(period.slice(0,4)),Number(period.slice(5))),valueText,locator:{kind:'csv_row',line:i+1,column:index('OBS_VALUE')}});
 }
 return out.sort((a,b)=>a.periodEnd.localeCompare(b.periodEnd));
}
