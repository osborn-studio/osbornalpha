// Topic spec §7.2: approved facts and unverified hypotheses.
'use client';
import {useTranslations} from 'next-intl';
import {MarkCard} from '@/components/research-ui';
import type {RenderedSummary} from '@/lib/topics/types';
import {summaryModel} from './summary-model';
export function SummaryPanel({summary,onOpenSource}:{summary:RenderedSummary&{hidden_points?:number};onOpenSource:(ordinal:number)=>void}){
 const t=useTranslations('topics'),m=summaryModel(summary);
 const refs=(ordinals:number[])=>ordinals.map(n=><button key={n} type="button" onClick={()=>onOpenSource(n)} className="min-h-[44px] px-1 text-accent font-mono tabular-nums" aria-label={t('summary.source',{ordinal:n})}>[{n}]</button>);
 return <section data-testid="topic-summary" className="min-w-0 space-y-3">
  <header className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{t('summary.title')}</h2><span className="rounded border border-border px-2 py-1 text-xs">{t('summary.approved',{provider:m.provider,model:m.model})}</span></header>
  <p className="text-xs text-text-dim">{t('summary.explanation')}</p>
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
   <MarkCard kind="fact" title={t('summary.facts')}><ul className="space-y-2 text-sm">{m.facts.map(f=><li key={f.fact_id} className="break-words">{f.noticeKey?t(f.noticeKey):<span className="font-mono tabular-nums">{f.text}</span>}{refs(f.refs)}</li>)}</ul>{m.incomparable.map(({a,b},i)=><p key={i} className="text-xs text-text-dim font-mono tabular-nums">{t('summary.incomparable',{a,b})}</p>)}</MarkCard>
   <MarkCard kind="hypothesis" title={t('summary.hypotheses')}><ul className="space-y-2 text-sm">{m.points.map((p,i)=><li key={`p${i}`} className="break-words">{p.text}{refs(p.refs)}</li>)}{m.counterpoints.map((p,i)=><li key={`c${i}`} className="break-words">{t('summary.counterpoint')} · {p.text}{refs(p.refs)}</li>)}</ul>{m.hidden_points>0&&<p className="text-xs text-text-dim font-mono tabular-nums">{t('summary.hidden',{count:m.hidden_points})}</p>}</MarkCard>
  </div>
 </section>;
}
