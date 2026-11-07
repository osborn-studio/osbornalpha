'use client';
// src/components/industries/SourceDrawer.tsx
// The source drawer (spec §8.5; canvas "Drawer" A–D, "M-Drawer"): every displayed number is a
// SourceButton (or a SourceDot in a chart) that opens it. Right-side panel on desktop, full-width
// bottom sheet on mobile; Esc and the backdrop close it. Aggregate cells fetch the original replay
// (public route, or the admin route in the internal preview) and offer "recompute on current
// evidence"; valuation cells show the official comparison value only when the route attaches it.
import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import type {CSSProperties,ReactNode} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {formatMetricValue,formatMoney,formatValuation} from '@/lib/industry/display';
import type {Locale} from '@/lib/industry/display';
import {HistoryClassBadge} from './HistoryClassBadge';
import {nodeName} from './hrefs';
import {coverageOf,diffCounts,errorCodeOf,factEvidenceUrl,inputRows,normalizeRecompute,normalizeReplay,presentModal,replayUrl,roleSummary,short,valuationReplayUrl} from './drawer-model';
import type {AggregatePayload,DrawerPayload,RecomputePayload,ReplayPayload} from './drawer-model';

const DrawerContext=createContext<{open:(p:DrawerPayload)=>void}|null>(null);

export function SourceDrawerProvider({children}:{children:ReactNode}){
  const [payload,setPayload]=useState<DrawerPayload|null>(null);
  const open=useCallback((p:DrawerPayload)=>setPayload(p),[]);
  const value=useMemo(()=>({open}),[open]);
  return (<DrawerContext.Provider value={value}>{children}{payload&&<DrawerPanel payload={payload} onClose={()=>setPayload(null)} />}</DrawerContext.Provider>);
}

export function SourceButton({payload,children,className,label,style}:{payload:DrawerPayload;children:ReactNode;className?:string;label?:string;style?:CSSProperties}){
  const ctx=useContext(DrawerContext);
  return (
    <button type="button" aria-label={label} title={label} style={style} onClick={()=>ctx?.open(payload)} data-source-button=""
      className={`cursor-pointer rounded font-mono tabular-nums hover:outline hover:outline-1 hover:outline-[var(--border-active)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent ${className??''}`}>
      {children}
    </button>
  );
}

/** A chart dot: pointer-only. The table next to every chart is the keyboard and screen-reader path, so the dot is hidden from both. */
export function SourceDot({payload,cx,cy}:{payload:DrawerPayload;cx:number;cy:number}){
  const ctx=useContext(DrawerContext);
  return (
    <circle cx={cx} cy={cy} r={4} tabIndex={-1} aria-hidden="true" strokeWidth={2} data-source-button=""
      className="cursor-pointer fill-[var(--bg-elevated)] stroke-[var(--accent)]"
      onClick={()=>ctx?.open(payload)} />
  );
}

function Row({label,children,mono}:{label:string;children:ReactNode;mono?:boolean}){
  return (<><dt className="text-text-dim">{label}</dt><dd className={`m-0 break-words ${mono?'font-mono text-xs tabular-nums':''}`}>{children}</dd></>);
}
function Section({title,children}:{title:string;children:ReactNode}){
  return (<section><div className="mb-2 text-[10px] uppercase tracking-wide text-text-dim">{title}</div>{children}</section>);
}
const dl='grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm';

/** fetch JSON with abort; {status:'idle'|'loading'|'ok'|'error'} */
function useJson<T>(url:string|null,parse:(j:unknown)=>T|null){
  const [state,setState]=useState<{status:'idle'|'loading'|'ok'|'error';data?:T;code?:string}>({status:url?'loading':'idle'});
  useEffect(()=>{
    if(!url){setState({status:'idle'});return;}
    const ctrl=new AbortController();
    setState({status:'loading'});
    fetch(url,{signal:ctrl.signal}).then(async r=>{
      const j:unknown=await r.json().catch(()=>null);
      const data=r.ok?parse(j):null;
      setState(data?{status:'ok',data}:{status:'error',code:errorCodeOf(r.status,j)});
    }).catch(e=>{if((e as {name?:string}).name!=='AbortError')setState({status:'error',code:'network'});});
    return ()=>ctrl.abort();
  },[url,parse]);
  return state;
}

