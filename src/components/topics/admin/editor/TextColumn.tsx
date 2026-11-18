// Topic plan T5.5: bilingual owner text, caret insertion and field-level server findings.
'use client';
import {useRef,useState,type Dispatch} from 'react';
import {useTranslations} from 'next-intl';
import type {DraftBody} from '@/lib/topics/types';
import type {EvidenceView} from '@/lib/topics/evidence-search';
import type {LintFinding} from '@/lib/topics/drafts';
import {fieldText,type EditorAction} from './editor-state';
import {findingsByField} from './lint-model';
import {BUTTON,INPUT,PANEL} from './FlowBar';
export function TextColumn({body,evidence,lint,busy,locale,setLocale,dispatch,readOnly}:{body:DraftBody;evidence:EvidenceView[];lint:LintFinding[];busy:boolean;locale:'zh'|'en';setLocale:(locale:'zh'|'en')=>void;dispatch:Dispatch<EditorAction>;readOnly:boolean}){
 const t=useTranslations('topicsAdmin'),[menu,setMenu]=useState(false),[focused,setFocused]=useState<string|null>(null);
 const caret=useRef({field:'',at:0}),fields=useRef(new Map<string,HTMLInputElement|HTMLTextAreaElement>()),findings=findingsByField(lint,evidence);
 function insert(ordinal:number,part:'value'|'period'){
  const {field,at}=caret.current;if(!field||readOnly)return;const token=`{{ev:${ordinal}${part==='period'?'.period':''}}}`;
  dispatch({type:'insertSlotText',field,at,ordinal,part});setMenu(false);
  requestAnimationFrame(()=>{const input=fields.current.get(field);input?.focus();input?.setSelectionRange(at+token.length,at+token.length);caret.current={field,at:at+token.length};});
 }
 function field(path:string,label:string,action:(value:string)=>EditorAction,multiline=false,maxLength=120){
  const props={id:`field-${path}`,value:fieldText(body,path)??'',disabled:readOnly,maxLength,lang:locale,className:INPUT,
   ref:(el:HTMLInputElement|HTMLTextAreaElement|null)=>{if(el)fields.current.set(path,el);else fields.current.delete(path);},
   onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>dispatch(action(e.target.value)),
   onFocus:(e:React.FocusEvent<HTMLInputElement|HTMLTextAreaElement>)=>{setFocused(path);caret.current={field:path,at:e.target.selectionStart??0};},
   onBlur:(e:React.FocusEvent<HTMLInputElement|HTMLTextAreaElement>)=>{caret.current={field:path,at:e.target.selectionStart??0};}};
  return <div key={path} className="space-y-1"><label htmlFor={props.id} className="block text-xs text-text-dim">{label}</label>{multiline?<textarea {...props} rows={7}/>:<input {...props} type="text"/>}
   <ul role="status" aria-busy={busy} className="space-y-1">{(findings[path]??[]).map((f,i)=><li key={`${f.code}-${f.match}-${i}`} className="break-words rounded border border-danger p-2 text-xs text-danger">
    <b>{t(`lint.${f.code}`)}</b> <span className="font-mono tabular-nums">{f.code}</span> “{f.match}”
    {f.fix&&<button type="button" className={`${BUTTON} ml-1`} disabled={readOnly} onClick={()=>dispatch({type:'replaceWithSlot',field:path,match:f.match,ordinal:f.fix!.ordinal})}>{t('lint.replace',{slot:`{{ev:${f.fix.ordinal}}}`})}</button>}
   </li>)}</ul>
  </div>;
 }
 return <section className={PANEL} aria-labelledby="editor-text"><div className="flex flex-wrap items-center gap-2"><h2 id="editor-text" className="font-semibold">{t('editor.text')}</h2>
  <div role="group" aria-label={t('editor.locale')} className="ml-auto flex gap-1">{(['zh','en'] as const).map(loc=><button type="button" key={loc} aria-pressed={locale===loc} className={`${BUTTON} ${locale===loc?'border-accent text-accent':''}`} onClick={()=>{setLocale(loc);setFocused(null);caret.current={field:'',at:0};setMenu(false);}}>{loc==='zh'?'中':'EN'}</button>)}</div>
  <button type="button" className={`${BUTTON} font-mono tabular-nums`} disabled={readOnly} aria-expanded={menu} onClick={()=>setMenu(!menu)}>{t('editor.insertEvidence',{slot:'{{ev:n}}'})}</button>
 </div>
 {menu&&<div className="space-y-1 rounded border border-border p-2">{!focused&&<p className="text-xs text-text-muted">{t('editor.focusField')}</p>}{body.evidence.map(ev=><div key={ev.ordinal} className="flex flex-wrap items-center gap-1 text-xs"><span className="font-mono tabular-nums">ev:{ev.ordinal}</span> {evidence.find(e=>e.ordinal===ev.ordinal)?.label[locale]} {(['value','period'] as const).map(part=><button type="button" key={part} className={BUTTON} disabled={!focused} onClick={()=>insert(ev.ordinal,part)}>{t(`editor.${part}`)}</button>)}</div>)}</div>}
 {field(`title.${locale}`,t('editor.titleField'),value=>({type:'setTitle',locale,value}))}
 {field(`dek.${locale}`,t('editor.dek'),value=>({type:'setDek',locale,value}),false,240)}
 {body.sections.map((s,i)=><div key={s.key} className="space-y-2 border-t border-border pt-3">
  {field(`sections.${s.key}.title.${locale}`,t('editor.sectionTitle',{n:i+1}),value=>({type:'setSectionTitle',key:s.key,locale,value}))}
  {field(`sections.${s.key}.note.${locale}`,t('editor.sectionNote',{n:i+1}),value=>({type:'setSectionNote',key:s.key,locale,value}),true,4000)}
 </div>)}
 {body.entries.map((entry,i)=>entry.entry_type==='owner_note'&&<div key={entry.key} className="space-y-2 border-t border-border pt-3">
  {field(`entries.${entry.key}.body.${locale}`,t('editor.ownerNote',{n:i+1}),value=>({type:'setOwnerNote',key:entry.key,locale,value}),true,4000)}
  <button type="button" className={BUTTON} disabled={readOnly} onClick={()=>dispatch({type:'removeEntry',key:entry.key})}>{t('editor.deleteNote')}</button>
 </div>)}
 <button type="button" className={BUTTON} disabled={readOnly||body.entries.length>=50} onClick={()=>{let n=1;while(body.entries.some(e=>e.key===`note-${n}`))n++;dispatch({type:'addOwnerNote',key:`note-${n}`});}}>{t('editor.addOwnerNote')}</button>
 <p className="text-xs text-text-muted">{t('editor.footer')}</p>
 </section>;
}
