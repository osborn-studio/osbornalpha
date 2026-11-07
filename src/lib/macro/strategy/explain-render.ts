// src/lib/macro/strategy/explain-render.ts
// Deterministic fact sentences (spec 2026-11-07 §6.3 "输出分工"). Every number a reader sees in an explanation comes from
// here: template id ↔ zh / en render function over the fact's slots. Fixed formatting rules: level values verbatim
// (canonical decimal) with thousands separators and the series unit; pp / points changes verbatim with an explicit sign;
// bp changes rounded half away from zero to whole bp; percent changes arrive as the exact ratio '<to>/<from>' (unit
// 'pct_ratio') and are rounded ONCE, half away from zero, to one decimal (numeric.ts roundPctRatio — never a pre-rounded
// value); counts as integers; dates verbatim ISO. No float anywhere: rounding is done on the decimal text. Series names come from the manifest's frozen
// catalog. The model never writes a fact sentence.
import type {Bilingual,Fact,FrozenSeriesDef,RenderedExplanation} from './contract';
import {roundPctRatio} from './numeric';

export type Locale='zh'|'en';
export type NameLookup=(seriesId:string)=>Bilingual|null;
type Slot={value_text:string;unit:string};
type Slots=Fact['slots'];

const UNIT_SUFFIX:Record<string,Bilingual>={usd_per_bbl:{zh:' 美元/桶',en:' USD/bbl'},cny_per_100usd:{zh:' 元/100 美元',en:' CNY per 100 USD'}};
const DIRECTION:Record<string,Bilingual>={hike:{zh:'加息',en:'hike'},cut:{zh:'降息',en:'cut'}};
const STATUS:Record<string,Bilingual>={missing:{zh:'缺失',en:'missing'},restricted:{zh:'受限',en:'restricted'}};
const READ_STATE:Record<string,Bilingual>={truncated:{zh:'读取被截断',en:'read truncated'},not_read:{zh:'未读取',en:'not read'}};
const REASON:Record<string,Bilingual>={out_of_coverage:{zh:'月末观测不全',en:'month-end observations incomplete'},non_positive_base:{zh:'基期值非正',en:'non-positive base value'}};

