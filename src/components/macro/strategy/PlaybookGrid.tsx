'use client';
// Playbook library (spec §3.3, §5.2): four neutral cards of a static hypothesis framework. Trigger rows are the rule
// table verbatim with the rule parameter; mechanism and implications are labelled assumptions. A brass outline and the
// "F4 判定" word appear only for the F4 card category on the manifest's snapshot; cards never show an F4 number.
// Below sm each card collapses into a <details>.
import Link from 'next/link';
import { Panel, Tag } from '@/components/ui';
import type { F4Mark, F4Summary, JudgmentStatus, PlaybookView } from '@/lib/macro/strategy/contract';
import { PLAYBOOK_DISCLAIMER_V1 } from '@/lib/macro/strategy/data/playbooks-v1';
import { F4SummaryPanel } from './F4Summary';
import { playbookCards, playbookNotice, type PlaybookCard } from './strategy-view-model';
import { useStrategyT } from './use-strategy-t';

export function PlaybookGrid({ playbooks, judgment }: { playbooks: PlaybookView[]; judgment: { status: JudgmentStatus; f4?: { mark: F4Mark; summary: F4Summary } } }) {
  const { t, locale } = useStrategyT();
  const f4 = judgment.f4 ?? null;
  const cards = playbookCards(playbooks, locale, f4);
  const notice = playbookNotice(judgment.status, f4);
  return (
    <Panel className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('playbook.title')} <span className="text-xs font-normal text-text-dim">{t('playbook.subtitle')}</span></h2>
        <span className="text-[11px] text-text-dim">{t('playbook.supportNote')}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.regime} className={`rounded-md border p-3 ${c.marked ? 'border-[var(--border-active)] bg-[var(--accent-wash)]' : 'border-border'}`}>
            <div className="hidden sm:block"><CardBody card={c} /></div>
            <details className="sm:hidden">
              <summary className="cursor-pointer text-sm font-semibold">{c.title}{c.marked ? ` · ${t('playbook.mark')}` : ''}</summary>
              <CardBody card={c} />
            </details>
          </div>
        ))}
      </div>
      {notice ? <p className="text-[11px] text-text-dim">{notice.key === 'playbook.earlier' ? t(notice.key, { date: notice.date }) : t(notice.key)}</p> : null}
      {f4 ? <F4SummaryPanel summary={f4.summary} /> : null}
    </Panel>
  );
}

function CardBody({ card }: { card: PlaybookCard }) {
  const { t, locale } = useStrategyT();
  return (
    <div className="space-y-2 text-xs">
      <div className="hidden items-center justify-between gap-2 sm:flex">
        <span className="text-sm font-semibold">{card.title}</span>
        {card.marked ? <Tag tone="accent">{t('playbook.mark')}</Tag> : null}
      </div>
      <div className="text-[11px] text-text-dim">{t('playbook.triggers')}</div>
      <ul className="space-y-0.5 font-mono tabular-nums">{card.triggers.map((x) => <li key={x}>{x}</li>)}</ul>
      <div className="text-[11px] text-text-dim">{t('playbook.mechanism')}</div>
      <p className="text-text-dim">{card.mechanism.join(' → ')}</p>
      <div className="text-[11px] text-text-dim">{t('playbook.implications')}</div>
      <p className="text-text-dim">{t('playbook.favored')}：{card.favored.join('、')} · {t('playbook.disfavored')}：{card.disfavored.join('、')}</p>
      <p className="text-[10px] text-text-dim">{PLAYBOOK_DISCLAIMER_V1[locale]}</p>
      {card.watch.length > 0 ? (
        <p className="text-[11px] text-text-dim">
          {t('playbook.watch')}{' '}
          {card.watch.map((w, i) => (
            <span key={w.id}>{i > 0 ? ' · ' : ''}<Link href={`/intel/macro/${w.id}`} className="text-accent hover:underline">{w.name}</Link></span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
