// Topic plan T6.8 / X11: retirement needs the exact reserved slug.
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import type {UnpublishReason} from '@/lib/topics/types';
import {BUTTON,INPUT} from '../editor/FlowBar';
import {Modal,type DialogActions} from './PublishDialog';
import {WithdrawalFields,type Withdrawal} from './UnpublishDialog';
import {retireEnabled} from './publish-model';
import {MONO} from './DisclosureTable';
export function RetireDialog({title,slug,busy,error,onClose,onConfirm}:DialogActions&{title:string;slug:string;onConfirm:(body:Withdrawal)=>void}){
 const t=useTranslations('topicsAdmin.publish'),[input,setInput]=useState(''),[reason,setReason]=useState<UnpublishReason>('error'),[note,setNote]=useState('');
 return <Modal title={t('retireTitle',{title})} busy={busy} onClose={onClose}>
  <p className={MONO}>{t('retireHint',{slug})}</p><WithdrawalFields {...{reason,setReason,note,setNote}}/>
  <label className="block">{t('confirmSlug')}<input className={`${INPUT} ${MONO}`} value={input} onChange={e=>setInput(e.target.value)} autoComplete="off"/></label>{error}
  <div className="flex gap-2"><button className={`${BUTTON} text-danger`} disabled={busy||!retireEnabled(input,slug)} onClick={()=>onConfirm({reason,note:note||null})}>{t('retire')}</button>
   <button className={BUTTON} disabled={busy} onClick={onClose}>{t('back')}</button></div>
 </Modal>;
}
