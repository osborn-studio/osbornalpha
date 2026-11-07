'use client';

// Judgment card (spec §9.2–§9.3, §9.5; canvas boards 1, 1b and 7). Below 640px it starts collapsed: one real button with the
// headline, type, calibration and value; tapping expands the full card. Percent appears only for probability × calibrated
// (visiblePercent); uncalibrated probabilities show a tercile band; categorical scores never show %. Brass only on the
// calibrated badge (CalibrationBadge); hit / miss use --up / --down.
import { useCallback, useId, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { CalibrationBadge } from './CalibrationBadge';
import { InputsDrawer, type DrawerTab } from './InputsDrawer';
import { LINK, TONE, cardBody, collapsedView, footerView, lifecycleView, type AnyCard, type CardBody } from './view-model';

const BANDS = ['low', 'mid', 'high'] as const;

function Body({ body, href }: { body: CardBody; href: string }) {
  const t = useTranslations('judgments');
  switch (body.type) {
    case 'percent':
      return (
        <div className="space-y-1">
          <div className="num text-[32px] font-medium leading-none">{body.text}</div>
          {body.hitRate && <p className="text-xs text-[var(--text-dim)]">{t(body.hitRate.key, body.hitRate.values)} · <Link className={LINK} href={href}>{t('ui.card.reliabilityLink')}</Link></p>}
        </div>
      );
    case 'band':
      return (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-xs text-[var(--text-dim)]">{t('ui.card.confidence')}</span>
            <span className="text-[22px] font-semibold">{body.band ? t(`ui.band.${body.band}`) : '—'}</span>
            <span className="text-[11px] text-[var(--text-dim)]">{t(body.note.key, body.note.values)}</span>
          </div>
          <div role="img" aria-label={t('ui.card.bandAria', { band: body.band ? t(`ui.band.${body.band}`) : '—' })} className="grid grid-cols-3 gap-[3px]">
            {BANDS.map((b) => <span key={b} className={`h-1.5 rounded ${b === body.band ? 'bg-[var(--text-dim)]' : 'bg-[var(--border)]'}`} />)}
          </div>
        </div>
      );
    case 'category':
      return body.realized !== null ? (
        <div className="grid grid-cols-2 gap-2">
          <div><div className="text-[11px] text-[var(--text-dim)]">{t('ui.card.selected')}</div><div className="text-lg font-semibold">{t.has(`ui.classes.${body.selected}`) ? t(`ui.classes.${body.selected}`) : body.selected}</div></div>
          <div><div className="text-[11px] text-[var(--text-dim)]">{t('ui.card.realized')}</div><div className="text-lg font-semibold">{t.has(`ui.classes.${body.realized}`) ? t(`ui.classes.${body.realized}`) : body.realized}</div></div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-baseline gap-2"><span className="text-[22px] font-semibold">{t.has(`ui.classes.${body.selected}`) ? t(`ui.classes.${body.selected}`) : body.selected}</span><span className="num text-[11px] text-[var(--text-muted)]">{body.selected}</span></div>
          <p className="text-[11px] text-[var(--text-dim)]">{body.accuracy ? t(body.accuracy.key, body.accuracy.values) : t('ui.card.scoresInDrawer')}</p>
        </div>
      );
    case 'score':
      return (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2"><span className="num text-[28px] font-medium">{body.value}</span><span className="text-[11px] text-[var(--text-dim)]">/ {body.scale}</span><span className="text-[11px] text-[var(--text-dim)]">{t(body.evaluation.key, body.evaluation.values)}</span></div>
          <ul className="space-y-1" aria-label={t('ui.card.dims')}>
            {body.dims.map((d) => (
              <li key={d.id} className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-2 text-[11px]">
                <span className="truncate text-[var(--text-dim)]">{d.label}</span>
                <span aria-hidden="true" className="h-1.5 rounded bg-[var(--border)]"><span className="block h-1.5 rounded bg-[var(--text-dim)]" style={{ width: `${d.width}%` }} /></span>
                <span className="num text-right">{d.missing ? t('ui.card.dimMissing') : d.value}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'interval':
      return (
        <div className="space-y-1">
          <div className="flex flex-wrap items-baseline gap-2"><span className="num text-[22px] font-medium">{body.range}</span>{body.realized !== null && <span className="text-[11px] text-[var(--text-dim)]">{t('ui.card.realizedValue', { value: body.realized })}</span>}</div>
          <p className="text-[11px] text-[var(--text-dim)]">{body.coverage ? t(body.coverage.key, body.coverage.values) : t('ui.card.nominalCoverage', { nominal: body.nominal ?? '—' })}</p>
        </div>
      );
    case 'abstained':
      return (
        <div className="rounded-md border border-dashed border-[var(--border)] p-3 text-sm">
          <p>{t('ui.card.abstained', { reason: body.reason })}</p>
          {body.missing.length > 0 && <p className="num mt-1 text-[11px] text-[var(--text-dim)]">{t('ui.card.missing', { items: body.missing.join(', ') })}</p>}
        </div>
      );
  }
}

export function JudgmentCard({ card }: { card: AnyCard }) {
  const t = useTranslations('judgments');
  const locale = useLocale() === 'en' ? 'en' : 'zh';
  const [open, setOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerTab | null>(null);
  const bodyId = useId();
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const life = lifecycleView(card);
  const collapsed = collapsedView(card, locale);
  const foot = footerView(card, locale);
  const s = card.settlement;
  return (
    <article className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]" aria-label={card.display.headline[locale]}>
      <button type="button" className="flex w-full items-center gap-3 p-3 text-left sm:hidden" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{collapsed.title}</span>
          <span className="block truncate text-[11px] text-[var(--text-dim)]">{t(collapsed.type.key)} · {t(collapsed.calibration.key, collapsed.calibration.values)}</span>
        </span>
        <span className="num shrink-0 text-base">{collapsed.percent ?? (collapsed.band ? t(`ui.band.${collapsed.band}`) : t(collapsed.lifecycle.key))}</span>
        <span aria-hidden="true" className="text-[var(--text-dim)]">{open ? '▴' : '▾'}</span>
      </button>
      <div id={bodyId} className={`${open ? 'flex' : 'hidden'} flex-col gap-3 p-4 sm:flex`}>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-dim)]">
          <span>{t(`ui.type.${card.judgment_type}`)}</span>
          <span className="num rounded border border-[var(--border)] px-1.5 py-0.5">{card.subject.key}</span>
          {card.retrospective && <span className="rounded border border-dashed border-[var(--border)] px-1.5 py-0.5">{t('ui.card.retrospective')}</span>}
          {card.merged_from && <span>{t('ui.card.mergedFrom', { key: card.merged_from })}</span>}
          {card.source === 'recommendation' && <span>{t('ui.card.private')}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px] ${TONE[life.tone]}`}>{t(life.msg.key)}</span>
          <CalibrationBadge state={card.calibration} summary={card.calibration_summary} />
        </div>
        <h3 className="text-base font-semibold">{card.display.headline[locale]}</h3>
        <Body body={cardBody(card, locale)} href={card.methodology.href} />
        {s && s.kind === 'settled' && <p className="text-xs text-[var(--text-dim)]">{t('ui.card.result', { outcome: t(life.msg.key), value: s.realized ? String(s.realized.label ?? s.realized.value) : '—' })}</p>}
        {s && s.kind !== 'settled' && <p className="rounded-md border border-[var(--border)] p-2 text-xs">{t(`ui.card.reason.${s.kind}`, { reason: s.evidence_summary[locale] })}</p>}
        <p className="border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-dim)]">
          {t('ui.card.method')} <Link className={`num ${LINK}`} href={card.methodology.href}>{foot.method}</Link>
          {' · '}{t('ui.card.asOf', { date: foot.asOf })}
          {foot.condition && <>{' · '}{t('ui.card.condition', { text: foot.condition })}</>}
          {foot.target && <>{' · '}{t('ui.card.target', { target: foot.target })}</>}
          {' · '}{t('ui.card.settlement', { state: t(life.msg.key) })}
        </p>
        {card.lifecycle !== 'abstained' && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-dim)] hover:text-[var(--text)]" onClick={() => setDrawer('inputs')}>{t('ui.card.inputs', { count: card.inputs.length })}</button>
            <button type="button" className="rounded border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-dim)] hover:text-[var(--text)]" onClick={() => setDrawer('timeline')}>{t('ui.card.timeline')}</button>
          </div>
        )}
      </div>
      {drawer && <InputsDrawer card={card} initialTab={drawer} onClose={closeDrawer} />}
    </article>
  );
}
