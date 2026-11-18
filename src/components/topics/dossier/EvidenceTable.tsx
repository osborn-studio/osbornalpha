// Fact evidence table; reconstructed rows have a separate body (spec §4.1, §7.2).
import {useLocale,useTranslations} from 'next-intl';
import type {PublicEvidence} from '@/lib/topics/public-dto';
import {TopicBadge} from '../TopicBadge';
import {evidenceRowModel} from './evidence-row-model';
export function EvidenceTable({rows,onOpenSource}:{rows:PublicEvidence[];onOpenSource:(ordinal:number)=>void}){
 const locale=useLocale(),t=useTranslations('topics');if(!rows.length)return null;
 const ordered=[...rows].sort((a,b)=>a.ordinal-b.ordinal);
 const groups=[ordered.filter(e=>e.basis!=='reconstruction'),ordered.filter(e=>e.basis==='reconstruction')];
 return <><div className="hidden md:block"><table className="w-full table-fixed break-words text-left text-xs" aria-label={t('dossier.evidence')}>
  <thead className="border-b border-border text-text-dim"><tr>{['#','evidence','fact','period','available','state','drift','source'].map(key=><th scope="col" key={key} className="px-3 py-2 font-medium">{key==='#'?'#':t(`dossier.${key}`)}</th>)}</tr></thead>
  {groups.map((group,i)=>group.length>0&&<tbody key={i}>
   {i===1&&<tr><th colSpan={8} scope="colgroup" className="border-y border-dashed border-border px-3 py-2 text-text-dim font-normal">{t('dossier.reconstruction')}</th></tr>}
   {group.map(e=>{const m=evidenceRowModel(e,locale);return <tr key={e.ordinal} data-evidence-ordinal={e.ordinal} data-research-state={e.state==='ok'?undefined:e.state} className={`border-b border-border align-top ${m.dim?'text-text-dim':'text-text'}`}>
    <td className="px-3 py-3 font-mono tabular-nums">{e.ordinal}</td>
    <th scope="row" className="px-3 py-3 font-normal"><span>{m.label}</span><small className="block text-text-dim">{t(`kinds.${m.kind}`)}</small></th>
    <td data-testid="evidence-fact" className="px-3 py-3 font-mono tabular-nums"><span>{m.valueButton?<>{m.factBefore}<button type="button" onClick={()=>onOpenSource(e.ordinal)} className="font-mono tabular-nums text-accent underline underline-offset-4">{m.valueText}</button>{m.factAfter}</>:m.factText}</span>{m.coverage&&<small className="block text-text-muted font-mono tabular-nums">{m.coverage}</small>}{m.basisBadge&&<div className="mt-2"><TopicBadge badge={m.basisBadge}/></div>}</td>
    <td className="px-3 py-3 font-mono tabular-nums">{m.period}</td><td className="px-3 py-3 font-mono tabular-nums">{m.available}</td>
    <td className="px-3 py-3"><TopicBadge badge={m.stateBadge}/></td><td className="px-3 py-3"><TopicBadge badge={m.driftBadge}/>{m.driftDetail&&<p className="mt-1 font-mono tabular-nums">{m.driftDetail}</p>}</td>
    <td className="px-3 py-3">{m.sourceButton&&<button type="button" onClick={()=>onOpenSource(e.ordinal)} className="whitespace-nowrap text-accent">{t('dossier.source')} ▸</button>}</td>
   </tr>;})}
  </tbody>)}
 </table></div>
 <div className="md:hidden space-y-3">{groups.map((group,i)=><div key={i} className="space-y-3">
  {i===1&&group.length>0&&<p className="border-y border-dashed border-border py-2 text-xs text-text-dim">{t('dossier.reconstruction')}</p>}
  {group.map(e=>{const m=evidenceRowModel(e,locale);return <article key={e.ordinal} data-evidence-ordinal={e.ordinal} data-research-state={e.state==='ok'?undefined:e.state} className="min-w-0 space-y-2 break-words rounded border border-border p-3 text-sm">
   <div className="flex flex-wrap items-center gap-2"><span className="font-mono tabular-nums">{m.ordinal}</span><span>{m.label}</span><TopicBadge badge={m.stateBadge}/></div>
   <p data-testid="evidence-fact">{m.valueButton?<>{m.factBefore}<button type="button" onClick={()=>onOpenSource(e.ordinal)} className="min-h-[44px] font-mono tabular-nums text-accent underline">{m.valueText}</button>{m.factAfter}</>:m.factText}</p>
   {m.coverage&&<small className="block text-text-muted font-mono tabular-nums">{m.coverage}</small>}
   <TopicBadge badge={m.basisBadge}/>
   <p className="text-xs text-text-dim"><span className="font-mono tabular-nums">{t('dossier.available')} {m.available}</span>{' · '}{t(`kinds.${m.kind}`)}</p>
   <TopicBadge badge={m.driftBadge}/>{m.driftDetail&&<p className="font-mono tabular-nums text-xs">{m.driftDetail}</p>}
   {m.sourceButton&&<button type="button" onClick={()=>onOpenSource(e.ordinal)} className="min-h-[44px] text-accent">{t('dossier.source')} ▸</button>}
  </article>;})}
 </div>)}</div></>;
}
