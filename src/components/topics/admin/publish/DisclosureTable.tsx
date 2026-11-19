// Topic plan T6.8: disclosure receipt, grouped by its ten checks.
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import type {DisclosureCheck} from '@/lib/topics/types';
import {BUTTON,PANEL} from '../editor/FlowBar';
import type {publishModel,Receipt} from './publish-model';
export const MONO='font-mono tabular-nums';
export const CHIP='inline-flex items-center rounded border border-border px-2 py-0.5 text-xs';
export const TABLE='w-full text-left text-sm [&_th]:pb-2 [&_th]:font-medium [&_td]:border-t [&_td]:border-border [&_td]:py-2 [&_td]:pr-2 [&_td]:align-top';
function countFor({detail}:DisclosureCheck,code:string){
 const counts=detail.counts;
 if(counts&&typeof counts==='object'&&Object.hasOwn(counts,code)){
  const n=(counts as Record<string,unknown>)[code];if(typeof n==='number')return n;
 }
 if(code==='licence_unconfirmed'&&Array.isArray(detail.licence))return detail.licence.length;
 if(Array.isArray(detail.findings))return detail.findings.filter(f=>code==='dangling_slot'||f.code===code).length;
}
export function DisclosureTable({receipt,totals,editorHref,disabled,running,onRun}:{receipt:Receipt|null;totals:ReturnType<typeof publishModel>['totals'];editorHref:string;disabled:boolean;running:boolean;onRun:()=>void}){
 const t=useTranslations('topicsAdmin');
 return <section id="disclosure" aria-labelledby="check-title" className={PANEL}>
  <header className="flex flex-wrap items-center gap-2"><h2 id="check-title" className="font-semibold">{t('publish.checkTitle')}</h2>
   <span className={`${CHIP} ${MONO}`}>topic-disclosure/1</span><span className={`${CHIP} ${MONO}`}>{t('publish.totals',totals)}</span></header>
  <button className={BUTTON} disabled={disabled} onClick={onRun}>{t(running?'publish.running':'flow.run')}</button>
  <div className="overflow-x-auto"><table className={TABLE}><thead><tr><th>#</th>{['item','result','detail'].map(k=><th key={k}>{t('publish.'+k)}</th>)}</tr></thead>
   <tbody>{receipt?receipt.checks.map(c=><tr key={c.id}><td className={MONO}>{c.id}</td><td>{t('publish.check.'+c.key)}</td>
    <td><span className={`${CHIP} ${c.result==='block'?'text-danger':c.result==='warn'?'text-warn':'text-text-dim'}`}>{t('publish.'+c.result)}</span></td>
    <td>{!c.codes.length&&t(c.key==='summary'&&c.detail.attached?'publish.withSummary':'publish.clear.'+c.key)}
     {c.codes.map(code=>{const count=countFor(c,code);return <p key={code}>{t('publish.code.'+code)} <code className={MONO}>{code}</code> {count!==undefined&&<span className={MONO}>{t('publish.count',{n:count})}</span>}</p>;})}
     {c.key==='evidence_audience'&&typeof c.detail.withheld==='number'&&typeof c.detail.total==='number'&&<p className={MONO}>{t('publish.audienceCount',{withheld:c.detail.withheld,total:c.detail.total})}</p>}
     {c.key==='empty_dossier'&&typeof c.detail.evidence==='number'&&typeof c.detail.expected_slots==='number'&&<p className={MONO}>{t('publish.dossierCount',{evidence:c.detail.evidence,expected_slots:c.detail.expected_slots})}</p>}
     {[4,5,7].includes(c.id)&&<Link className="text-accent underline" href={editorHref}>{t(c.id===4?'publish.review':'publish.locate')}</Link>}</td></tr>):
    <tr><td colSpan={4}>{t('publish.noReceipt')}</td></tr>}</tbody></table></div>
  <p className="text-xs text-text-dim">{t('publish.checkNote')}</p>
 </section>;
}
