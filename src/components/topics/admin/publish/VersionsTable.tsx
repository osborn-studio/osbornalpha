// Topic plan T6.8: immutable versions with lifecycle and drift status.
import {Fragment,useState} from 'react';
import {TopicBadge} from '../../TopicBadge';
import {driftBadge} from '../../badge-model';
import {useTranslations} from 'next-intl';
import {StateBadge} from '@/components/research-ui';
import {BUTTON,PANEL} from '../editor/FlowBar';
import {CHIP,MONO,TABLE} from './DisclosureTable';
import {versionStatusKey,type VersionRow} from './publish-model';
export function VersionsTable({versions,disabled,onVerify,onUnpublish}:{versions:VersionRow[];disabled:boolean;onVerify:(n:number)=>void;onUnpublish:(opener:HTMLButtonElement)=>void}){
 const [expanded,expand]=useState<string|null>(null);
 const t=useTranslations('topicsAdmin.publish');
 return <section aria-labelledby="versions-title" className={PANEL}><h2 id="versions-title" className="font-semibold">{t('versions')}</h2>
  <div className="overflow-x-auto"><table className={TABLE}><thead><tr>{['version','date','status','drift','replay','actions'].map(k=><th key={k}>{t(k)}</th>)}</tr></thead>
   <tbody>{!versions.length&&<tr><td colSpan={6}>{t('noVersions')}</td></tr>}
    {versions.map(v=>{const drifts=Object.entries(v.drift).filter(([,n])=>n>0);return <Fragment key={v.version_id}><tr>
     <td className={MONO}>v{v.version_no}</td><td className={MONO}><time dateTime={v.published_at}>{v.published_at.slice(0,10)}</time></td>
     <td><span className={CHIP}>{t(versionStatusKey(v.status))}</span> {v.unpublish_reason&&t('reason.'+v.unpublish_reason)}</td>
     <td>{drifts.length?drifts.map(([kind,n])=><div key={kind}>{kind==='revised'||kind==='retracted'?<StateBadge state={kind}/>:t('driftType.'+kind)} <span className={MONO}>{n}</span></div>):'—'}</td>
     <td aria-live="polite">{v.verification?<><span className={`${CHIP} ${MONO} ${v.verification.mismatches?'border-dashed text-danger':''}`}>
      {v.verification.mismatches?t('mismatched',{n:v.verification.mismatches}):t('matched',{time:v.verification.time})}</span>
      {v.verification.mismatches>0&&<p className={MONO}>{t('mismatchNote',{n:v.version_no})}</p>}</>:'—'}</td><td><div className="flex flex-wrap gap-1"><button className={BUTTON} disabled={disabled} onClick={()=>onVerify(v.version_no)}>{t('verify')}</button>
      <button className={BUTTON} aria-expanded={expanded===v.version_id} onClick={()=>expand(expanded===v.version_id?null:v.version_id)}>{t('details')}</button>
      {v.status==='current'&&<button className={BUTTON} disabled={disabled} onClick={e=>onUnpublish(e.currentTarget)}>{t('unpublish')}</button>}</div></td></tr>
     {expanded===v.version_id&&<tr><td colSpan={6}><table className={TABLE}><caption>{t('details')} · <span className={MONO}>v{v.version_no}</span></caption>
      <thead><tr>{['ordinal','drift','period','value','checkedAt'].map(k=><th key={k}>{t(k)}</th>)}</tr></thead>
      <tbody>{v.details.map(row=><tr key={row.ordinal}><td className={MONO}>{row.ordinal}</td>
       <td>{row.drift==='unchanged'?t('unchanged'):<TopicBadge badge={driftBadge(row.drift)}/>}</td>
       <td className={MONO}>{row.period??'—'}</td><td className={MONO}>{row.value===null?'—':[row.value,row.unit].filter(Boolean).join(' ')}</td>
       <td className={MONO}><time dateTime={row.checked_at}>{row.checked_at}</time></td></tr>)}
       {!v.details.length&&<tr><td colSpan={5}>{t('noDrift')}</td></tr>}</tbody></table></td></tr>}</Fragment>;})}</tbody>
  </table></div>
 </section>;
}
