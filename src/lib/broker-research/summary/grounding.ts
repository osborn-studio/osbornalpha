// Numeric grounding of independent summaries against effective evidence (spec §6.4(b), grounding/1).
// Each numeric sentence must identify one supported field, unit, value and target.
import type {FieldName,GroundingAssertion,GroundingResult,ValueUnit} from '../types';
import {CURRENCY_MARKS} from '../extract/typed';
import {canonicalDecimal} from '../../facts/json-numbers';
import {dec,decAbs,decShift,decSign,decString,round1} from '../decimal';
import {GROUNDING_VERSION} from '../versions';
export type GroundableField='target_price'|'price_at_report'|'upside_stated'|'target_horizon'|'wacc'|'terminal_growth'|'terminal_value_share';
export const GROUNDING_KEYWORDS:Readonly<Record<GroundableField,readonly string[]>>=Object.freeze({
 target_price:['目标价','目标价格','目标股价','目標價','target price','price target'],
 price_at_report:['报告时价格','报告日价格','报告日收盘价','收盘价','股价','reference price','closing price','share price','price at report'],
 upside_stated:['上涨空间','上行空间','潜在涨幅','涨幅空间','upside','implied upside','potential upside'],
 target_horizon:['目标期限','投资期限','期限','time horizon','target horizon','horizon'],
 wacc:['wacc','加权平均资本成本'],
 terminal_growth:['永续增长率','终值增长率','长期增长率','terminal growth rate','terminal growth','perpetual growth'],
 terminal_value_share:['终值占比','终值贡献占比','terminal value share','share of terminal value'],
});
export const DOWNSIDE_KEYWORDS:readonly string[]=Object.freeze(['下跌空间','下行空间','潜在跌幅','downside','implied downside']);
const UNIT_OF:Readonly<Record<GroundableField,ValueUnit>>={target_price:'price',price_at_report:'price',upside_stated:'pct',target_horizon:'months',wacc:'pct',terminal_growth:'pct',terminal_value_share:'pct'};
export interface GroundingTarget{target_key:string;ticker_as_stated:string;security_ticker:string|null}
/** Callers provide effective numeric values and target-derived effective currency. */
export interface GroundingField{field_id:string;target_key:string|null;field:FieldName;value_num:string;value_unit:ValueUnit;currency:string|null}
export interface GroundingInput{targets:GroundingTarget[];fields:GroundingField[]}
const N=(s:string)=>s.normalize('NFKC');
const lower=(s:string)=>N(s).toLowerCase();
const isWord=(c:string|undefined)=>c!==undefined&&/[a-z0-9]/i.test(c);
export function splitSentences(text:string):string[]{
 const t=N(text),out:string[]=[];let cur='';
 for(let i=0;i<t.length;i++){const c=t[i];if(c==='\n'||'。！？；!?;'.includes(c)||(c==='.'&&(i+1===t.length||/\s/.test(t[i+1])))){if(c!=='\n')cur+=c;if(cur.trim())out.push(cur.trim());cur='';}else cur+=c;}
 if(cur.trim())out.push(cur.trim());return out;
}
export function identifierVariants(t:GroundingTarget):string[]{
 const v=new Set<string>();
 for(const s of [t.target_key.startsWith('stated:')?null:t.target_key,t.ticker_as_stated,t.security_ticker]){
  if(!s)continue;const u=N(s).trim().toUpperCase();v.add(u);
  const hk=/^0*(\d{1,5})\.HK$/.exec(u);if(hk){const d=hk[1];for(const x of [d,d.padStart(4,'0'),d.padStart(5,'0')]){v.add(`${x}.HK`);v.add(`${x} HK`);}}
  const a=/^(\d{6})\.(SH|SZ|BJ)$/.exec(u);if(a){v.add(`${a[1]} CH`);if(a[2]==='SH')v.add(`${a[1]}.SS`);}
 }
 return [...v].filter(x=>/[A-Z]/.test(x)).sort((x,y)=>y.length-x.length);
}
interface Span{start:number;end:number}
function findAll(hay:string,needle:string,wordBounded:boolean):Span[]{
 const out:Span[]=[];for(let i=hay.indexOf(needle);i!==-1;i=hay.indexOf(needle,i+1)){const end=i+needle.length;if(wordBounded&&((isWord(hay[i-1])&&isWord(needle[0]))||(isWord(hay[end])&&isWord(needle[needle.length-1]))))continue;out.push({start:i,end});}return out;
}
const MARKS=[...Object.keys(CURRENCY_MARKS),'元'].sort((a,b)=>b.length-a.length);
const MONTH_UNITS=['个月','個月','-months','-month','months','month','mos'];
type Unit={unit:ValueUnit|null;iso:string|null};
function unitAround(s:string,start:number,end:number):Unit{
 const after=s.slice(end).replace(/^\s+/,'');const afterU=after.toUpperCase();
 if(after.startsWith('%'))return {unit:'pct',iso:null};
 for(const m of MONTH_UNITS)if(after.toLowerCase().startsWith(m)&&!isWord(after[m.length]))return {unit:'months',iso:null};
 for(const m of MARKS)if(afterU.startsWith(m))return {unit:'price',iso:CURRENCY_MARKS[m]??null};
 const before=s.slice(0,start).replace(/\s+$/,'').toUpperCase();
 for(const m of MARKS)if(before.endsWith(m))return {unit:'price',iso:CURRENCY_MARKS[m]??null};
 return {unit:null,iso:null};
}
export function checkGrounding(summary:string,input:GroundingInput):GroundingResult{
 const assertions:GroundingAssertion[]=[],failures:{sentence_idx:number;reason:string}[]=[];
 const multi=input.targets.length>1;
 const kw=(Object.entries(GROUNDING_KEYWORDS) as [GroundableField,readonly string[]][]).flatMap(([field,list])=>list.map(k=>({k:lower(k),field,down:false}))).concat(DOWNSIDE_KEYWORDS.map(k=>({k:lower(k),field:'upside_stated' as GroundableField,down:true})));
 splitSentences(summary).forEach((sentence,idx)=>{
  const fail=(reason:string)=>failures.push({sentence_idx:idx,reason});
  const upper=sentence.toUpperCase();let masked=sentence;const named=new Set<string>();
  for(const target of input.targets)for(const variant of identifierVariants(target))for(const sp of findAll(upper,variant,true)){if(/^\s*$/.test(masked.slice(sp.start,sp.end)))continue;named.add(target.target_key);masked=masked.slice(0,sp.start)+' '.repeat(sp.end-sp.start)+masked.slice(sp.end);}
  const nums=[...masked.matchAll(/(?<![\d.])(?<!\d,)([-+−]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?![\d])/g)];
  if(!nums.length)return;if(nums.length>1)return fail('multiple_numbers');
  const m=nums[0],start=m.index!,end=start+m[0].length;
  const value=canonicalDecimal(`${m[1]==='-'||m[1]==='−'?'-':''}${m[2].replace(/,/g,'')}${m[3]??''}`);
  const low=masked.toLowerCase();let best:{end:number;len:number;field:GroundableField;down:boolean}|null=null;
  for(const {k,field,down} of kw)for(const sp of findAll(low,k,/[a-z]/.test(k)))if(sp.end<=start&&(!best||sp.end>best.end||(sp.end===best.end&&k.length>best.len)))best={end:sp.end,len:k.length,field,down};
  if(!best)return fail('no_keyword');const field=best.field;
  const pool=input.fields.filter(f=>f.field===field&&f.value_unit===UNIT_OF[field]);if(!pool.length)return fail('field_missing');
  const reportLevel=pool.filter(f=>f.target_key===null);if(named.size>1)return fail('target_ambiguous');
  const tk=named.size===1?[...named][0]:multi?null:input.targets[0]?.target_key??null;
  const candidates=named.size===0&&reportLevel.length?reportLevel:pool.filter(f=>f.target_key===tk||f.target_key===null);
  if(!named.size&&multi&&!reportLevel.length)return fail('target_missing');if(!candidates.length)return fail('field_missing');
  const unit=unitAround(masked,start,end),want=UNIT_OF[field];if(!(unit.unit===want||(want==='pct'&&unit.unit===null)))return fail('unit_mismatch');
  const match=candidates.find(f=>{
   if(want==='pct'){const pct=decShift(dec(f.value_num),2),written=unit.unit==='pct'?dec(value):decShift(dec(value),2);if(best!.down)return decSign(pct)<0&&round1(decString(decAbs(written)))===round1(decString(decAbs(pct)));return round1(decString(written))===round1(decString(pct));}
   if(want==='price'&&unit.iso!==null&&f.currency!==null&&unit.iso!==f.currency)return false;
   return round1(value)===round1(f.value_num);
  });
  if(!match){const currency=want==='price'&&unit.iso!==null&&candidates.every(f=>f.currency!==null&&f.currency!==unit.iso);return fail(currency?'currency_mismatch':'value_mismatch');}
  assertions.push({sentence_idx:idx,target_key:match.target_key??tk??'',field,value,unit:want,field_id:match.field_id});
 });
 return {version:GROUNDING_VERSION,passed:failures.length===0,assertions,failures};
}
