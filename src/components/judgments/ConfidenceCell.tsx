'use client';

// /analyst "信心" column (spec §11.2, owner decision O5, canvas board 6): tercile band + "uncalibrated", never a percent;
// the registered value is shown in the row expansion (ConfidenceDetail).
import { useLocale, useTranslations } from 'next-intl';
import type { PrivateJudgmentCard } from '@/lib/judgments/types';
import { bandSegments, confidenceView } from './analyst-view';

export function ConfidenceCell({ card, expanded, controls, onToggle }: { card: PrivateJudgmentCard | null; expanded: boolean; controls: string; onToggle: () => void }) {
  const t = useTranslations('judgments');
  const v = confidenceView(card);
  if (!v.band) return <span className="text-[var(--text-dim)]">--</span>;
  const label = t(`analyst.band.${v.band}`);
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className="grid w-9 grid-cols-3 gap-[2px]">
        {bandSegments(v.band).map((on, i) => <span key={i} className={`h-1.5 rounded-sm ${on ? 'bg-[var(--text-dim)]' : 'bg-[var(--border)]'}`} />)}
      </span>
      <span>{label}</span>
      <span className="text-[10px] text-[var(--text-muted)]">{t('analyst.uncalibrated')}</span>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? controls : undefined}
        aria-label={t('analyst.toggleAria', { band: label })}
        onClick={onToggle}
        className="rounded border border-[var(--border)] px-1 text-[10px] text-[var(--text-dim)] hover:text-[var(--text)]"
      >
        {expanded ? t('analyst.hideRegistered') : t('analyst.showRegistered')}
      </button>
    </span>
  );
}

export function ConfidenceDetail({ card }: { card: PrivateJudgmentCard | null }) {
  const t = useTranslations('judgments');
  const locale = useLocale() === 'en' ? 'en' : 'zh';
  const v = confidenceView(card);
  if (!v.lifecycle) return null;
  const target = v.condition?.target;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      <dt className="text-[var(--text-dim)]">{t('analyst.registeredLabel')}</dt>
      <dd><span className="num">{v.registered === null ? '--' : `p = ${v.registered}`}</span> <span className="text-[var(--text-muted)]">{t('analyst.registeredNote')}</span></dd>
      <dt className="text-[var(--text-dim)]">{t('analyst.lifecycleLabel')}</dt>
      <dd>{t(`analyst.lifecycle.${v.lifecycle}`)}{v.outcome ? ` · ${t(`analyst.outcome.${v.outcome}`)}` : ''}</dd>
      {v.abstainReason && (
        <>
          <dt className="text-[var(--text-dim)]">{t('analyst.abstainLabel')}</dt>
          <dd>{t(`analyst.abstain.${v.abstainReason}`)}</dd>
        </>
      )}
      {v.condition && (
        <>
          <dt className="text-[var(--text-dim)]">{t('analyst.conditionLabel')}</dt>
          <dd>{v.condition.text[locale]}</dd>
          <dt className="text-[var(--text-dim)]">{t('analyst.targetLabel')}</dt>
          <dd className="num">
            {target?.kind === 'session_index' ? t('analyst.target', { base: target.base_date, n: target.n }) : '--'}
            {' · '}{t('analyst.settleBy', { date: v.condition.settle_by.slice(0, 10) })}
          </dd>
        </>
      )}
    </dl>
  );
}