function groupThousands(text:string):string{
 const neg=text.startsWith('-');const body=neg?text.slice(1):text;const dot=body.indexOf('.');
 const int=dot<0?body:body.slice(0,dot);const frac=dot<0?'':body.slice(dot);
 return `${neg?'-':''}${int.replace(/\B(?=(\d{3})+(?!\d))/g,',')}${frac}`;
}
const signed=(text:string):string=>text.startsWith('-')||/^0(\.0*)?$/.test(text)?text:`+${text}`;
/** Round a canonical decimal string to dp places, half away from zero, without floats; a zero result carries no sign. */
export function roundDecimal(text:string,dp:number):string{
 const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(text);if(!m)throw new Error(`invalid_decimal:${text}`);
 const frac=m[3]??'';let n=BigInt(m[2]+frac.slice(0,dp).padEnd(dp,'0'));
 if(frac.length>dp&&frac.charCodeAt(dp)>=53)n+=1n;
 let digits=n.toString();
 if(dp>0){digits=digits.padStart(dp+1,'0');digits=`${digits.slice(0,-dp)}.${digits.slice(-dp)}`;}
 return `${m[1]==='-'&&n!==0n?'-':''}${digits}`;
}
export const roundDecimalToInteger=(text:string):string=>roundDecimal(text,0);
export function formatSlot(s:Slot,locale:Locale):string{
 switch(s.unit){
  case 'pct':return `${groupThousands(s.value_text)}%`;
  case 'pp':return locale==='zh'?`${signed(s.value_text)} 个百分点`:`${signed(s.value_text)} pp`;
  case 'pp_level':return locale==='zh'?`${s.value_text} 个百分点`:`${s.value_text} pp`;
  case 'bp':return locale==='zh'?`${signed(roundDecimalToInteger(s.value_text))} 个基点`:`${signed(roundDecimalToInteger(s.value_text))} bp`;
  case 'pct_ratio':return `${signed(roundPctRatio(s.value_text,1))}%`;
  case 'points':return locale==='zh'?`${signed(s.value_text)} 点`:`${signed(s.value_text)} pts`;
  case 'count':return groupThousands(roundDecimalToInteger(s.value_text));
  default:return `${groupThousands(s.value_text)}${UNIT_SUFFIX[s.unit]?.[locale]??''}`;
 }
}
function ctx(f:Fact,locale:Locale,names:NameLookup){
 const raw=(k:string):Slots[string]=>{const v=f.slots[k];if(v===undefined)throw new Error(`missing_slot:${f.template}:${k}`);return v;};
 const str=(k:string):string=>{const v=raw(k);if(typeof v!=='string')throw new Error(`slot_not_text:${f.template}:${k}`);return v;};
 const num=(k:string):string=>{const v=raw(k);if(typeof v==='string')throw new Error(`slot_not_value:${f.template}:${k}`);return formatSlot(v,locale);};
 const name=(k:string):string=>{const id=str(k);return names(id)?.[locale]??id;};
 const word=(table:Record<string,Bilingual>,k:string):string=>{const v=str(k);return table[v]?.[locale]??v;};
 const range=(lo:string,hi:string):string=>{const a=raw(lo),b=raw(hi);return typeof a!=='string'&&typeof b!=='string'&&a.value_text===b.value_text?num(hi):`${num(lo)}–${num(hi)}`;};
 return {str,num,name,word,range};
}
type Renderer=(c:ReturnType<typeof ctx>)=>string;
/** Template id → zh / en renderer. Every template produced by facts.ts and review.ts is listed here (test enforces). */
export const TEMPLATES:Record<string,Record<Locale,Renderer>>={
 level:{zh:c=>`${c.name('series')}（${c.str('period')}）为 ${c.num('value')}。`,en:c=>`${c.name('series')} (${c.str('period')}) was ${c.num('value')}.`},
 change:{zh:c=>`${c.name('series')} ${c.str('period')} 较 ${c.str('prev_period')} 变化 ${c.num('change')}。`,en:c=>`${c.name('series')} changed by ${c.num('change')} from ${c.str('prev_period')} to ${c.str('period')}.`},
 derived_spread:{zh:c=>`${c.str('period')} ${c.name('a')} ${c.num('a_value')} 减 ${c.name('b')} ${c.num('b_value')}，利差为 ${c.num('value')}。`,en:c=>`On ${c.str('period')}, ${c.name('a')} ${c.num('a_value')} minus ${c.name('b')} ${c.num('b_value')} gives a spread of ${c.num('value')}.`},
 policy_event:{zh:c=>`${c.str('date')} 联邦基金目标利率由 ${c.range('lower_from','upper_from')} 调整为 ${c.range('lower_to','upper_to')}（上限变化 ${c.num('change')}）。`,en:c=>`On ${c.str('date')} the federal funds target moved from ${c.range('lower_from','upper_from')} to ${c.range('lower_to','upper_to')} (upper bound ${c.num('change')}).`},
 release:{zh:c=>`${c.name('series')} 新发布 ${c.str('period')} 数据 ${c.num('value')}（基线最新期 ${c.str('prev_period')}：${c.num('prev_value')}）。`,en:c=>`${c.name('series')} released ${c.str('period')} at ${c.num('value')} (baseline latest ${c.str('prev_period')}: ${c.num('prev_value')}).`},
 release_first:{zh:c=>`${c.name('series')} 新发布 ${c.str('period')} 数据 ${c.num('value')}（基线快照中无此序列）。`,en:c=>`${c.name('series')} released ${c.str('period')} at ${c.num('value')} (absent from the baseline snapshot).`},
 revision:{zh:c=>`${c.name('series')} ${c.str('period')} 数据由 ${c.num('from')} 修订为 ${c.num('to')}。`,en:c=>`${c.name('series')} for ${c.str('period')} was revised from ${c.num('from')} to ${c.num('to')}.`},
 timeliness_late:{zh:c=>`截至 ${c.str('date')}，${c.name('series')} 发布迟于预期（最新期 ${c.str('period')}）。`,en:c=>`As of ${c.str('date')}, ${c.name('series')} was late (latest period ${c.str('period')}).`},
 timeliness_missing:{zh:c=>`截至 ${c.str('date')}，${c.name('series')} 在快照中无观测。`,en:c=>`As of ${c.str('date')}, ${c.name('series')} had no observation in the snapshot.`},
 episode_opened:{zh:c=>`${c.word(DIRECTION,'direction')}行动段自 ${c.str('start')} 开始，至 ${c.str('end')} 共 ${c.num('events')} 次变动，上限 ${c.num('upper_from')} → ${c.num('upper_to')}，累计 ${c.num('cumulative')}。`,en:c=>`A ${c.word(DIRECTION,'direction')} episode began on ${c.str('start')}: ${c.num('events')} moves through ${c.str('end')}, upper bound ${c.num('upper_from')} → ${c.num('upper_to')}, cumulative ${c.num('cumulative')}.`},
 episode_ended:{zh:c=>`${c.str('start')} 至 ${c.str('end')} 的${c.word(DIRECTION,'direction')}行动段已结束（${c.num('events')} 次变动，上限 ${c.num('upper_from')} → ${c.num('upper_to')}，累计 ${c.num('cumulative')}）。`,en:c=>`The ${c.word(DIRECTION,'direction')} episode from ${c.str('start')} to ${c.str('end')} ended (${c.num('events')} moves, upper bound ${c.num('upper_from')} → ${c.num('upper_to')}, cumulative ${c.num('cumulative')}).`},
 asset_move:{zh:c=>`${c.name('series')} ${c.str('base_period')} → ${c.str('period')}：${c.num('from')} → ${c.num('to')}（${c.num('change')}）。`,en:c=>`${c.name('series')} ${c.str('base_period')} → ${c.str('period')}: ${c.num('from')} → ${c.num('to')} (${c.num('change')}).`},
 asset_missing:{zh:c=>`${c.name('series')} ${c.str('base_month')} 至 ${c.str('month')} 无法比较：${c.word(REASON,'reason')}。`,en:c=>`${c.name('series')} ${c.str('base_month')} to ${c.str('month')} not comparable: ${c.word(REASON,'reason')}.`},
 coverage:{zh:c=>`快照目录计数：已核实 ${c.num('verified')}，缺失 ${c.num('missing')}，受限 ${c.num('restricted')}。`,en:c=>`Snapshot catalog counts: verified ${c.num('verified')}, missing ${c.num('missing')}, restricted ${c.num('restricted')}.`},
 events_truncated:{zh:c=>`截至 ${c.str('date')}，政策事件序列读取被截断（${c.str('sources')}），本节无法列出。`,en:c=>`As of ${c.str('date')}, the policy event history read was truncated (${c.str('sources')}); this section cannot be listed.`},
 baseline_unavailable:{zh:c=>`${c.name('series')} 的基线数据${c.word(READ_STATE,'state')}，无法判断其为新发布或修订。`,en:c=>`${c.name('series')} baseline data unavailable (${c.word(READ_STATE,'state')}); release and revision could not be determined.`},
 catalog_unavailable:{zh:c=>`${c.name('series')} 目录状态：${c.word(STATUS,'status')}。`,en:c=>`${c.name('series')} catalog status: ${c.word(STATUS,'status')}.`},
};
export const TEMPLATE_IDS=Object.keys(TEMPLATES);
export function renderFact(f:Fact,locale:Locale,names:NameLookup):string{
 const t=TEMPLATES[f.template];if(!t)throw new Error(`unknown_template:${f.template}`);
 return t[locale](ctx(f,locale,names));
}
export const namesFrom=(catalog:readonly Pick<FrozenSeriesDef,'id'|'name'>[]):NameLookup=>{const m=new Map(catalog.map(d=>[d.id,d.name]));return id=>m.get(id)??null;};
export function renderFacts(facts:readonly Fact[],locale:Locale,catalog:readonly Pick<FrozenSeriesDef,'id'|'name'>[]):{fact_id:string;text:string}[]{
 const names=namesFrom(catalog);return facts.map(f=>({fact_id:f.fact_id,text:renderFact(f,locale,names)}));
}
/** Accepted explanation: fact sentences of every cited fact (first-cited order), then the model's hypotheses and counterpoints. */
export function renderExplanation(facts:readonly Fact[],output:{points:{fact_ids:string[];hypothesis:string}[];counterpoints:{fact_ids:string[];text:string}[]},locale:Locale,catalog:readonly Pick<FrozenSeriesDef,'id'|'name'>[]):RenderedExplanation{
 const byId=new Map(facts.map(f=>[f.fact_id,f]));const cited:string[]=[];
 for(const x of [...output.points,...output.counterpoints])for(const id of x.fact_ids)if(!cited.includes(id))cited.push(id);
 const names=namesFrom(catalog);
 return {facts:cited.map(id=>{const f=byId.get(id);if(!f)throw new Error(`unknown_fact:${id}`);return {fact_id:id,text:renderFact(f,locale,names)};}),
  hypotheses:output.points.map(p=>({text:p.hypothesis,fact_ids:[...p.fact_ids]})),counterpoints:output.counterpoints.map(p=>({text:p.text,fact_ids:[...p.fact_ids]}))};
}
