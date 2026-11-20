'use client';
// F4 read states fail closed on response mismatches; read status is not a data-state badge.
import { useTranslations } from 'next-intl';
import { JUDGMENTS_FLAG } from '@/lib/company/client';
import { checkJudgmentsResponse, companyJudgmentCard, judgmentsUrl } from '@/lib/company/judgments';
import { useCompanyFetch } from './useCompanyFetch';
import { Callout, LoadingGrid } from './StateCallout';
import { JudgmentCard } from '@/components/judgments/JudgmentCard';
import { MarkCard } from '@/components/research-ui';
import { Button } from '@/components/ui';
import { judgmentsState, type JudgmentsState } from './judgments-state';

export function JudgmentsContent({model,retry}:{model:JudgmentsState;retry:()=>void}) {
  const t=useTranslations('company.judgments');
  const ts=useTranslations('company.states');
  let content;
  switch(model.state){
    case 'off': content=<Callout><strong className="text-text">{t('emptyTitle')}</strong><p>{t('empty')}</p></Callout>;break;
    case 'none': content=<Callout>{t('none')}</Callout>;break;
    case 'loading': content=<div className="overflow-hidden"><LoadingGrid/></div>;break;
    case 'cards': content=<div className="grid grid-cols-1 gap-3 md:grid-cols-2">{model.cards.map(c=><MarkCard kind="judgment" key={c.judgment_id}><JudgmentCard card={companyJudgmentCard(c)} subject={false}/></MarkCard>)}</div>;break;
    default: content=<div role="alert" className={`space-y-2 rounded-lg border bg-bg-elevated p-4 text-sm ${model.state==='failed'?'border-[var(--danger)] text-[var(--danger)]':'border-[var(--warn)] text-[var(--warn)]'}`}>
      <strong>{model.state==='failed'?t('loadFailed',{code:model.code}):t('replayFailed')}</strong>
      <p className="text-text-dim">{t(model.state==='failed'?'loadFailedBody':'replayFailedBody')}</p>
      <Button variant="secondary" size="sm" className="min-h-11 sm:min-h-0" onClick={retry}>{ts('retry')}</Button>
    </div>;
  }
  return <div data-judgments-state={model.state}>{content}</div>;
}
export function JudgmentsView({ issuerId, asOf }: { issuerId: string | null; asOf: string | null }) {
  const enabled=JUDGMENTS_FLAG&&!!issuerId;
  const {state,retry}=useCompanyFetch<unknown>(enabled?judgmentsUrl(issuerId,asOf):null);
  const check=enabled&&state.status!=='idle'&&state.status!=='loading'&&state.status!=='error'&&'data' in state?checkJudgmentsResponse(state.data,asOf,issuerId):null;
  return <JudgmentsContent model={judgmentsState({flagOn:JUDGMENTS_FLAG,issuerId,asOf,fetch:state,check})} retry={retry}/>;
}
