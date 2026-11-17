import type {CycleTableView, ObsRef} from '@/lib/macro/strategy/contract';
import {cycleCell, cycleCellOf, episodeView, formatBpText, type Locale, type StrategyT} from './strategy-view-model';

export const CYCLE_NOTES_VERSION='macro-cycle-notes/1';
export interface CycleNoteSentence {key:string;text:string;refs:ObsRef[]}
export interface CycleNote {episodeKey:string;title:string;sentences:CycleNoteSentence[]}

/** Only table DTO inputs are used. Episode metadata has no observation refs in this DTO. */
export function cycleNotes(view:CycleTableView,locale:Locale,t:StrategyT):CycleNote[]{
 return view.episodes.map(episode=>{
  const ev=episodeView(episode,t);
  const columns=view.columns.map(column=>{
   const cell=cycleCellOf(view,episode,column.id);
   return {column,cell,display:cycleCell(cell,t)};
  });
  const available=columns.filter(c=>c.cell.status==='ok');
  const refsOf=(items:typeof columns):ObsRef[]=>Array.from(new Map(items.flatMap(c=>c.display.refs).map(r=>[r.observation_id,r])).values());
  const sentences:CycleNoteSentence[]=[{
   key:'episode',text:t('cycleNotes.episode',{direction:ev.direction,start:episode.start,end:episode.end,n:episode.events,bp:formatBpText(episode.cumulative_bp)})+
    (ev.flags.length?t('cycleNotes.flags',{flags:ev.flags.map(k=>t(k)).join(' · ')}):''),refs:[],
  }];
  for(const {column,cell,display} of columns){
   sentences.push({key:`column:${column.id}`,text:cell.status==='ok'
    ?t('cycleNotes.interval',{column:column.label[locale],from:cell.from.period_end,to:cell.to.period_end,value:display.main})
    :t('cycleNotes.missing',{column:column.label[locale],reason:display.sub??display.main}),refs:display.refs});
  }
  for(const unit of ['pct','bp'] as const){
   const candidates=available.filter(c=>c.cell.status==='ok'&&c.cell.change_kind===unit&&c.display.raw!==null&&Number.isFinite(c.display.raw));
   if(candidates.length<2)continue;
   // Strict comparisons preserve the visible column order for ties.
   const rise=candidates.reduce((best,c)=>c.display.raw! > best.display.raw! ? c : best);
   const fall=candidates.reduce((best,c)=>c.display.raw! < best.display.raw! ? c : best);
   for(const [key,winner,eligible] of [['largestRise',rise,rise.display.raw! > 0],['largestFall',fall,fall.display.raw! < 0]] as const){
    if(eligible)sentences.push({key:`${key}:${unit}`,text:t(`cycleNotes.${key}`,{unit:unit==='pct'?'%':'bp',column:winner.column.label[locale],value:winner.display.main}),refs:refsOf(candidates)});
   }
  }
  sentences.push({key:'coverage',text:t('cycleNotes.coverage',{n:available.length,total:columns.length}),refs:refsOf(columns)});
  return {episodeKey:ev.key,title:`${ev.direction} ${ev.dates}`,sentences};
 });
}