function DrawerPanel({payload,onClose}:{payload:DrawerPayload;onClose:()=>void}){
  const t=useTranslations('industries.drawer');
  const dialogRef=useRef<HTMLDialogElement>(null);
  const closeRef=useRef<HTMLButtonElement>(null);
  // native modal: Tab is trapped, the page behind is inert, Escape fires `cancel`; focus goes to the close button and returns to the opener
  useEffect(()=>{
    const dialog=dialogRef.current;
    if(!dialog)return;
    const active=document.activeElement;
    return presentModal(dialog,closeRef.current,active instanceof HTMLElement?active:null);
  },[]);
  return (
    <dialog ref={dialogRef} aria-label={t('title')} data-drawer-kind={payload.kind} onCancel={e=>{e.preventDefault();onClose();}}
      className="fixed inset-0 z-50 m-0 h-dvh max-h-none w-dvw max-w-none border-0 bg-transparent p-0 text-text backdrop:bg-transparent">
      <button type="button" aria-label={t('close')} tabIndex={-1} onClick={onClose} className="absolute inset-0 h-full w-full cursor-default" style={{background:'color-mix(in srgb, var(--bg) 70%, transparent)'}} />
      <div
        className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-xl border border-border bg-bg-elevated sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[440px] sm:rounded-none sm:rounded-l-lg">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-bg-card sm:hidden" aria-hidden="true" />
        <div className="flex items-start gap-2 border-b border-border p-4">
          <div className="min-w-0 flex-1"><Heading payload={payload} /></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t('close')} className="flex h-8 w-8 items-center justify-center rounded text-text-dim hover:bg-[var(--accent-wash)]">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="flex flex-col gap-5 p-4">
          {payload.kind==='aggregate'&&<AggregateBody p={payload} />}
          {payload.kind==='valuation'&&<ValuationBody p={payload} />}
          {payload.kind==='fact'&&<FactBody p={payload} />}
          {payload.kind==='membership'&&<MembershipBody p={payload} />}
        </div>
      </div>
    </dialog>
  );
}

function Heading({payload}:{payload:DrawerPayload}){
  const t=useTranslations('industries');
  const locale:Locale=useLocale()==='en'?'en':'zh';
  let title='',big='';
  if(payload.kind==='aggregate'){title=`${payload.nodeName} · ${t(`metrics.${payload.cell.metric}`)} · ${payload.cell.periodEnd}`;big=payload.cell.value!==null?formatMetricValue(payload.cell.metric,payload.cell.value,locale):'—';}
  if(payload.kind==='valuation'){title=`${payload.nodeName} · ${payload.cell.metric==='pe_ttm'?t('valuation.pe'):payload.cell.metric==='pb'?t('valuation.pb'):payload.cell.metric} · ${payload.cell.tradeDate}`;big=formatValuation(payload.cell.metric,payload.cell.value,locale);}
  if(payload.kind==='fact'){title=`${payload.issuerName} · ${payload.fact.concept} · ${payload.fact.periodEnd}`;big=formatMoney(payload.fact.value,payload.fact.unit,locale);}
  if(payload.kind==='membership'){title=`${payload.ticker??''} ${payload.issuerName} ∈ ${payload.nodeName}`;big='';}
  return (
    <>
      <div className="text-[10px] uppercase tracking-wide text-text-dim">{t(`drawer.kind.${payload.kind}`)}</div>
      <div className="mt-1 text-sm font-semibold">{title}</div>
      {big&&<div className="mt-1 font-mono text-[26px] font-medium tabular-nums">{big}</div>}
    </>
  );
}

