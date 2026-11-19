// Topic plan T6.8: public and admin projections side by side.
import {useLocale,useTranslations} from 'next-intl';
import {SummaryPanel} from '../../dossier/SummaryPanel';
import {StateBadge} from '@/components/research-ui';
import {BUTTON,PANEL} from '../editor/FlowBar';
import {CHIP,MONO,TABLE} from './DisclosureTable';
import {COUNT_ORDER,type Preview} from './publish-model';
export function PreviewBlock({preview,disabled,onGenerate}:{preview:Preview|null;disabled:boolean;onGenerate:()=>void}){
 const t=useTranslations('topicsAdmin.publish'),locale=useLocale().startsWith('zh')?'zh':'en';
 return <section id="preview" aria-labelledby="preview-title" className={PANEL}>
  <header className="flex flex-wrap items-center gap-2"><h2 id="preview-title" className="font-semibold">{t('preview')}</h2><span className={CHIP}>{t('previewBadge')}</span></header>
  <button className={BUTTON} disabled={disabled} onClick={onGenerate}>{t('generate')}</button>
  {preview&&(preview.degraded?<p role="alert" className="text-danger">{t('code.resolver_degraded')} <code className={MONO}>resolver_degraded</code></p>:<>
   <div className="overflow-x-auto"><table className={TABLE}><thead><tr>{['evidence','public','admin'].map(k=><th key={k}>{t(k)}</th>)}</tr></thead><tbody>
    {preview.difference.map(row=><tr key={row.ordinal} tabIndex={-1} id={'preview-evidence-'+row.ordinal}><td><span className={MONO}>ev:{row.ordinal}</span> {row.label[locale]}</td>
     <td>{row.public.state==='ok'?<span className={MONO}>{row.public.text??'—'}</span>:row.public.state==='unsupported'?<span className={`${CHIP} border-dashed`}>{t('state.unsupported')}</span>:<StateBadge state={row.public.state==='not_served'?'notServed':row.public.state}/>}</td>
     <td className={MONO}>{row.admin.text??'—'}</td></tr>)}</tbody></table></div>
   <p className={MONO}>{t('masked',{n:preview.masked})}</p><div className="flex flex-wrap gap-2">{COUNT_ORDER.map(state=><span key={state}>{t('state.'+state)} <b className={MONO}>{preview.counts[state]}</b></span>)}</div>
   {preview.dossier.summary&&<SummaryPanel summary={preview.dossier.summary} onOpenSource={n=>document.getElementById('preview-evidence-'+n)?.focus()}/>}</>)}
  <p className="text-xs text-text-muted">{t('previewLater')}</p>
 </section>;
}
