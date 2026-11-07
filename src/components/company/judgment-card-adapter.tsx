'use client';
// F4 JudgmentCard adapter (plan 2026-11-06 Task 13; spec §10.4). src/components/judgments/JudgmentCard
// does not exist yet: this local minimal renderer shows headline, calibration state, the percentage
// only when the caller passes one (already defended), band otherwise, settlement, method line.
// Brass only marks the calibrated badge; no stars (decision K). When F4 lands, edit ONLY this file:
// render <JudgmentCard card={card} /> and keep the `percent` override (pass percent=null cards through).
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
    </Card>
  );
}
