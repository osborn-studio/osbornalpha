// Topic plan T6.8: public reason and private audit note.
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {UNPUBLISH_REASONS,type UnpublishReason} from '@/lib/topics/types';
import {BUTTON,INPUT} from '../editor/FlowBar';
import {Modal,type DialogActions} from './PublishDialog';
export type Withdrawal={reason:UnpublishReason;note:string|null};
export function WithdrawalFields({reason,setReason,note,setNote}:{reason:UnpublishReason;setReason:(r:UnpublishReason)=>void;note:string;setNote:(s:string)=>void}){
 const t=useTranslations('topicsAdmin.publish');
 return <><label className="block">{t('reasonLabel')}<select className={INPUT} value={reason} onChange={e=>setReason(e.target.value as UnpublishReason)}>{UNPUBLISH_REASONS.map(r=><option key={r} value={r}>{t('reason.'+r)}</option>)}</select></label>
  <label className="block">{t('note')}<input className={INPUT} value={note} maxLength={200} onChange={e=>setNote(e.target.value)}/></label></>;
}
export function UnpublishDialog({n,previous,busy,error,onClose,onConfirm}:DialogActions&{n:number;previous:number|null;onConfirm:(body:Withdrawal)=>void}){
 const t=useTranslations('topicsAdmin.publish'),[reason,setReason]=useState<UnpublishReason>('error'),[note,setNote]=useState('');
 return <Modal title={previous===null?t('unpublishLast',{n}):t('unpublishTitle',{n,m:previous})} busy={busy} onClose={onClose}>
  <WithdrawalFields {...{reason,setReason,note,setNote}}/><p>{t('withdrawHint')}</p>{error}
  <div className="flex gap-2"><button className={`${BUTTON} text-danger font-mono tabular-nums`} disabled={busy} onClick={()=>onConfirm({reason,note:note||null})}>{t('unpublishVersion',{n})}</button>
   <button className={BUTTON} disabled={busy} onClick={onClose}>{t('back')}</button></div>
 </Modal>;
}
