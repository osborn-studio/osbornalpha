'use client';
// src/components/industries/JudgmentArea.tsx
// Judgment area of the industry detail page (spec §7.2; canvas "Detail" §5, "States" judgments).
// Facts and judgments stay separate: this area renders only F4 JudgmentCards fetched from
// GET /api/judgments?subject_type=industry&subject_key=<scheme:version:code>, and only when the server
// flag INDUSTRY_JUDGMENTS_ENABLED=1 is passed down as `enabled` (default off → "no judgment", no
// request). Uncalibrated cards (owner decision D): category label + badge + falsifiable condition,
// no percent, score, band or colour grade.
import {useEffect,useState} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {judgmentCardView,judgmentsViewState,startJudgmentsLoad} from '@/lib/industry/judgment-contract';
import type {JudgmentCard,LoadedJudgments} from '@/lib/industry/judgment-contract';
import {StateNotice} from './StateNotice';

/** `scope`: the already-localised scheme and level the page shows, named in the empty state. */
export function JudgmentArea({enabled,subjectKey,scope}:{enabled:boolean;subjectKey:string|null;scope:{scheme:string;level:string}}){
  const t=useTranslations('industries.judgments');
  const [loaded,setLoaded]=useState<LoadedJudgments|null>(null);
  useEffect(()=>{
    const stop=startJudgmentsLoad({enabled,subjectKey,onResult:setLoaded});
    return ()=>{stop();setLoaded(null);};
  },[enabled,subjectKey]);
  // derived, not stored: nothing of a previous subject or an earlier enabled state is ever rendered
  const state=judgmentsViewState(enabled,subjectKey,loaded);
  return (
    <section className="card-base flex flex-col gap-3" aria-label={t('title')} data-judgments={state.state}>
      <div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{t('title')}</h2><span className="rounded-[4px] border border-border px-1.5 text-xs text-text-dim">F4</span><a href="/intel/methods" className="ml-auto text-xs">{t('methodsLink')}</a></div>
      {(state.state==='disabled'||(state.state==='ok'&&state.cards.length===0))&&<StateNotice kind="noJudgment"><span className="text-text-dim">{t('scope',scope)}</span></StateNotice>}
      {state.state==='loading'&&<div role="status" aria-busy="true" className="h-24 rounded-lg bg-bg-elevated"><span className="sr-only">{t('title')}</span></div>}
      {state.state==='error'&&<p role="alert" className="text-sm text-danger">{t('loadFailed')} ({state.code})</p>}
      {state.state==='ok'&&<JudgmentCards cards={state.cards} />}
    </section>
  );
}

export function JudgmentCards({cards}:{cards:JudgmentCard[]}){
  const t=useTranslations('industries.judgments');
  const locale=useLocale()==='en'?'en':'zh';
  return (
    <>
      {cards.map(c=>{
        const v=judgmentCardView(c,locale);
        const label=v.badge.kind==='uncalibrated'?t('uncalibrated',{n:v.badge.n,threshold:v.badge.threshold})
          :v.badge.kind==='failed'?t('failed',{ece:v.badge.ece===null?'—':v.badge.ece.toFixed(3)}):t(v.badge.kind);
        return (
          <article key={c.judgment_id} className="flex max-w-[760px] flex-col gap-2.5 rounded-lg border border-border bg-bg-elevated p-4" data-calibration={c.calibration}>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-dim">{v.title}</span>
              {v.retrospective&&<span className="rounded border border-border px-1.5 text-[11px] text-text-dim">{t('retrospective')}</span>}
              <span className={`ml-auto rounded-[4px] border px-2 py-0.5 text-xs ${v.badge.kind==='calibrated'?'border-accent text-accent':v.badge.kind==='failed'?'border-warn text-warn':'border-border text-text-dim'}`}>{label}</span>
            </div>
            <div className="text-xl font-semibold">{v.headline}{v.percent!==null&&<span className="ml-2 font-mono text-base tabular-nums">{v.percent}%</span>}</div>
            {v.abstainReason&&<p className="text-sm text-text-dim">{t('abstained',{reason:v.abstainReason})}</p>}
            {v.condition&&<p className="text-sm text-text-dim"><span>{t('condition')}：</span>{v.condition}</p>}
            {v.settlement&&<p className="text-sm" data-settlement={v.settlement.outcome}><span className="text-text-dim">{t('outcome')}：</span><span className="font-medium">{v.settlement.outcome}</span>{v.settlement.realized!==null&&<> · <span className="text-text-dim">{t('realized')}</span> <span className="font-mono tabular-nums">{v.settlement.realized}</span></>} · <span className="text-text-dim">{t('settledAt')}</span> <span className="font-mono tabular-nums">{v.settlement.settledAt.slice(0,10)}</span></p>}
            <div className="border-t border-border pt-2 text-xs text-text-dim">
              {t('method')} <a href={c.methodology.href} className="font-mono">{v.footer.method}</a> · {t('asOf')} <span className="font-mono tabular-nums">{v.footer.asOf}</span> · {t(`lifecycle.${v.lifecycle}`)}
              {v.footer.settleBy&&<> · {t('settlement')} <span className="font-mono tabular-nums">{v.footer.settleBy}</span></>}
              {v.footer.target&&<> · {t('target')} <span className="font-mono">{v.footer.target}</span></>}
              {v.footer.horizon&&<> · {t('horizon')} <span className="font-mono">{v.footer.horizon}</span></>}
            </div>
            <details className="text-xs text-text-dim">
              <summary className="cursor-pointer">{t('inputs',{n:v.inputs.length})}</summary>
              <ul className="mt-1 flex list-none flex-col gap-1 p-0">
                {v.inputs.map((i,k)=>(
                  <li key={k} className="flex flex-wrap gap-x-2" data-input={i.kind}>
                    <span className="font-mono">{i.kind}</span>
                    {i.href?<a href={i.href} className="font-mono break-all">{i.ref||i.href}</a>:<span className="font-mono break-all">{i.ref}</span>}
                    <span className="font-mono tabular-nums">{i.availableAt.slice(0,10)}</span>
                  </li>
                ))}
              </ul>
            </details>
          </article>
        );
      })}
    </>
  );
}
