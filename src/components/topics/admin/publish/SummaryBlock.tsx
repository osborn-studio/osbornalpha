import {useTranslations} from 'next-intl';
import {BUTTON,PANEL} from '../editor/FlowBar';
import {CHIP,MONO} from './DisclosureTable';
import {summaryRunModel,type SummaryRun} from './publish-model';

type Props={run:SummaryRun|null;enabled:boolean;disabled:boolean;generating:boolean;error:string;
 onGenerate:()=>void;onDecision:(id:string,decision:'approve'|'discard')=>void};
export function SummaryBlock({run,enabled,disabled,generating,error,onGenerate,onDecision}:Props){
 const t=useTranslations('topicsAdmin.publish'),m=summaryRunModel(run);
 const waiting=generating||m.kind==='running';
 const generate=<button className={BUTTON} disabled={disabled||waiting} onClick={onGenerate}>{t(waiting?'generatingSummary':m.kind==='rejected'?'regenerateSummary':'generateSummary')}</button>;
 return <section id="summary" className={PANEL}><h2 className={`font-semibold ${MONO}`}>{t('summaryHeading')}</h2>
  <div className="grid gap-2 sm:grid-cols-2">
   {(m.kind==='accepted'||m.kind==='approved')&&<div className={PANEL}><span className={CHIP}>{t(m.kind)}</span>
    <p className="text-sm">{t('factCount')} <b className={MONO}>{m.facts}</b> · {t('hypothesisCount')} <b className={MONO}>{m.points}</b> · {t('counterCount')} <b className={MONO}>{m.counterpoints}</b></p>
    <div className="flex flex-wrap gap-2">{m.kind==='accepted'&&<button className={`${BUTTON} bg-accent text-bg`} disabled={disabled} onClick={()=>onDecision(m.id,'approve')}>{t('approveSummary')}</button>}
     <button className={BUTTON} disabled={disabled} onClick={()=>onDecision(m.id,'discard')}>{t('discardSummary')}</button></div></div>}
   {m.kind==='rejected'&&<div className={`${PANEL} border-danger sm:col-start-2`}><span className={`${CHIP} border-danger`}>{t('rejected')}</span>
    <p>{t('reasonCode')} <code className={MONO}>{m.code??'—'}</code></p><p>{t('matchedFragment',{fragment:m.match??'—'})}</p>{generate}</div>}
   {(m.kind==='empty'||m.kind==='error'||m.kind==='running')&&<div>{generate}<p className="text-sm text-text-dim">{t('summaryHint')}</p></div>}
  </div>
  {(error||m.kind==='error')&&<p role="alert" className="text-sm text-danger"><code className={MONO}>{error||(m.kind==='error'&&m.code)}</code></p>}
  {!enabled&&<p className="rounded border border-warn p-2 text-sm">{t('summaryWarning')}</p>}
 </section>;
}
