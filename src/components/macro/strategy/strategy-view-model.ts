// src/components/macro/strategy/strategy-view-model.ts
// Pure view helpers for the macro strategy UI (spec §3, §8, §9.1). vitest runs in node and cannot import .tsx, so every
// decision a component makes lives here and the .tsx files stay thin renderers. Display rounding happens only here
// (spec §5.3, §5.6): views carry exact value_text, the exact pct ratio '<end>/<base>' in change_text and full-precision *_raw
// numbers; a pct change is rounded once, from the exact ratio (formatPctRatio). No F4 number is ever formatted.
import type {Bilingual,Boundary,Cell,CycleCell,CycleTableView,DeviationCase,DiffKind,Episode,EventRow,ExplanationProjection,F4Mark,F4Summary,Fact,JudgmentStatus,
 NodeView,ObsRef,PlaybookView,PolicyResponseView,Regime,Region,RenderedExplanation,ResponseDim,ReviewFacts,TransmissionView} from '@/lib/macro/strategy/contract';
import {roundPctRatio} from '@/lib/macro/strategy/numeric';
import type {ReviewIndexItem} from '@/lib/macro/strategy/route-helpers';
export type Locale='zh'|'en';
export type StrategyT=(key:string,values?:Record<string,string|number>)=>string;
export const MISSING='—';
export const MINUS='−';
// ---- API urls and load states (spec §8, §9.1)
export const strategyApi={
 transmission:(r:Region)=>`/api/macro/strategy/transmission?region=${r}`,
 policyResponse:(w:1|3|6)=>`/api/macro/strategy/policy-response?window=${w}`,
 cycleTable:(b:Boundary)=>`/api/macro/strategy/cycle-table?boundary=${b}`,
 reviews:(r:Region)=>`/api/macro/strategy/reviews?region=${r}`,
 review:(r:Region,month:string)=>`/api/macro/strategy/reviews/${r}/${month}`,
 deviations:(r:Region)=>`/api/macro/strategy/deviations?region=${r}`,
 explanations:(kind:'snapshot'|'review',id:string)=>`/api/macro/strategy/explanations?subject_kind=${kind}&subject_id=${encodeURIComponent(id)}`,
 manifest:(id:string)=>`/api/macro/strategy/manifests/${id}`,
};
export type LoadState<T>={kind:'loading'}|{kind:'ok';data:T}|{kind:'disabled'}|{kind:'foundation'}|{kind:'no_snapshot'}|{kind:'not_found'}|{kind:'judgments_disabled'}|{kind:'judgments_unavailable'}|{kind:'error';code:string};
export function errorCode(body:unknown):string|null{
 if(typeof body!=='object'||body===null)return null;
 const e=(body as {error?:unknown}).error;
 return typeof e==='object'&&e!==null&&typeof (e as {code?:unknown}).code==='string'?(e as {code:string}).code:null;
}
export function loadStateOf<T>(status:number,body:unknown):LoadState<T>{
 if(status>=200&&status<300)return {kind:'ok',data:body as T};
 const code=errorCode(body);
 if(status===404&&code==='strategy_disabled')return {kind:'disabled'};
 if(status===503&&code==='macro_foundation_unavailable')return {kind:'foundation'};
 if(status===404&&code==='no_published_snapshot')return {kind:'no_snapshot'};
 if(status===404&&code==='judgments_disabled')return {kind:'judgments_disabled'};
 if(status===503&&code==='judgments_unavailable')return {kind:'judgments_unavailable'};
 if(status===404)return {kind:'not_found'};
 return {kind:'error',code:code??`http_${status}`};
}
// ---- decimal display (string arithmetic: no float drift on value_text)
/** Round a decimal string half away from zero to dp places; anything else → MISSING. */
export function roundDecimalText(text:string,dp:number):string{
 const m=/^(-)?(\d+)(?:\.(\d+))?$/.exec(text.trim());
 if(!m)return MISSING;
 const frac=m[3]??'';
 let n=BigInt(m[2]+frac.padEnd(dp,'0').slice(0,dp));
 if(frac.length>dp&&Number(frac[dp])>=5)n+=1n;
 const s=n.toString().padStart(dp+1,'0');
 const out=dp>0?`${s.slice(0,-dp)}.${s.slice(-dp)}`:s;
 return m[1]&&n!==0n?`-${out}`:out;
}
/** Source precision kept up to 2 decimals. */
export function formatValueText(text:string):string{
 const frac=/\.(\d+)$/.exec(text)?.[1]??'';
 return frac.length>2?roundDecimalText(text,2):text;
}
const signed=(t:string):string=>t===MISSING?t:t.startsWith('-')?`${MINUS}${t.slice(1)}`:/^0(\.0+)?$/.test(t)?t:`+${t}`;
/** Full-precision float → display: pct to 0.1 %, bp to 1 bp (spec §5.3). */
export function formatRaw(raw:number|null,unit:'pct'|'bp'):string{
 if(raw===null||!Number.isFinite(raw))return MISSING;
 return `${signed(roundDecimalText(raw.toFixed(10),unit==='pct'?1:0))}${unit==='pct'?'%':' bp'}`;
}
/** Exact pct ratio '<end>/<base>' → display to 0.1 %, rounded once (no pre-rounded value in between). */
export function formatPctRatio(ratio:string):string{
 let r:string;try{r=roundPctRatio(ratio,1);}catch{return MISSING;}
 return `${signed(r)}%`;
}
/** Exact bp decimal string → display to 1 bp. */
export function formatBpText(text:string):string{const r=roundDecimalText(text,0);return r===MISSING?r:`${signed(r)} bp`;}
export type Tone='up'|'down'|'flat'|'missing';
export const toneOfText=(display:string):Tone=>display===MISSING?'missing':display.startsWith('+')?'up':display.startsWith(MINUS)?'down':'flat';
/** Three wash levels by share of the column's largest magnitude (spec §3.3: three light tints + sign). */
export function toneLevel(raw:number|null,maxAbs:number):1|2|3{
 if(raw===null||!(maxAbs>0))return 1;
 const r=Math.abs(raw)/maxAbs;
 return r>2/3?3:r>1/3?2:1;
}
const TONE_CLASSES:Record<'up'|'down',readonly [string,string,string]>={
 up:['bg-[color-mix(in_srgb,var(--up)_6%,transparent)]','bg-[color-mix(in_srgb,var(--up)_10%,transparent)]','bg-[color-mix(in_srgb,var(--up)_16%,transparent)]'],
 down:['bg-[color-mix(in_srgb,var(--down)_6%,transparent)]','bg-[color-mix(in_srgb,var(--down)_10%,transparent)]','bg-[color-mix(in_srgb,var(--down)_16%,transparent)]'],
};
export function toneClass(tone:Tone,level:1|2|3):string{
 if(tone==='up'||tone==='down')return TONE_CLASSES[tone][level-1];
 return tone==='missing'?'text-text-dim':'';
}
export const unitSuffix=(unit:string):string=>unit==='pct'?'%':unit==='pp'?' pp':unit==='bp'?' bp':'';
export function formatInstant(iso:string):string{
 const d=new Date(iso);
 return Number.isNaN(d.getTime())?MISSING:`${d.toISOString().slice(0,10)} ${d.toISOString().slice(11,16)} UTC`;
}
export const shortId=(id:string):string=>id.length>12?`${id.slice(0,8)}…`:id;
// ---- transmission (spec §3.3, §5.1)
export interface NodeDisplay{id:string;badgeKey:string;label:string;value:string|null;unit:string;period:string|null;reason:string|null;formula:string|null;dashed:boolean;drill:boolean;seriesId:string|null}
export function nodeDisplay(n:NodeView,l:Locale):NodeDisplay{
 const pair=n.inputs.length===2;
 return {id:n.id,badgeKey:`state.${n.state}`,label:n.label[l],value:n.value_text===null?null:formatValueText(n.value_text),unit:unitSuffix(n.unit??''),
  period:n.period_end,reason:n.reason?n.reason[l]:null,
  formula:n.state==='derived'&&pair&&n.value_text!==null?`${n.inputs[0].value_text} ${MINUS} ${n.inputs[1].value_text} = ${n.value_text}`:null,
  dashed:n.state!=='observed'&&n.state!=='derived',drill:pair,seriesId:n.state==='observed'&&n.inputs.length>0?n.inputs[0].series_id:null};
}
/** The requested region has a snapshot in the manifest (the other region may have one when this one has none). */
export const hasSnapshot=(v:TransmissionView):boolean=>v.snapshots[v.region]!==null;
export function flowRows(v:TransmissionView,l:Locale):{key:string;stage:string;node:string;stateKey:string;value:string;period:string;reason:string}[]{
 return v.stages.flatMap(s=>s.nodes.map(n=>{const d=nodeDisplay(n,l);
  return {key:`${s.stage}:${n.id}`,stage:s.label[l],node:d.label,stateKey:d.badgeKey,value:d.value===null?MISSING:`${d.value}${d.unit}`,period:n.period_end??MISSING,reason:d.reason??''};}));
}
// ---- playbooks (spec §5.2): static framework; a card is marked only for an F4 card on the manifest's snapshot
export interface PlaybookCard{regime:Regime;title:string;triggers:string[];mechanism:string[];favored:string[];disfavored:string[];watch:{id:string;name:string}[];marked:boolean}
export const supportText=(n:number):string=>Number.isInteger(n)?n.toFixed(1):String(n);
export function playbookCards(p:PlaybookView[],l:Locale,f4:{mark:F4Mark}|null):PlaybookCard[]{
 return p.map(b=>({regime:b.regime,title:b.title[l],triggers:b.triggers.map(t=>`${t.type} · ${t.condition[l]} · ${supportText(t.support)}`),
  mechanism:b.mechanism.map(x=>x[l]),favored:b.implications.favored.map(x=>x[l]),disfavored:b.implications.disfavored.map(x=>x[l]),
  watch:b.watch.map(w=>({id:w.series_id,name:w.name[l]})),marked:f4!==null&&f4.mark.snapshot_match&&f4.mark.regime===b.regime}));
}
export type PlaybookNotice={key:'playbook.offNote'}|{key:'dependency.judgmentsUnavailable'}|{key:'playbook.earlier';date:string}|null;
export function playbookNotice(status:JudgmentStatus,f4:{mark:F4Mark}|null):PlaybookNotice{
 if(status==='disabled')return {key:'playbook.offNote'};
 if(status==='unavailable'||f4===null)return {key:'dependency.judgmentsUnavailable'};
 return f4.mark.snapshot_match?null:{key:'playbook.earlier',date:f4.mark.as_of.slice(0,10)};
}
const CALIBRATION_STATES:readonly string[]=['insufficient_sample','uncalibrated','calibrated','stale'];
export function f4SummaryDisplay(s:F4Summary,t:StrategyT):{category:string;lifecycle:string;calibration:string;method:string;asOf:string;href:string|null}{
 const lifecycle=s.lifecycle==='open'?t('f4.lifecycle.open')
  :s.lifecycle==='settled'?(s.outcome?t(`f4.lifecycle.settled_${s.outcome}`):t('f4.lifecycle.settled'))
  :t('f4.lifecycle.other',{value:s.lifecycle});
 const cal=CALIBRATION_STATES.includes(s.calibration)?t(`f4.calibrationState.${s.calibration}`):s.calibration;
 return {category:s.selected?t(`regime.${s.selected}`):MISSING,lifecycle,calibration:t('f4.calibration',{value:cal}),
  method:t('f4.method',{id:s.methodology.id,version:s.methodology.version}),asOf:t('f4.asOf',{date:s.as_of.slice(0,10)}),href:s.href};
}
// ---- policy response matrix (spec §3.3, §5.3)
export interface CellDisplay{main:string;sub:string|null;tone:Tone;drill:boolean;raw:number|null}
export const cellEvents=(c:Cell):EventRow[]=>c.status==='stats'||c.status==='events_only'||c.status==='insufficient'?c.events:[];
export function matrixCell(c:Cell,l:Locale,t:StrategyT):CellDisplay{
 switch(c.status){
  case 'stats':{const main=formatRaw(c.median_raw,c.unit);
   return {main,sub:t('matrix.quartiles',{q1:formatRaw(c.q1_raw,c.unit),q3:formatRaw(c.q3_raw,c.unit),n:c.n}),tone:toneOfText(main),drill:true,raw:c.median_raw};}
  case 'events_only':return {main:t('matrix.n',{n:c.n}),sub:t('matrix.fewEvents'),tone:'flat',drill:true,raw:null};
  case 'insufficient':return {main:MISSING,sub:t('matrix.insufficient'),tone:'missing',drill:c.events.length>0,raw:null};
  default:return {main:t(`state.${c.status}`),sub:c.reason[l],tone:'missing',drill:false,raw:null};
 }
}
const NO_CELL:Cell={status:'missing',reason:{zh:'无数据',en:'No data'}};
export const cellOf=(row:{cells:Record<string,Cell>},dimId:string):Cell=>row.cells[dimId]??NO_CELL;
/** Largest |median| per dimension: the wash scale of that column. */
export function matrixScale(v:PolicyResponseView):Record<string,number>{
 const out:Record<string,number>={};
 for(const d of v.dims)out[d.id]=v.rows.reduce((m,r)=>{const c=cellOf(r,d.id);return c.status==='stats'?Math.max(m,Math.abs(c.median_raw)):m;},0);
 return out;
}
/** A row whose every cell is missing for one reason renders as one spanning cell (the QE / QT row). */
export function uniformReason(row:{cells:Record<string,Cell>},dims:ResponseDim[],l:Locale):string|null{
 const cells=dims.map(d=>cellOf(row,d.id));
 if(cells.length===0||cells.some(c=>c.status!=='missing'))return null;
 const first=(cells[0] as {reason:Bilingual}).reason;
 return cells.every(c=>(c as {reason:Bilingual}).reason.zh===first.zh)?first[l]:null;
}
export interface EventDisplay{key:string;date:string;changeBp:string;base:string;end:string;change:string;selected:boolean;exclusionKey:string|null}
export function eventRows(events:EventRow[],unit:'pct'|'bp'):EventDisplay[]{
 const end=(e:EventRow['base'])=>e?`${e.period_end.slice(0,7)} · ${formatValueText(e.value_text)}`:MISSING;
 return events.map(e=>({key:e.effective_date,date:e.effective_date,changeBp:formatBpText(e.change_bp),base:end(e.base),end:end(e.end),
  change:e.change_text===null?formatRaw(e.change_raw,unit):unit==='bp'?formatBpText(e.change_text):formatPctRatio(e.change_text),selected:e.selected,exclusionKey:e.exclusion?`matrix.exclusion.${e.exclusion}`:null}));
}
export function coverageText(d:ResponseDim,t:StrategyT):string{
 return d.coverage.from&&d.coverage.to?t('matrix.coverage',{from:d.coverage.from.slice(0,7),to:d.coverage.to.slice(0,7)}):t('matrix.noCoverage');
}
export const dimLabel=(d:ResponseDim,l:Locale):string=>`${d.label[l]} ${d.unit==='pct'?'%':'bp'}`;
/** Mobile (< 640px) fallback: one group per column, one line per policy row (spec §3.7). */
export function matrixGroups(v:PolicyResponseView,l:Locale,t:StrategyT):{id:string;label:string;coverage:string;rows:{direction:'hike'|'cut'|'qe_qt';cell:CellDisplay;source:Cell}[]}[]{
 // `source` is the Cell itself so the mobile list opens the same per-event drawer as the desktop table (n < 5 included).
 return v.dims.map(d=>({id:d.id,label:dimLabel(d,l),coverage:coverageText(d,t),rows:v.rows.map(r=>{const source=cellOf(r,d.id);return {direction:r.direction,cell:matrixCell(source,l,t),source};})}));
}
/** The matrix's own manifest, cutoff and version (spec §3.2): the page header links the transmission manifest, not this one. */
export function matrixMeta(v:PolicyResponseView,t:StrategyT):{href:string;manifest:string;fullId:string;cutoff:string;version:string}{
 return {href:strategyApi.manifest(v.manifest_id),manifest:t('meta.manifest',{id:shortId(v.manifest_id)}),fullId:v.manifest_id,cutoff:t('meta.cutoff',{time:formatInstant(v.cutoff)}),version:v.version};
}
/** Per-event frozen inputs of both endpoints (spread endpoints carry two observations each): dates, values, versions, sources. */
export function eventEvidence(events:EventRow[]):{key:string;date:string;base:ObsRef[];end:ObsRef[]}[]{
 return events.map(e=>({key:e.effective_date,date:e.effective_date,base:e.base?.inputs??[],end:e.end?.inputs??[]}));
}
// ---- policy action episodes × assets (spec §3.4, §5.5)
export function cycleCell(c:CycleCell,t:StrategyT):CellDisplay&{refs:ObsRef[]}{
 if(c.status==='ok'){
  const main=c.change_kind==='bp'?formatBpText(c.change_text):formatPctRatio(c.change_text);
  return {main,sub:`${formatValueText(c.from.value_text)} (${c.from.period_end}) → ${formatValueText(c.to.value_text)} (${c.to.period_end})`,tone:toneOfText(main),drill:true,
   raw:c.change_kind==='bp'?Number(c.change_text):c.change_raw,refs:[c.from,c.to]};
 }
 if(c.status==='missing')return {main:t('state.missing'),sub:t(`history.missing.${c.reason}`),tone:'missing',drill:false,raw:null,refs:[]};
 return {main:t('state.restricted'),sub:null,tone:'missing',drill:false,raw:null,refs:[]};
}
const CYCLE_MISSING:CycleCell={status:'missing',reason:'out_of_coverage'};
export const cycleCellOf=(v:CycleTableView,e:Episode,columnId:string):CycleCell=>v.cells[String(e.index)]?.[columnId]??CYCLE_MISSING;
export function episodeView(e:Episode,t:StrategyT):{key:string;direction:string;dates:string;line:string;flags:string[]}{
 return {key:`${e.direction}:${e.start}`,direction:t(`history.direction.${e.direction}`),dates:`${e.start} → ${e.end}`,
  line:t('history.episodeLine',{from:e.upper_from,to:e.upper_to,bp:formatBpText(e.cumulative_bp),n:e.events}),
  flags:[e.left_censored?'history.flag.leftCensored':null,e.ongoing?'history.flag.ongoing':null,e.gap_after?'history.flag.gapAfter':null].filter((k):k is string=>k!==null)};
}
/** type-7 quantile of an ascending array (spec §5.6). */
export function quantile7(sorted:number[],p:number):number{
 const h=(sorted.length-1)*p,lo=Math.floor(h);
 return lo+1<sorted.length?sorted[lo]+(h-lo)*(sorted[lo+1]-sorted[lo]):sorted[lo];
}
export function cycleScale(v:CycleTableView,columnId:string):number{
 return v.episodes.reduce((m,e)=>{const c=cycleCellOf(v,e,columnId);if(c.status!=='ok')return m;const r=c.change_kind==='bp'?Number(c.change_text):c.change_raw;return r!==null&&Number.isFinite(r)?Math.max(m,Math.abs(r)):m;},0);
}
/** Column medians for the small chart (display only; each column on its own scale). */
export function columnMedians(v:CycleTableView):{id:string;label:Bilingual;kind:'pct'|'bp';n:number;median:number|null;scaleMax:number}[]{
 return v.columns.map(c=>{
  const vals=v.episodes.map(e=>cycleCellOf(v,e,c.id)).flatMap(x=>x.status!=='ok'?[]:[x.change_kind==='bp'?Number(x.change_text):x.change_raw])
   .filter((x):x is number=>x!==null&&Number.isFinite(x)).sort((a,b)=>a-b);
  return {id:c.id,label:c.label,kind:c.change_kind,n:vals.length,median:vals.length?quantile7(vals,0.5):null,scaleMax:vals.reduce((m,x)=>Math.max(m,Math.abs(x)),0)};
 });
}
/** Horizontal bar from a centre line at `half`: x is the bar's left edge in [0, 2·half]. */
export function barGeometry(median:number|null,scaleMax:number,half:number):{x:number;width:number}{
 if(median===null||!(scaleMax>0))return {x:half,width:0};
 const width=Math.min(1,Math.abs(median)/scaleMax)*half;
 return {x:median<0?half-width:half,width};
}
/** Empty episode list: an explicit truncation notice when the event history read was truncated, else "no episodes". */
export function episodesEmptyKey(v:CycleTableView):string|null{
 if(v.episodes.length>0)return null;
 return v.gaps.some(g=>g.kind==='history_truncated')?'history.eventsTruncated':'history.noEpisodes';
}
export interface CycleGroupRow{key:string;episode:string;line:string;flags:string[];cell:CellDisplay;refs:ObsRef[];drillTitle:string}
/** Mobile (< 640px) list per column: keeps the episode line, its left-censored / ongoing / gap flags and the endpoint drill. */
export function cycleGroups(v:CycleTableView,t:StrategyT,l:Locale):{id:string;label:string;rows:CycleGroupRow[]}[]{
 return v.columns.map(c=>({id:c.id,label:c.label[l],rows:v.episodes.map(e=>{
  const ev=episodeView(e,t),cell=cycleCell(cycleCellOf(v,e,c.id),t),episode=`${ev.direction} ${ev.dates}`;
  return {key:ev.key,episode,line:ev.line,flags:ev.flags,cell,refs:cell.refs,drillTitle:t('history.cellTitle',{episode,column:c.label[l]})};})}));
}
// ---- monthly review (spec §3.5, §6.2)
export const REVIEW_SECTIONS=['releases','revisions','timeliness','policy_events','episode_changes','asset_moves','coverage'] as const;
export type ReviewSectionKey=typeof REVIEW_SECTIONS[number];
export function reviewSections(f:ReviewFacts,render:(fact:Fact)=>string):{key:ReviewSectionKey;titleKey:string;items:{factId:string;text:string;seriesId:string|null}[];emptyKey:string|null}[]{
 return REVIEW_SECTIONS.map(key=>{
  const gap=f.baseline_missing&&(key==='releases'||key==='revisions');
  const items=gap?[]:f[key].map(fact=>({factId:fact.fact_id,text:render(fact),seriesId:fact.series_id??null}));
  return {key,titleKey:`review.section.${key}`,items,emptyKey:gap?'review.baselineMissing':items.length===0?'review.empty':null};
 });
}
/** Closed months, newest first (the current UTC month is never listed). */
export function closedMonths(now:Date,n:number):string[]{
 const out:string[]=[];
 for(let i=1;i<=n;i++){const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-i,1));out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`);}
 return out;
}
export interface IndexCell{status:'ok'|'insufficient'|'none';updatedAt:string|null;generation:number|null}
export function reviewGrid(months:string[],us:ReviewIndexItem[],cn:ReviewIndexItem[]):{month:string;US:IndexCell;CN:IndexCell}[]{
 const cell=(list:ReviewIndexItem[],m:string):IndexCell=>{const i=list.find(x=>x.month===m);return i?{status:i.status,updatedAt:i.updated_at,generation:i.generation}:{status:'none',updatedAt:null,generation:null};};
 return months.map(m=>({month:m,US:cell(us,m),CN:cell(cn,m)}));
}
// ---- explanation panel (spec §3.6, §6.3)
export type PanelState='none'|'running'|'accepted'|'rejected'|'failed';
export function panelState(p:ExplanationProjection|null):PanelState{
 if(!p)return 'none';
 return p.state==='abandoned'?'failed':p.state;
}
/** Newest projection in the page locale (the list arrives newest first). */
export const latestFor=(items:ExplanationProjection[],l:Locale):ExplanationProjection|null=>items.find(p=>p.locale===l)??null;
/** Citation into the explanation's own frozen manifest (its explain_facts manifest, spec §3.6): the fact_id is the stable key in manifest.facts. */
export const factCitation=(manifestId:string,factId:string):string=>`${strategyApi.manifest(manifestId)}#fact=${encodeURIComponent(factId)}`;
export function renderedSections(r:RenderedExplanation,manifestId:string):{facts:{n:number;factId:string;text:string;href:string}[];hypotheses:{text:string;refs:number[];factIds:string[]}[];counterpoints:{text:string;refs:number[];factIds:string[]}[]}{
 const index=new Map(r.facts.map((f,i)=>[f.fact_id,i+1]));
 const refs=(ids:string[])=>ids.map(id=>index.get(id)).filter((n):n is number=>n!==undefined);
 const known=(ids:string[])=>ids.filter(id=>index.has(id));
 return {facts:r.facts.map((f,i)=>({n:i+1,factId:f.fact_id,text:f.text,href:factCitation(manifestId,f.fact_id)})),
  hypotheses:r.hypotheses.map(h=>({text:h.text,refs:refs(h.fact_ids),factIds:known(h.fact_ids)})),counterpoints:r.counterpoints.map(c=>({text:c.text,refs:refs(c.fact_ids),factIds:known(c.fact_ids)}))};
}
export function headerLine(p:ExplanationProjection,t:StrategyT):string{
 return t('explain.header',{subject:t(`explain.subject.${p.subject_kind}`,{id:shortId(p.subject_id)}),manifest:shortId(p.manifest_id),
  model:p.provider&&p.model?`${p.provider}/${p.model}`:MISSING,prompt:p.prompt_version,validator:p.validator_version});
}
/** Failure codes of Task 10 (validator) and Task 11 (run lifecycle and the perspectives cost errors). */
export const KNOWN_FAILURES:readonly string[]=['parse','schema','unknown_fact','numeral','forbidden_term','regime_term','abandoned','provider_error','validator_version_changed',
 'usage_audit_unavailable','usage_audit_invariant','daily_cost_exhausted','pricing_unavailable','budget_unavailable','budget_invariant_violation'];
