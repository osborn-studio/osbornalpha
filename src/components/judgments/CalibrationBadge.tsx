// Method-level calibration badge (spec §9.1, §9.3; canvas legend). Brass only for 'calibrated'; every other state is neutral grey.
import { useTranslations } from 'next-intl';
import type { CalibrationState, JudgmentCard } from '@/lib/judgments/types';
import { badgeClass, calibrationMsg } from './view-model';

export function CalibrationBadge({ state, summary = null, className = '' }: { state: CalibrationState; summary?: JudgmentCard['calibration_summary']; className?: string }) {
  const t = useTranslations('judgments');
  const m = calibrationMsg(state, summary);
  return (
    <span data-calibration={state} className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] leading-tight ${badgeClass(state)} ${className}`}>
      {t(m.key, m.values)}
    </span>
  );
}
