// src/components/industries/StateNotice.tsx
// Page and section states (spec §8.2, §12; canvas "States"): loading is a static skeleton (no spinner,
// no "Loading…" text), error and replay-mismatch are alerts in the danger tone, the rest are neutral
// callouts; admin-preview is the brass bar. Titles/bodies default to messages industries.states.<kind>.
import type {ReactNode} from 'react';
import {useTranslations} from 'next-intl';

export type NoticeKind='loading'|'stale'|'error'|'unlicensed'|'empty'|'reconstruction'|'partialUnpublished'|'replayMismatch'|'officialUnavailable'|'notEnabled'|'adminPreview'|'noJudgment'|'currentOnly'|'noMembers';

const TONE:Record<NoticeKind,string>={
  loading:'',stale:'border-warn',error:'border-danger',unlicensed:'border-border',empty:'border-border',reconstruction:'border-warn',
  partialUnpublished:'border-border',replayMismatch:'border-danger',officialUnavailable:'border-border',notEnabled:'border-border',
  adminPreview:'border-accent bg-[var(--accent-wash)]',noJudgment:'border-border',currentOnly:'border-warn',noMembers:'border-border',
};

export function StateNotice({kind,values,body,children}:{kind:NoticeKind;values?:Record<string,string|number>;body?:string;children?:ReactNode}){
  const t=useTranslations('industries.states');
  if(kind==='loading'){
    return (
      <div role="status" aria-busy="true" data-state="loading" className="card-base">
        <span className="sr-only">{t('loading.title')}</span>
        <div className="mb-3 flex gap-3"><div className="h-7 w-44 rounded bg-bg-elevated" /><div className="ml-auto h-7 w-28 rounded bg-bg-elevated" /></div>
        <div className="grid grid-cols-[120px_repeat(8,minmax(0,1fr))] gap-[3px]">
          {Array.from({length:27},(_,i)=><div key={i} className="h-6 rounded-[3px] bg-bg-elevated" />)}
        </div>
      </div>
    );
  }
  const alert=kind==='error'||kind==='replayMismatch';
  return (
    <div role={alert?'alert':'status'} data-state={kind} className={`rounded-lg border p-4 ${TONE[kind]}`}>
      <div className={`text-sm font-semibold ${alert?'text-danger':kind==='adminPreview'?'text-accent':'text-text'}`}>{t(`${kind}.title`,values)}</div>
      <p className="mt-1 max-w-[65ch] text-sm text-text-dim">{body??t(`${kind}.body`,values)}</p>
      {children&&<div className="mt-3 flex flex-wrap items-center gap-3 text-sm">{children}</div>}
    </div>
  );
}
