import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Panel } from '@/components/ui';
import { quotaNoticeContent, type QuotaNoticeReason } from './quota-notice-content';

export interface QuotaNoticeProps {
  used: number;
  limit: number;
  plan: string;
  /** Omitted for legacy count quota callers. */
  reason?: QuotaNoticeReason;
  /** Daily platform cap in micro-RMB, used only for cost exhaustion copy. */
  costLimitMicrormb?: number;
  /** Feature-agnostic by default — pass a label if the surrounding UI needs it. */
  feature?: string;
}

// Shared upgrade-path card for all three metered surfaces (copilot SSE error,
// perspectives 'quota' response, brief/preview 429). Deliberately feature-
// agnostic copy — the same card renders under the copilot stream, the AI 观点
// tab, and the daily brief preview without needing per-surface strings.
//
// i18n note (G1b): every string here already exists verbatim under
// common.quota.* (wired in G1a). Extending that single source in place
// rather than duplicating under components.quotaNotice.
export function QuotaNotice({ used, limit, plan, reason, costLimitMicrormb }: QuotaNoticeProps) {
  const t = useTranslations('common.quota');
  const content = quotaNoticeContent({ used, limit, plan, reason, costLimitMicrormb });
  return (
    <Panel title={t(content.titleKey, content.titleValues as Record<string, string | number>)} className="border-accent-dim/40">
      <div className="text-sm text-text-dim">
        {content.descriptionKey === 'costDescription'
          ? t(content.descriptionKey, content.descriptionValues)
          : t(content.descriptionKey)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/settings"
          className="inline-block rounded-md bg-accent-dim px-3 py-1.5 text-xs font-semibold text-white"
        >
          {t('goToSettings')}
        </Link>
        {content.showUpgrade && (
          <Link
            href="/settings#upgrade"
            className="inline-block rounded-md border border-accent-dim/60 px-3 py-1.5 text-xs font-semibold text-accent-dim"
          >
            {t('upgradePro')}
          </Link>
        )}
      </div>
    </Panel>
  );
}