export const failureLabel=(code:string,t:StrategyT):string=>KNOWN_FAILURES.includes(code)?t(`explain.failure.${code}`):code;
/** Today's remaining runs of the shared 'perspectives' quota from GET /api/usage/today; limit -1 = unlimited. */
export function remainingToday(body:unknown):{kind:'unlimited'}|{kind:'count';n:number}|null{
 const p=(body as {usage?:{perspectives?:{used?:unknown;limit?:unknown}}}|null)?.usage?.perspectives;
 if(!p||typeof p.used!=='number'||typeof p.limit!=='number')return null;
 return p.limit===-1?{kind:'unlimited'}:{kind:'count',n:Math.max(0,p.limit-p.used)};
}
/** A request id is reused only to retry after an ambiguous outcome (pending); otherwise every submit is a new request. */
export const nextRequestId=(pending:string|null,gen:()=>string):string=>pending??gen();
/** A held request id: bound to the subject and locale it was minted for (a different payload under the same id would be a 409). */
export interface PendingRequest{key:string;id:string}
export const explainPendingKey=(subject:{kind:string;id:string},locale:Locale):string=>`${subject.kind}:${subject.id}:${locale}`;
export const pendingFor=(pending:PendingRequest|null,subject:{kind:string;id:string},locale:Locale):string|null=>pending&&pending.key===explainPendingKey(subject,locale)?pending.id:null;
const REFUSED_CODES:readonly string[]=['quota_exceeded','llm_not_configured','no_facts','subject_not_found','payload_conflict','invalid_body','unauthorized'];
export type ExplainOutcome=
 |{kind:'done';projection:ExplanationProjection}
 |{kind:'run_failed';projection:ExplanationProjection;code:string}   // the server finished the run as failed (its projection came back)
 |{kind:'refused';code:string}                                       // definitively not started (4xx / known code): a new request is right
 |{kind:'ambiguous';code:string};                                    // 5xx / gateway / network / unreadable: the run may have completed server-side
