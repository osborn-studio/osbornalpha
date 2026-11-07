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
import {fetchIndustryJudgments,judgmentCardView} from '@/lib/industry/judgment-contract';
import type {JudgmentsState} from '@/lib/industry/judgment-contract';
import {StateNotice} from './StateNotice';

export function JudgmentArea({enabled,subjectKey}:{enabled:boolean;subjectKey:string|null}){
  const t=useTranslations('industries.judgments');
  const locale=useLocale()==='en'?'en':'zh';
  const active=enabled&&subjectKey!==null;
  const [state,setState]=useState<JudgmentsState|{state:'loading'}>(active?{state:'loading'}:{state:'disabled'});
  useEffect(()=>{
    if(!active||subjectKey===null)return;
    const ctrl=new AbortController();
    fetchIndustryJudgments(subjectKey,{enabled:true,signal:ctrl.signal}).then(s=>{if(!ctrl.signal.aborted)setState(s);});
    return ()=>ctrl.abort();
  },[active,subjectKey]);
  return (
    <section className="card-base flex flex-col gap-3" aria-label={t('title')} data-judgments={state.state}>
      <div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{t('title')}</h2><span className="rounded-[4px] border border-border px-1.5 text-xs text-text-dim">F4</span></div>
      {(state.state==='disabled'||(state.state==='ok'&&state.cards.length===0))&&<StateNotice kind="noJudgment" />}
      {state.state==='loading'&&<div role="status" aria-busy="true" className="h-24 rounded-lg bg-bg-elevated"><span className="sr-only">{t('title')}</span></div>}
      {state.state==='error'&&<p role="alert" className="text-sm text-danger">{t('loadFailed')} ({state.code})</p>}
      {state.state==='ok'&&state.cards.map(c=>{
        const v=judgmentCardView(c,locale);
        return (
          <article key={c.judgment_id} className="flex max-w-[760px] flex-col gap-2.5 rounded-lg border border-border bg-bg-elevated p-4" data-calibration={c.calibration}>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-dim">{v.title}</span>
              {v.retrospective&&<span className="rounded border border-border px-1.5 text-[11px] text-text-dim">{t('retrospective')}</span>}
              <span className={`ml-auto rounded-[4px] border px-2 py-0.5 text-xs ${v.badge.kind==='calibrated'?'border-accent text-accent':'border-border text-text-dim'}`}>
                {v.badge.kind==='uncalibrated'?t('uncalibrated',{n:v.badge.n,threshold:v.badge.threshold}):t(v.badge.kind)}
              </span>
            </div>
            <div className="text-xl font-semibold">{v.headline}{v.percent!==null&&<span className="ml-2 font-mono text-base tabular-nums">{v.percent}%</span>}</div>
            {v.abstainReason&&<p className="text-sm text-text-dim">{t('abstained',{reason:v.abstainReason})}</p>}
            {v.condition&&<p className="text-sm text-text-dim"><span>{t('condition')}：</span>{v.condition}</p>}
            <div className="border-t border-border pt-2 text-xs text-text-dim">
              {t('method')} <a href={c.methodology.href} className="font-mono">{v.footer.method}</a> · {t('asOf')} <span className="font-mono tabular-nums">{v.footer.asOf}</span> · {t(`lifecycle.${v.lifecycle}`)}
              {v.footer.settleBy&&<> · {t('settlement')} <span className="font-mono tabular-nums">{v.footer.settleBy}</span></>}
            </div>
          </article>
        );
      })}
    </section>
  );
}
