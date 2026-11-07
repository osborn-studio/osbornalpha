// Pure decimal display and SVG geometry helpers (spec §9.3); Number is only for coordinates.
import type {FieldName,SnippetPurpose} from '@/lib/broker-research/types';
import type {PublicCitationDto,PublicReportDto,PublicSnippetDto,PublicTargetDto,PublicTitleDto} from '@/lib/broker-research/public-dto';
const DEC=/^-?\d+(?:\.\d+)?$/;
export const MINUS='−';
export function groupThousands(s:string):string{const neg=s.startsWith('-'),[i,f]=(neg?s.slice(1):s).split('.');return `${neg?MINUS:''}${i.replace(/\B(?=(\d{3})+(?!\d))/g,',')}${f===undefined?'':'.'+f}`;}
export const fmtNum=(s:string|null|undefined)=>s&&DEC.test(s)?groupThousands(s):'—';
export function fmtPct(s:string|null|undefined,{signed=false}:{signed?:boolean}={}):string{
 if(!s||!DEC.test(s))return '—';
 const neg=s.startsWith('-'),[i,f='']=(neg?s.slice(1):s).split('.');
 const digits=BigInt(i+f),scale=10n**BigInt(f.length);
 const tenths=(digits*1000n*2n+scale)/(2n*scale);
 return `${tenths===0n?'':neg?MINUS:signed?'+':''}${tenths/10n}.${tenths%10n}%`;
}
const SCALE=6,ONE=1000000n;
const scaled=(s:string)=>{const neg=s.startsWith('-'),[i,f='']=(neg?s.slice(1):s).split('.');const v=BigInt(i+f.padEnd(SCALE,'0').slice(0,SCALE));return neg?-v:v;};
const unscaled=(v:bigint)=>{const neg=v<0n,a=(neg?-v:v).toString().padStart(7,'0');return `${neg?'-':''}${a.slice(0,-6)}.${a.slice(-6)}`;};
export function relChange(prev:string|null,cur:string|null):string|null{if(!prev||!cur||!DEC.test(prev)||!DEC.test(cur))return null;const p=scaled(prev);return p===0n?null:unscaled(scaled(cur)*ONE/p-ONE);}
export const shortId=(id:string|null|undefined)=>!id?'—':id.length<=10?id:`${id.slice(0,4)}…${id.slice(-4)}`;
export const fmtDay=(s:string|null|undefined)=>s?.slice(0,10)??'—';
export function fmtInstant(s:string|null|undefined,locale:string):string{if(!s)return '—';const d=new Date(s);return Number.isNaN(d.getTime())?'—':d.toLocaleString(locale==='zh'?'zh-CN':'en-US',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});}
export const primaryTarget=(r:Pick<PublicReportDto,'targets'|'primaryTargetKey'>):PublicTargetDto|null=>r.targets.find(t=>t.targetKey===r.primaryTargetKey)??r.targets[0]??null;
export function displayTitle(t:PublicTitleDto,locale:string){const tr=locale==='zh'?t.zh:locale==='en'?t.en:null;return t.isTranslation&&tr?{text:tr,translated:true,rewritten:false,modelId:t.modelId}:{text:t.text,translated:false,rewritten:t.isRewritten,modelId:null};}
export function provenanceKey(c:PublicCitationDto){return c.status==='absent'?'absent':c.extractorKind==='llm'?c.status==='corrected'?'llmCorrected':'llmConfirmed':c.extractorKind==='human'?'humanAdded':'unknown';}
export function citationFor(list:PublicCitationDto[],targetKey:string|null,field:FieldName){return list.filter(c=>c.targetKey===targetKey&&c.field===field).sort((a,b)=>a.occurrence-b.occurrence)[0]??null;}
export const snippetsFor=(list:PublicSnippetDto[],c:PublicCitationDto|null)=>c?.fieldId?list.filter(s=>s.fieldId===c.fieldId):[];
const ORDER:SnippetPurpose[]=['rating','target','thesis','risk','method','other'];
export const groupSnippets=(list:PublicSnippetDto[]):[SnippetPurpose,PublicSnippetDto[]][]=>ORDER.map(p=>[p,list.filter(s=>s.purpose===p)] as [SnippetPurpose,PublicSnippetDto[]]).filter(([,l])=>l.length>0);
export interface ChartBox{width:number;height:number;left:number;right:number;top:number;bottom:number}
export interface StepPoint{date:string;value:string|null;label:string;reportId:string}
const r1=(n:number)=>Math.round(n*10)/10;
export function stepChart(points:StepPoint[],box:ChartBox){
 const pts=points.filter((p):p is StepPoint&{value:string}=>p.value!==null&&DEC.test(p.value)&&Number.isFinite(Date.parse(p.date))).sort((a,b)=>a.date.localeCompare(b.date)||a.reportId.localeCompare(b.reportId));if(!pts.length)return null;
 const ts=pts.map(p=>Date.parse(p.date)),vs=pts.map(p=>Number(p.value)),tMin=Math.min(...ts),tMax=Math.max(...ts),vMin=Math.min(...vs),vMax=Math.max(...vs);
 const pad=vMax>vMin?(vMax-vMin)*.15:Math.max(Math.abs(vMax)*.1,1),lo=vMin-pad,hi=vMax+pad,iw=box.width-box.left-box.right,ih=box.height-box.top-box.bottom;
 const x=(t:number)=>r1(tMin===tMax?box.left+iw/2:box.left+(t-tMin)/(tMax-tMin)*iw),y=(v:number)=>r1(box.top+(hi-v)/(hi-lo)*ih);
 const dots=pts.map((p,i)=>({cx:x(ts[i]),cy:y(vs[i]),label:p.label,date:p.date,value:p.value,reportId:p.reportId}));
 const path=dots.map((d,i)=>i?`H${d.cx} V${d.cy}`:`M${d.cx} ${d.cy}`).join(' ');
 const ticks=vMax>vMin?[vMax,(vMax+vMin)/2,vMin]:[vMax];
 return {path,dots,yTicks:ticks.map(v=>({y:y(v),label:String(r1(v))})),xTicks:[0,dots.length-1].filter((i,j,a)=>a.indexOf(i)===j).map(i=>({x:dots[i].cx,label:dots[i].date.slice(0,7)}))};
}
export interface SpreadPoint{key:string;priceAtReport:string|null;target:string|null}
export function spreadChart(rows:SpreadPoint[],box:ChartBox,rowHeight:number){
 const num=(s:string|null)=>s!==null&&DEC.test(s)?Number(s):null,vals=rows.flatMap(r=>[num(r.priceAtReport),num(r.target)]).filter((v):v is number=>v!==null);if(!vals.length)return null;
 const min=Math.min(...vals),max=Math.max(...vals),pad=max>min?(max-min)*.1:Math.max(Math.abs(max)*.1,1),lo=min-pad,hi=max+pad,iw=box.width-box.left-box.right;
 const x=(v:number)=>r1(box.left+(v-lo)/(hi-lo)*iw);
 return {rows:rows.map((r,i)=>{const p=num(r.priceAtReport),t=num(r.target);return {key:r.key,y:r1(box.top+rowHeight*(i+.5)),priceX:p===null?null:x(p),targetX:t===null?null:x(t)};}),ticks:[{x:x(min),label:String(min)},{x:x(max),label:String(max)}],height:box.top+rowHeight*rows.length+box.bottom};
}
