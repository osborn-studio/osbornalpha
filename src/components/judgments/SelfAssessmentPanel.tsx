// /analyst self-assessment block (spec §8.6, §11.2, canvas board 6): the §8.1 math on owner-writable scores, labelled
// "self-assessed, not auditable"; it never unlocks a percent and never enters judgment_calibrations.
import { useTranslations } from 'next-intl';
import { Metric, Panel } from '@/components/ui';
import type { SelfAssessment } from '@/lib/judgments/adapters/recommendation';
import { selfAssessmentView } from './analyst-view';

export function SelfAssessmentPanel({ assessment }: { assessment: SelfAssessment }) {
  const t = useTranslations('judgments');
  const v = selfAssessmentView(assessment);
  const th = 'pb-1 font-normal';
  return (
    <Panel title={t('analyst.selfAssessment.title')}>
      {v.empty ? (
        <p className="text-sm text-[var(--text-dim)]">{t('analyst.selfAssessment.empty')}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-6">
            <Metric label={t('analyst.selfAssessment.settled')} value={String(v.settled)} />
            <Metric label={t('analyst.selfAssessment.independent')} value={String(v.independent)} />
            <Metric label={t('analyst.selfAssessment.hitRate')} value={v.interval ? `${v.hitRate} (${v.interval})` : v.hitRate} />
            <Metric label={t('analyst.selfAssessment.brier')} value={v.brier} />
            <Metric label={t('analyst.selfAssessment.brierSkill')} value={v.brierSkill} />
          </div>
          <table className="num mt-3 w-full max-w-sm text-left text-xs">
            <caption className="sr-only">{t('analyst.selfAssessment.bandTable')}</caption>
            <thead>
              <tr className="text-[var(--text-dim)]">
                <th scope="col" className={th}>{t('analyst.selfAssessment.columns.band')}</th>
                <th scope="col" className={th}>{t('analyst.selfAssessment.columns.n')}</th>
                <th scope="col" className={th}>{t('analyst.selfAssessment.columns.hits')}</th>
                <th scope="col" className={th}>{t('analyst.selfAssessment.columns.rate')}</th>
              </tr>
            </thead>
            <tbody>
              {v.bands.map((b) => (
                <tr key={b.band} className="border-t border-[var(--border)]">
                  <td className="py-1">{t(`analyst.band.${b.band}`)}</td>
                  <td className="py-1">{b.n}</td>
                  <td className="py-1">{b.hits}</td>
                  <td className="py-1">{b.interval ? `${b.rate} (${b.interval})` : b.rate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="mt-2 text-xs text-[var(--text-dim)]">{t('analyst.selfAssessment.note')}</p>
    </Panel>
  );
}
