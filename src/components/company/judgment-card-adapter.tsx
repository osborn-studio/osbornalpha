'use client';
// F4 JudgmentCard adapter (plan 2026-11-06 Task 13; spec §10.4). src/components/judgments/JudgmentCard
// does not exist yet: this local minimal renderer shows headline, calibration state, the percentage
// only when the caller passes one (already defended), band otherwise, settlement, method line.
// Brass only marks the calibrated badge; no stars (decision K). When F4 lands, edit ONLY this file:
// render <JudgmentCard card={card} /> and keep the `percent` override (pass percent=null cards through).
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Card, Tag } from '@/components/ui';
import type { JudgmentCardDto } from '@/lib/company/judgments';

export function JudgmentCardAdapter({ card, percent }: { card: JudgmentCardDto; percent: number | null }) {
  const t = useTranslations('company.judgments');
  const locale = useLocale() === 'en' ? 'en' : 'zh';
  const band = card.display.band;
  return (
    <Card className="flex flex-col gap-2" data-testid="judgment-card">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{card.display.headline[locale]}</h3>
        <Tag tone={card.calibration === 'calibrated' ? 'accent' : 'neutral'}>{card.calibration === 'calibrated' ? t('calibrated') : t('uncalibrated')}</Tag>
        {card.retrospective && <Tag>{t('retrospective')}</Tag>}
      </div>
      {percent !== null
        ? <div className="num text-2xl font-medium">{percent}%</div>
        : <div className="text-sm text-[var(--text-dim)]">{t('noPercent', { calibration: card.calibration })}{band ? ` · ${t('band', { band: t(band === 'low' ? 'bandLow' : band === 'mid' ? 'bandMid' : 'bandHigh') })}` : ''}</div>}
      {card.condition && <p className="text-xs text-[var(--text-dim)]">{t('condition', { text: card.condition.text[locale] })}</p>}
      {card.settlement && <p className="text-xs">{t('settled', { outcome: card.settlement.outcome ?? '—', date: card.settlement.settled_at.slice(0, 10) })}</p>}
      {card.calibration_summary?.n_independent != null && <p className="num text-xs text-[var(--text-dim)]">{t('historyN', { n: String(card.calibration_summary.n_independent) })}</p>}
      <p className="text-[11px] text-[var(--text-dim)]">{t('method', { id: card.methodology.id, version: card.methodology.version, asOf: card.as_of })}</p>
      {(card.methodology.href || card.calibration_summary?.href) && (
        <p className="flex flex-wrap gap-3 text-xs">
          {card.methodology.href && <RefLink href={card.methodology.href}>{t('methodLink')}</RefLink>}
          {card.calibration_summary?.href && <RefLink href={card.calibration_summary.href}>{t('calibrationLink')}</RefLink>}
        </p>
      )}
      {card.inputs.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="judgment-inputs">
          <span className="text-[11px] text-[var(--text-dim)]">{t('inputs')}</span>
          <ul className="flex flex-col gap-0.5 text-xs">
            {card.inputs.map((inp, i) => {
              const label = typeof inp.label === 'string' ? inp.label : inp.label ? inp.label[locale] : t('inputFallback', { n: String(i + 1) });
              return <li key={i}>{inp.href ? <RefLink href={inp.href}>{label}</RefLink> : label}</li>;
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** Same-site paths go through next/link; absolute https references open in a new window. href is pre-validated by the contract (safeHref). */
function RefLink({ href, children }: { href: string; children: React.ReactNode }) {
  const cls = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]';
  return href.startsWith('/')
    ? <Link href={href as never} className={cls}>{children}</Link>
    : <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{children}</a>;
}
