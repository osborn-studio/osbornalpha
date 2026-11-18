// Topic plan T5.5: explicit save and the staged publication flow.
'use client';
import {useTranslations} from 'next-intl';
export const BUTTON='min-h-8 rounded border border-border px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50';
export const INPUT='block min-h-9 w-full min-w-0 rounded border border-border bg-bg-card px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
export const PANEL='min-w-0 space-y-3 rounded-lg border border-border bg-bg-card p-3';
export function FlowBar({dirty,pending,readOnly,onSave,publishHref}:{dirty:boolean;pending:boolean;readOnly:boolean;onSave:()=>void;publishHref?:string}){
 const t=useTranslations('topicsAdmin');
 return <nav aria-label={t('flow.label')} className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-bg-card p-3">
  <button type="button" className={`${BUTTON} font-mono tabular-nums`} disabled={pending||readOnly} onClick={onSave}>{t('flow.save')} {dirty?t('flow.dirty'):'✓'}</button>
  {(['check','summary','approve','preview','publish'] as const).map(step=><a key={step} className={`${BUTTON} inline-flex items-center font-mono tabular-nums ${publishHref?'text-accent':'text-text-muted'}`} href={publishHref} aria-disabled={!publishHref} tabIndex={publishHref?0:-1}>{t(`flow.${step}`)}</a>)}
  {!publishHref&&<span className="text-xs text-text-muted">{t('flow.later')}</span>}
  <button type="button" className={`${BUTTON} ml-auto`} disabled={pending||readOnly} onClick={onSave}>{t(pending?'editor.saving':'editor.save')}</button>
  {publishHref?<a className={`${BUTTON} inline-flex items-center border-accent text-accent`} href={publishHref}>{t('flow.run')}</a>:<button type="button" disabled className={`${BUTTON} border-accent text-accent`}>{t('flow.run')}</button>}
 </nav>;
}
