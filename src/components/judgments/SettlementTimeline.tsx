// Settlement timeline (spec §9.5, canvas board 3): registered → target → settled / void / withdrawn / reopened → pending.
// Evidence is append-only, so every settlement row is a step; the old rows of a reopened judgment stay visible.
import { useLocale, useTranslations } from 'next-intl';
import type { SettlementRow } from '@/lib/judgments/types';
import type { WireCard as JudgmentCard } from './api-types';
import { TONE, minute, timelineSteps } from './view-model';

export function SettlementTimeline({ card, settlements }: { card: JudgmentCard; settlements?: SettlementRow[] }) {
  const t = useTranslations('judgments');
  const locale = useLocale() === 'en' ? 'en' : 'zh';
  const steps = timelineSteps(card, settlements, locale);
  return (
    <ol className="space-y-3" aria-label={t('ui.timeline.title')}>
      {steps.map((s, i) => (
        <li key={`${s.key}:${i}`} className="flex gap-3">
          <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.done ? 'bg-[var(--text-dim)]' : 'border border-[var(--border)]'}`} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <strong className={`text-sm ${s.tone === 'neutral' ? '' : TONE[s.tone]}`}>{t(s.key)}</strong>
              {s.at && <time className="num text-[11px] text-[var(--text-dim)]" dateTime={s.at}>{minute(s.at)}</time>}
            </div>
            {s.detail && <p className="break-words text-xs text-[var(--text-dim)]">{s.detail}</p>}
          </div>
        </li>
      ))}
      <li className="text-[11px] text-[var(--text-muted)]">{t('ui.timeline.asKnownNote')}</li>
    </ol>
  );
}