/** status null = the fetch itself threw. Only an ambiguous outcome keeps the idempotency key (spec §6.3). */
export function explainOutcome(status:number|null,body:unknown):ExplainOutcome{
 if(status===null)return {kind:'ambiguous',code:'network'};
 if(status>=200&&status<300){
  const p=(body as {explanation_id?:unknown}|null)?.explanation_id;
  return typeof p==='string'?{kind:'done',projection:body as ExplanationProjection}:{kind:'ambiguous',code:'unreadable'};
 }
 const code=errorCode(body)??`http_${status}`;
 const failed=projectionOfError(body);
 if(failed)return {kind:'run_failed',projection:failed,code};
 if(REFUSED_CODES.includes(code)||(status>=400&&status<500&&status!==408))return {kind:'refused',code};
 return {kind:'ambiguous',code};
}
export async function submitExplanation(deps:{fetch:typeof fetch;gen:()=>string},pending:PendingRequest|null,subject:{kind:'snapshot'|'review';id:string},locale:Locale):Promise<{pending:PendingRequest|null;outcome:ExplainOutcome}>{
 const id=nextRequestId(pendingFor(pending,subject,locale),deps.gen);
 const held:PendingRequest={key:explainPendingKey(subject,locale),id};
 let outcome:ExplainOutcome;
 try{
  const r=await deps.fetch('/api/macro/strategy/explanations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({request_id:id,subject,locale})});
  const body:unknown=await r.json().catch(()=>undefined);
  outcome=explainOutcome(r.status,body===undefined?null:body);
 }catch{outcome=explainOutcome(null,null);}
 return {pending:outcome.kind==='ambiguous'?held:null,outcome};
}
export type PanelPhase=PanelState|'loading'|'readError';
/** Phase, button state and reload offer of the panel: nothing is "not generated" until the existing-run lookup has succeeded. */
export function explainControls(i:{busy:boolean;listKind:LoadState<unknown>['kind'];hasCurrent:boolean;projection:ExplanationProjection|null;pending:boolean}):{phase:PanelPhase;canGenerate:boolean;showGenerate:boolean;showReload:boolean}{
 const phase:PanelPhase=i.busy?'running':i.hasCurrent||i.listKind==='ok'?panelState(i.projection):i.listKind==='loading'?'loading':'readError';
 const lookupFailed=phase==='readError',lookingUp=phase==='loading';
 return {phase,showGenerate:phase!=='running',showReload:lookupFailed,
  canGenerate:!i.busy&&phase!=='running'&&(i.pending||(!lookupFailed&&!lookingUp))};
}
export const generateLabelKey=(state:PanelState,error:string|null,held:boolean):string=>held?'explain.retry':state==='none'&&!error?'explain.generate':'explain.regenerate';
const EXPLAIN_ERRORS:Record<string,string>={quota_exceeded:'explain.quota',llm_not_configured:'explain.noModel',no_facts:'explain.noFacts',subject_not_found:'explain.noSubject'};
export function explainErrorText(code:string,t:StrategyT):string{
 if(code==='payload_conflict')return t('explain.conflict',{code});
 return EXPLAIN_ERRORS[code]?t(EXPLAIN_ERRORS[code]):t('explain.error',{code});
}
/** A failed POST may still carry the run's projection ({error, explanation}: usage-run failures, spec §6.3 step 6). */
export function projectionOfError(body:unknown):ExplanationProjection|null{
 const p=(body as {explanation?:unknown}|null)?.explanation;
 return typeof p==='object'&&p!==null&&typeof (p as {explanation_id?:unknown}).explanation_id==='string'?p as ExplanationProjection:null;
}
// ---- deviation cases (spec §6.4): input differences only, unchanged rows folded by default
const KIND_ORDER:Record<DiffKind,number>={revised:0,dropped:1,newly_available:2,unchanged:3};
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
export function deviationRows(c:DeviationCase,showUnchanged:boolean):{hiddenUnchanged:number;rows:{key:string;series:string;period:string;roleKey:string;kindKey:string;subkindKey:string|null;registered:string;settled:string}[]}{
 const all=[...c.diffs].sort((a,b)=>KIND_ORDER[a.kind]-KIND_ORDER[b.kind]||cmp(a.series_id,b.series_id)||cmp(a.period_end,b.period_end));
 const visible=showUnchanged?all:all.filter(d=>d.kind!=='unchanged');
 const side=(s:{vintage_id:string;value:number}|null)=>s?`${s.vintage_id} · ${s.value}`:MISSING;
 return {hiddenUnchanged:all.length-visible.length,rows:visible.map(d=>({key:`${d.series_id}:${d.period_end}:${d.role}`,series:d.series_id,period:d.period_end,roleKey:`deviation.role.${d.role}`,
  kindKey:`deviation.kind.${d.kind}`,subkindKey:d.subkind?`deviation.subkind.${d.subkind}`:null,registered:side(d.registered),settled:side(d.settled)}))};
}
