// Topic plan T5.5: explicit save and the staged publication flow.
'use client';
import {useTranslations} from 'next-intl';
export const BUTTON='min-h-8 rounded border border-border px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50';
export const INPUT='block min-h-9 w-full min-w-0 rounded border border-border bg-bg-card px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
export const PANEL='min-w-0 space-y-3 rounded-lg border border-border bg-bg-card p-3';
type Props={publishHref:string;editorHref:string}|{publishHref:string;dirty:boolean;pending:boolean;readOnly:boolean;onSave:()=>void};
export function FlowBar(props:Props){
 const t=useTranslations('topicsAdmin'),editor='onSave' in props?props:null;
 const anchors={check:'disclosure',summary:'summary',approve:'summary',preview:'preview',publish:'publish'};
 return <nav aria-label={t('flow.label')} className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg-card p-3">
  {'editorHref' in props?<a className={`${BUTTON} font-mono tabular-nums`} href={props.editorHref}>{t('flow.save')}</a>:
   <button className={`${BUTTON} font-mono tabular-nums`} disabled={props.pending||props.readOnly} onClick={props.onSave}>{t('flow.save')} {props.dirty?t('flow.dirty'):'✓'}</button>}
  {Object.entries(anchors).map(([step,anchor])=><a key={step} className={`${BUTTON} text-accent font-mono tabular-nums`} href={`${props.publishHref}#${anchor}`}>{t(`flow.${step}`)}</a>)}
  {editor&&<><button className={`${BUTTON} ml-auto`} disabled={editor.pending||editor.readOnly} onClick={editor.onSave}>{t(editor.pending?'editor.saving':'editor.save')}</button>
   <a className={`${BUTTON} border-accent text-accent`} href={props.publishHref+'#disclosure'}>{t('flow.run')}</a></>}
 </nav>;
}
