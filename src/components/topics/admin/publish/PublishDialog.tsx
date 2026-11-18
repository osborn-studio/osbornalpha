// Topic plan T6.8: native modal and frozen-version confirmation.
import {useEffect,useRef,type ReactNode} from 'react';
import {useTranslations} from 'next-intl';
import {BUTTON,PANEL} from '../editor/FlowBar';
import {MONO} from './DisclosureTable';
import type {publishModel} from './publish-model';
export interface DialogActions{busy:boolean;error:ReactNode;onClose:()=>void}
export function Modal({title,children,onClose,busy}:{title:string;children:ReactNode;onClose:()=>void;busy:boolean}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(!ref.current?.open)ref.current?.showModal();},[]);
 return <dialog ref={ref} aria-labelledby="topic-dialog-title" onCancel={e=>{if(busy)e.preventDefault();}} onClose={onClose}
  className={`${PANEL} fixed inset-0 m-auto max-h-[90vh] w-full max-w-md overflow-y-auto p-5 text-text backdrop:bg-bg backdrop:opacity-80`}>
  <h2 id="topic-dialog-title" className="text-lg font-semibold font-mono tabular-nums">{title}</h2>{children}
 </dialog>;
}
export function PublishDialog({title,n,summary,busy,error,onClose,onConfirm}:DialogActions&{title:string;n:number;summary:NonNullable<ReturnType<typeof publishModel>['dialog']>;onConfirm:()=>void}){
 const t=useTranslations('topicsAdmin.publish');
 return <Modal title={t('publishTitle',{title,n})} busy={busy} onClose={onClose}>
  <dl className="grid grid-cols-2 gap-2 text-sm"><dt>{t('frozen')}</dt><dd className={MONO}>{t('evidenceCount',{n:summary.evidence})}</dd>
   <dt>{t('distribution')}</dt><dd>{summary.distribution.map(({state,n})=><span className="mr-2 inline-block" key={state}>{t('state.'+state)} <b className={MONO}>{n}</b></span>)}</dd>
   <dt>{t('slots')}</dt><dd className={MONO}>{t('slotCount',{n:summary.slots})}</dd><dt>{t('summary')}</dt><dd>{t('noSummary')}</dd></dl>
  <p>{t('immutable')}</p>{error}<div className="flex gap-2"><button className={`${BUTTON} border-accent text-accent ${MONO}`} disabled={busy} onClick={onConfirm}>{t('publishVersion',{n})}</button>
   <button className={BUTTON} disabled={busy} onClick={onClose}>{t('cancel')}</button></div>
 </Modal>;
}