function AggregateBody({p}:{p:AggregatePayload}){
  const t=useTranslations('industries');
  const c=p.cell;const cov=coverageOf(c);
  const [recomputeOn,setRecomputeOn]=useState(false);
  const replay=useJson<ReplayPayload>(c.status==='ok'?replayUrl(p,'original'):null,normalizeReplay);
  const recUrl=recomputeOn?replayUrl(p,'recompute'):null;
  const recompute=useJson<RecomputePayload>(recUrl,normalizeRecompute);
  const roles=replay.data?roleSummary(replay.data.manifest):null;
  const inputs=replay.data?inputRows(replay.data.manifest,5):null;
  return (
    <>
      <Section title={`1 · ${t('drawer.sections.value')}`}>
        <dl className={dl}>
          <Row label={t('drawer.formula')}>{t(`formulas.${c.metric}`)}</Row>
          <Row label={t('drawer.period')} mono>{c.periodStart} → {c.periodEnd} · {c.duration}</Row>
          <Row label={t('drawer.method')} mono>{p.header.methodVersion} · {p.header.formulaVersion}</Row>
          <Row label={t('drawer.factsAsOf')} mono>{p.header.factsAsOf}</Row>
          <Row label={t('drawer.availableAt')} mono>{c.updatedAt??'—'} <span className="font-sans text-text-dim">{t('drawer.availableAtNote')}</span></Row>
          <Row label={t('drawer.historyClass')}><HistoryClassBadge historyClass={p.header.historyClass} /></Row>
          <Row label={t('drawer.codeVersion')} mono>{p.header.codeVersion.slice(0,7)}</Row>
          <Row label={t('drawer.manifest')} mono>{short(c.manifestHash)}</Row>
        </dl>
      </Section>
      <Section title={`2 · ${t('drawer.sections.coverage')}`}>
        <div className="flex items-baseline gap-2"><span className="font-mono text-base tabular-nums">{cov.n} / {cov.d}</span><span className="text-xs text-text-dim">{t('drawer.coverageRatio')}</span></div>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-xs text-text-dim">
          {roles?.excluded.map(e=><li key={e.reason}>{t('drawer.excludedBy',{reason:t(`roles.${e.reason}`),n:e.n})}</li>)}
          <li>{t('drawer.unresolvedCount',{n:c.nUnresolved})}</li>
        </ul>
      </Section>
      {c.status!=='ok'?(
        <Section title={`3 · ${t('drawer.sections.replay')}`}>
          <p className="text-sm text-text-dim">{t('drawer.missingCell',{reason:t(`missing.${c.missingReason??'empty_set'}`)})}</p>
          <p className="mt-1 font-mono text-xs tabular-nums text-text-dim">{t('drawer.counts',{members:c.nMembers,withData:c.nWithData,unresolved:c.nUnresolved})}</p>
        </Section>
      ):(
        <Section title={`3 · ${t('drawer.sections.replay')}`}>
          {replay.status==='loading'&&<div role="status" aria-busy="true" className="h-16 rounded bg-bg-card"><span className="sr-only">{t('drawer.replayLoading')}</span></div>}
          {replay.status==='error'&&<p role="alert" className="text-sm text-danger">{t('drawer.replayFailed',{code:replay.code??''})}</p>}
          {replay.data&&(replay.data.reproduced?(
            <div className="rounded-lg border border-accent p-3" data-reproduced="true">
              <span className="rounded border border-accent px-1.5 py-0.5 font-mono text-xs text-accent">{t('drawer.reproducedTrue')}</span>
              <p className="mt-2 text-xs text-text-dim">{t('drawer.reproducedNote',{value:c.value??''})}</p>
            </div>
          ):(
            <div role="alert" className="rounded-lg border border-danger p-3" data-reproduced="false">
              <div className="text-sm font-semibold text-danger">{t('states.replayMismatch.title')}</div>
              <p className="mt-1 text-xs text-text-dim">{t('drawer.mismatchNote',{replayed:replay.data.replay[0]?.value_text??'—',stored:c.value??'—'})}</p>
              <p className="mt-1 text-xs text-text-dim">{t('states.replayMismatch.body')}</p>
            </div>
          ))}
          {roles&&(
            <table className="mt-2 w-full text-xs">
              <thead><tr className="text-left text-text-dim"><th className="py-1 font-normal">{t('drawer.roles')}</th><th className="py-1 text-right font-normal">{t('drawer.issuers')}</th></tr></thead>
              <tbody>
                <tr className="border-t border-border"><td className="py-1">{t('roles.included')}</td><td className="py-1 text-right font-mono tabular-nums">{roles.included}</td></tr>
                {roles.excluded.map(e=><tr key={e.reason} className="border-t border-border"><td className="py-1">{t('roles.excluded')} · {t(`roles.${e.reason}`)}</td><td className="py-1 text-right font-mono tabular-nums">{e.n}</td></tr>)}
              </tbody>
            </table>
          )}
          {!p.preview&&(
            <div className="mt-2">
              <button type="button" onClick={()=>setRecomputeOn(true)} disabled={recomputeOn} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-dim hover:border-[var(--border-active)] hover:text-text disabled:opacity-60">{t('drawer.recompute')}</button>
              {recompute.status==='error'&&<p role="alert" className="mt-1 text-xs text-danger">{t('drawer.replayFailed',{code:recompute.code??''})}</p>}
              {recompute.data&&(
                <div className="mt-2 text-xs" data-recompute={recompute.data.result}>
                  <p className={recompute.data.result==='match'?'text-text':'text-warn'}>{t(recompute.data.result==='match'?'drawer.recomputeMatch':'drawer.recomputeChanged')}</p>
                  {recompute.data.result==='changed'&&<p className="mt-1 font-mono tabular-nums text-text-dim">{t('drawer.diffCounts',diffCounts(recompute.data.diff))}</p>}
                </div>
              )}
            </div>
          )}
        </Section>
      )}
      {inputs&&inputs.total>0&&(
        <Section title={t('drawer.inputsTop',{n:inputs.rows.length,total:inputs.total})}>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-text-dim"><th className="py-1 font-normal">{t('drawer.issuer')}</th><th className="py-1 font-normal">{t('drawer.concept')}</th><th className="py-1 text-right font-normal">{t('drawer.value')}</th><th className="py-1 font-normal">{t('drawer.availableDate')}</th></tr></thead>
            <tbody>
              {inputs.rows.map(r=>(
                <tr key={`${r.issuerId}:${r.concept}:${r.filingId}`} className="border-t border-border">
                  <td className="py-1 font-mono">{r.ticker??r.issuerId.slice(0,8)}</td><td className="py-1">{r.concept}</td>
                  <td className="py-1 text-right font-mono tabular-nums">{r.value} {r.unit}</td>
                  <td className="py-1 font-mono tabular-nums text-text-dim">{r.availableDate} · {r.citation??'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
      <Section title={`4 · ${t('drawer.sections.membership')}`}>
        <dl className={dl}>
          <Row label={t('drawer.upstream')}>{p.scheme==='sw2021'?t('drawer.membershipUpstreamSw'):t('drawer.membershipUpstreamSic')}</Row>
          <Row label={t('drawer.availableDateLabel')}>{p.scheme==='sw2021'?t('drawer.availabilityAssumed'):t('drawer.availabilityObserved')}</Row>
          <Row label={t('drawer.historyClass')}><HistoryClassBadge historyClass={p.header.historyClass} /></Row>
        </dl>
      </Section>
    </>
  );
}

function ValuationBody({p}:{p:Extract<DrawerPayload,{kind:'valuation'}>}){
  const t=useTranslations('industries');
  const parse=useCallback((j:unknown)=>(typeof j==='object'&&j!==null&&'cell' in j?j as {officialValue?:string}:null),[]);
  const r=useJson(valuationReplayUrl(p),parse);
  return (
    <Section title={t('drawer.sections.value')}>
      <dl className={dl}>
        <Row label={t('drawer.formula')}>{t(`formulas.${p.cell.metric}`)}</Row>
        <Row label={t('drawer.tradeDate')} mono>{p.cell.tradeDate}</Row>
        <Row label={t('drawer.availableAt')} mono>{p.cell.updatedAt??'—'}</Row>
        <Row label={t('drawer.factsAsOf')} mono>{p.cell.factsAsOf}</Row>
        <Row label={t('drawer.mcapCoverage')} mono>{p.cell.mcapCoverage??'—'}</Row>
        <Row label={t('drawer.pairStatus')}><span className="rounded border border-border px-1.5 text-xs">{t('valuation.within')}</span></Row>
        <Row label={t('drawer.officialValue')}>{r.data?.officialValue?<span className="font-mono tabular-nums">{r.data.officialValue}</span>:<span className="text-text-dim">{t('drawer.officialUnavailable')}</span>}</Row>
        <Row label={t('drawer.manifest')} mono>{short(p.cell.manifestHash)}</Row>
      </dl>
      <p className="mt-2 text-xs text-text-dim">{t('drawer.valuationReplayDeferred')}</p>
    </Section>
  );
}

function FactBody({p}:{p:Extract<DrawerPayload,{kind:'fact'}>}){
  const t=useTranslations('industries.drawer');
  const href=factEvidenceUrl(p.ticker,p.fact.factId);
  return (
    <Section title={t('sections.evidence')}>
      <dl className={dl}>
        <Row label={t('concept')} mono>{p.fact.concept}</Row>
        <Row label={t('period')} mono>{p.fact.periodStart??'—'} → {p.fact.periodEnd} · {p.fact.duration}</Row>
        <Row label={t('value')} mono>{p.fact.value} {p.fact.unit}</Row>
        <Row label={t('availableDate')} mono>{p.fact.availableDate}</Row>
        <Row label={t('filingId')} mono>{p.fact.filingId}</Row>
        <Row label={t('rawHash')} mono>{short(p.fact.rawHash)}</Row>
      </dl>
      {href&&<a className="mt-2 inline-block text-xs" href={href}>{t('factEvidence')} →</a>}
    </Section>
  );
}

function MembershipBody({p}:{p:Extract<DrawerPayload,{kind:'membership'}>}){
  const t=useTranslations('industries.drawer');
  const locale:Locale=useLocale()==='en'?'en':'zh';
  const m=p.membership;
  const availability=m.availability==='evidenced'?t('availabilityEvidenced'):m.availability==='observed'?t('availabilityObserved'):t('availabilityAssumed');
  return (
    <Section title={t('sections.membership')}>
      <dl className={dl}>
        <Row label={t('path')}>{p.path.map(n=>nodeName(n,locale)).join(' › ')}</Row>
        <Row label={t('sourceRecord')} mono>{m.sourceMembershipId?short(m.sourceMembershipId):'—'}</Row>
        <Row label={t('upstream')}>{p.scheme==='sw2021'?t('membershipUpstreamSw'):t('membershipUpstreamSic')}</Row>
        <Row label={t('rawHash')} mono>{short(m.rawHash)}</Row>
        <Row label={t('locator')} mono>{m.locator?JSON.stringify(m.locator):'—'}</Row>
        <Row label={t('availableDateLabel')} mono>{m.availableDate} <span className="font-sans text-text-dim">{availability}</span></Row>
        <Row label={t('validFrom')} mono>{m.validFrom}</Row>
        <Row label={t('validTo')} mono>{m.validTo??'—'}</Row>
        <Row label={t('batch')} mono>{short(m.batchId)}</Row>
      </dl>
    </Section>
  );
}
