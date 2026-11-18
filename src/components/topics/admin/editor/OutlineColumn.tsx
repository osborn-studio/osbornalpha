// Topic plan T5.5: ordered sections, evidence and expected slots with keyboard parity.
'use client';
import {useState,type Dispatch,type KeyboardEvent} from 'react';
import {useTranslations} from 'next-intl';
import {StateBadge} from '@/components/research-ui';
import {SLOT_REASONS,type DraftBody,type ExpectedSlot} from '@/lib/topics/types';
import type {EvidenceView} from '@/lib/topics/evidence-search';
import type {ResolveState} from '@/lib/evidence/resolve';
import {nextSectionKey,type EditorAction} from './editor-state';
import {BUTTON,INPUT,PANEL} from './FlowBar';
export const KINDS=['macro_observation','industry_metric','financial_fact','document_citation','judgment','broker_report_meta'] as const;
export function EvidenceState({state}:{state:ResolveState}){
 const t=useTranslations('topicsAdmin');
 if(state==='ok'||state==='unsupported')return <span className={`shrink-0 whitespace-nowrap rounded border border-border px-1 text-xs ${state==='unsupported'?'border-dashed':''}`}>{t(`state.${state}`)}</span>;
 return <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">{state==='withheld'&&<span className="text-xs text-text-dim">{t('picker.public')}</span>}<StateBadge state={state==='not_served'?'notServed':state}/></span>;
}
export function OutlineColumn({body,evidence,locale,dispatch,readOnly}:{body:DraftBody;evidence:EvidenceView[];locale:'zh'|'en';dispatch:Dispatch<EditorAction>;readOnly:boolean}){
 const t=useTranslations('topicsAdmin'),[announcement,setAnnouncement]=useState(''),[dragged,setDragged]=useState<string|null>(null),[form,setForm]=useState(false);
 const [section,setSection]=useState(''),[kind,setKind]=useState<ExpectedSlot['kind']>('industry_metric'),[label,setLabel]=useState({zh:'',en:''}),[reason,setReason]=useState<ExpectedSlot['reason_code']|''>('');
 const target=body.sections.some(s=>s.key===section)?section:body.sections[0]?.key??'';
 function moveSection(key:string,dir:-1|1){
  if(readOnly)return;const n=body.sections.findIndex(s=>s.key===key),m=Math.max(0,Math.min(body.sections.length-1,n+dir));
  dispatch({type:'moveSection',key,dir});setAnnouncement(t('editor.moved',{n:n+1,m:m+1}));
 }
 function keyMove(e:KeyboardEvent,action:(dir:-1|1)=>void){if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();if(!readOnly)action(e.key==='ArrowUp'?-1:1);}}
 return <section className={PANEL} aria-labelledby="editor-outline"><h2 id="editor-outline" className="font-semibold">{t('editor.outline')}</h2>
  <ol className="space-y-2">{body.sections.map((s,index)=><li key={s.key} className="min-w-0 rounded border border-border p-2" draggable={!readOnly} onDragStart={e=>{setDragged(s.key);e.dataTransfer.setData('text/plain',s.key);}} onDragEnd={()=>setDragged(null)} onDragOver={e=>{if(!readOnly)e.preventDefault();}} onDrop={e=>{
   e.preventDefault();if(readOnly||!dragged)return;const from=body.sections.findIndex(v=>v.key===dragged);if(from<0)return;
   const dir=from<index?1:-1;for(let n=0;n<Math.abs(index-from);n++)dispatch({type:'moveSection',key:dragged,dir});setAnnouncement(t('editor.moved',{n:from+1,m:index+1}));setDragged(null);
  }}>
   <div className="flex items-start gap-1"><button type="button" className={BUTTON} disabled={readOnly} aria-label={t('editor.drag',{n:index+1})} onKeyDown={e=>keyMove(e,dir=>moveSection(s.key,dir))}>⠿</button><h3 className="min-w-0 break-words text-sm font-semibold">{t('editor.section',{n:index+1,title:s.title[locale]})}</h3></div>
   <ul className="mt-2 space-y-2">{s.items.map((item,i)=>{
    const ev='ordinal' in item?evidence.find(e=>e.ordinal===item.ordinal):null,slot='expected_slot' in item?body.expected_slots.find(v=>v.key===item.expected_slot):null;
    const itemLabel='ordinal' in item?`ev:${item.ordinal}`:item.expected_slot;
    const onKey=(e:KeyboardEvent)=>keyMove(e,dir=>{dispatch({type:'moveItem',section:s.key,index:i,dir});setAnnouncement(t('editor.itemMoved',{item:itemLabel,m:Math.max(0,Math.min(s.items.length-1,i+dir))+1}));});
    return <li key={itemLabel} tabIndex={0} onKeyDown={onKey} className={`flex min-h-8 min-w-0 items-center gap-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${slot?'flex-wrap break-words rounded border border-dashed border-border p-1':''}`}>
     <button type="button" className={`${BUTTON} shrink-0 px-1 text-xs`} aria-label={t('editor.move',{item:itemLabel})} disabled={readOnly}>⠿</button>
     {'ordinal' in item?<><span className="shrink-0 font-mono tabular-nums">ev:{item.ordinal}</span><span className="min-w-0 flex-1 truncate" title={`${ev?.label[locale]??''}${ev?.period?` · ${ev.period}`:''}`}>· {ev?.label[locale]}{ev?.period&&<> · <span className="font-mono tabular-nums">{ev.period}</span></>}</span>{ev&&<EvidenceState state={ev.state}/>}</>:slot&&<span>{t('editor.slot',{reason:t(`slotReason.${slot.reason_code}`)})} · {slot.label[locale]}</span>}
     <button type="button" className={`${BUTTON} ml-auto shrink-0 whitespace-nowrap px-1 text-xs`} disabled={readOnly} onClick={()=>dispatch('ordinal' in item?{type:'removeEvidence',ordinal:item.ordinal}:{type:'removeSlot',key:item.expected_slot})}>{t('editor.remove')}</button>
    </li>;
   })}</ul>
   <button type="button" className={`${BUTTON} mt-2 text-text-dim`} disabled={readOnly} onClick={()=>{if(window.confirm(t('editor.confirmDelete')))dispatch({type:'removeSection',key:s.key});}}>{t('editor.deleteSection')}</button>
  </li>)}</ol>
  <div className="flex flex-wrap gap-2"><button type="button" className={BUTTON} disabled={readOnly||body.sections.length>=20} onClick={()=>dispatch({type:'addSection',key:nextSectionKey(body)})}>{t('editor.addSection')}</button><button type="button" className={BUTTON} disabled={readOnly||!body.sections.length||body.expected_slots.length>=50} onClick={()=>setForm(!form)}>{t('editor.addSlot')}</button></div>
  {form&&<form className="space-y-2" onSubmit={e=>{e.preventDefault();if(!target||!reason||readOnly)return;let n=1;while(body.expected_slots.some(s=>s.key===`slot-${n}`))n++;dispatch({type:'addSlot',section:target,slot:{key:`slot-${n}`,kind,label,reason_code:reason}});setForm(false);}}>
   <label className="block text-xs">{t('editor.sectionSelect')}<select className={INPUT} value={target} onChange={e=>setSection(e.target.value)}>{body.sections.map((s,i)=><option key={s.key} value={s.key}>{i+1} · {s.title[locale]}</option>)}</select></label>
   <label className="block text-xs">{t('editor.kind')}<select className={INPUT} value={kind} onChange={e=>setKind(e.target.value as ExpectedSlot['kind'])}>{KINDS.map(k=><option key={k} value={k}>{t(`kind.${k}`)}</option>)}</select></label>
   {(['zh','en'] as const).map(loc=><label className="block text-xs" key={loc}>{t(loc==='zh'?'editor.labelZh':'editor.labelEn')}<input className={INPUT} value={label[loc]} maxLength={120} onChange={e=>setLabel({...label,[loc]:e.target.value})}/></label>)}
   <label className="block text-xs">{t('editor.reason')}<select required className={INPUT} value={reason} onChange={e=>setReason(e.target.value as typeof reason)}><option value="">{t('editor.chooseReason')}</option>{SLOT_REASONS.map(r=><option key={r} value={r}>{t(`slotReason.${r}`)}</option>)}</select></label>
   <button className={BUTTON} type="submit" disabled={readOnly}>{t('editor.confirmSlot')}</button> <button type="button" className={BUTTON} onClick={()=>setForm(false)}>{t('editor.cancel')}</button>
  </form>}
  <p className="text-xs text-text-muted">{t('editor.help')}</p><p aria-live="polite" className="sr-only">{announcement}</p>
 </section>;
}
