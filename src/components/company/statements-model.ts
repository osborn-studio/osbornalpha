// src/components/company/statements-model.ts
// Pure view model of the statements grid (plan 2026-11-06 Task 12; spec §5.3, §5.7).
import type {Cell,DerivedCell,FactCell,FilingSummary,GridRow,PeriodCol,WithheldReason} from '@/lib/company/types';
import type {StatementsResponse} from '@/lib/company/client';
import {formatValue,unitKindOfUnit,type UnitKind} from './format';

export type Badge={code:'R'|'n'|'!'|'U';seq?:number};
export type CellView=
 |{kind:'fact';text:string;badges:Badge[];cell:FactCell}
 |{kind:'derived';text:string;badges:Badge[];cell:Extract<Cell,{kind:'derived'}>}
 |{kind:'withheld';reason:WithheldReason;factId:string}
 |{kind:'missing';otherUnitOnly?:true};

/** `alsoOtherUnits`: the committed DTO's otherUnitsAlso[concept] lists this period (U also on derived cells). */
export function badgesOf(c:FactCell,filings:Record<string,FilingSummary>,alsoOtherUnits=false):Badge[]{
 const out:Badge[]=[];
 if(c.isRevision)out.push({code:'R'});else if(c.disclosureSeq>1)out.push({code:'n',seq:c.disclosureSeq});
 if(filings[c.filingId]?.citation==='pending')out.push({code:'!'});
 if(c.otherUnits||alsoOtherUnits)out.push({code:'U'});
 return out;
}
function derivedBadges(c:DerivedCell,filings:Record<string,FilingSummary>,alsoOtherUnits:boolean):Badge[]{
 const out:Badge[]=[];
 if(c.inputs.some(i=>filings[i.filingId]?.citation==='pending'))out.push({code:'!'});
 if(alsoOtherUnits)out.push({code:'U'});
 return out;
}
const rowKind=(r:GridRow):UnitKind=>r.unitKind;
/** `otherUnitOnly`: Task 7 GridResult.otherUnitOnly lists this period for the row (cell null → "—" + U, spec §5.3). */
export function cellView(c:Cell,row:GridRow,scaleExp:number,filings:Record<string,FilingSummary>,otherUnitOnly=false,alsoOtherUnits=false):CellView{
 if(c===null)return otherUnitOnly?{kind:'missing',otherUnitOnly:true}:{kind:'missing'};
 if(c.kind==='withheld')return {kind:'withheld',reason:c.reason,factId:c.factId};
 if(c.kind==='derived')return {kind:'derived',text:formatValue(c.value,c.unit==='pure'?'ratio':unitKindOfUnit(c.unit),scaleExp),badges:derivedBadges(c,filings,alsoOtherUnits),cell:c};
 return {kind:'fact',text:formatValue(c.value,rowKind(row),scaleExp),badges:badgesOf(c,filings,alsoOtherUnits),cell:c};
}
export function periodKeyParts(key:string):{periodStart:string;periodEnd:string;duration:string}{
 const [periodStart,periodEnd,duration]=key.split(':');return {periodStart,periodEnd,duration};
}
export function moneyCurrency(rows:GridRow[]):string|null{return rows.find(r=>r.unitKind==='money'&&r.unit)?.unit??null;}
export function gridEmptyState(r:StatementsResponse,asOf:string|null):'before_first'|'empty'|null{
 if(r.periods.length>0&&r.rows.length>0)return null;
 return asOf?'before_first':'empty';
}
const esc=(v:string|number|null|undefined)=>{const s=v==null?'':String(v);return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
export const CSV_HEADER=['concept','unit','period_key','period_start','period_end','duration','kind','fact_id','filing_id','available_date','value_text','withheld_reason'];
/** Every non-null cell; value_text verbatim (never scaled). */
export function statementsCsv(r:StatementsResponse):string{
 const lines=[CSV_HEADER.join(',')];
 for(const row of r.rows)for(const p of r.periods){
  const c=row.cells[p.key];if(!c)continue;
  const base=[row.concept,row.unit??'',p.key,p.periodStart,p.periodEnd,p.duration];
  if(c.kind==='fact')lines.push([...base,'fact',c.factId,c.filingId,c.availableDate,c.value,''].map(esc).join(','));
  else if(c.kind==='derived')lines.push([...base,'derived','','','',c.value,''].map(esc).join(','));
  else lines.push([...base,'withheld',c.factId,'','','',c.reason].map(esc).join(','));
 }
 return lines.join('\n')+'\n';
}
/** Bar heights only (Number() is used for drawing, never for displayed text). */
export function barSeries(row:GridRow,periods:PeriodCol[]):{key:string;value:number|null;blank:boolean}[]{
 return periods.map(p=>{
  const c=row.cells[p.key];
  if(!c||c.kind==='withheld')return {key:p.key,value:null,blank:true};
  const v=Number(c.value);return Number.isFinite(v)?{key:p.key,value:v,blank:false}:{key:p.key,value:null,blank:true};
 });
}
/** A `— U` cell opens raw fact history only where the period can have a directly disclosed fact; quarterly periods may be derived. */
export function otherUnitCellOpensHistory(basis:StatementsResponse['basis']):boolean{return basis!=='quarterly';}
