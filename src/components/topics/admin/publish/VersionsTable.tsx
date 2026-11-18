// Topic plan T6.8: immutable versions with lifecycle and drift status.
import {useTranslations} from 'next-intl';
import {StateBadge} from '@/components/research-ui';
import {BUTTON,PANEL} from '../editor/FlowBar';
import {CHIP,MONO,TABLE} from './DisclosureTable';
import {versionStatusKey,type VersionRow} from './publish-model';
export function VersionsTable({versions,disabled,onUnpublish}:{versions:VersionRow[];disabled:boolean;onUnpublish:(opener:HTMLButtonElement)=>void}){
 const t=useTranslations('topicsAdmin.publish');
 return <section aria-labelledby="versions-title" className={PANEL}><h2 id="versions-title" className="font-semibold">{t('versions')}</h2>
  <div className="overflow-x-auto"><table className={TABLE}><thead><tr>{['version','date','status','drift','replay','actions'].map(k=><th key={k}>{t(k)}</th>)}</tr></thead>
   <tbody>{!versions.length&&<tr><td colSpan={6}>{t('noVersions')}</td></tr>}
    {versions.map(v=>{const drifts=Object.entries(v.drift).filter(([,n])=>n>0);return <tr key={v.version_id}>
     <td className={MONO}>v{v.version_no}</td><td className={MONO}><time dateTime={v.published_at}>{v.published_at.slice(0,10)}</time></td>
     <td><span className={CHIP}>{t(versionStatusKey(v.status))}</span> {v.unpublish_reason&&t('reason.'+v.unpublish_reason)}</td>
     <td>{drifts.length?drifts.map(([kind,n])=><div key={kind}>{kind==='revised'||kind==='retracted'?<StateBadge state={kind}/>:t('driftType.'+kind)} <span className={MONO}>{n}</span></div>):'—'}</td>
     <td>—</td><td><div className="flex flex-wrap gap-1">{['verify','details'].map(k=><button className={BUTTON} key={k} disabled title={t('later')}>{t(k)}</button>)}
      {v.status==='current'&&<button className={BUTTON} disabled={disabled} onClick={e=>onUnpublish(e.currentTarget)}>{t('unpublish')}</button>}</div></td></tr>;})}</tbody>
  </table></div>
 </section>;
}
