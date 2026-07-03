import Link from 'next/link';
import { Panel } from '@/components/ui';

export interface QuotaNoticeProps {
  used: number;
  limit: number;
  plan: string;
  /** Feature-agnostic by default — pass a label if the surrounding UI needs it. */
  feature?: string;
}

// Shared upgrade-path card for all three metered surfaces (copilot SSE error,
// perspectives 'quota' response, brief/preview 429). Deliberately feature-
// agnostic copy — the same card renders under the copilot stream, the AI 观点
// tab, and the daily brief preview without needing per-surface strings.
export function QuotaNotice({ used, limit, plan }: QuotaNoticeProps) {
  const isPro = plan === 'pro';
  return (
    <Panel title={`今日平台额度已用完（${used}/${limit}）`} className="border-accent-dim/40">
      <div className="text-sm text-text-dim">
        {isPro
          ? 'Pro 额度也用完了——填入自己的 API Key 即可不限量使用，或等待明日 00:00（北京时间）重置。'
          : '填入自己的 API Key 即可不限量使用，或等待明日 00:00（北京时间）重置。'}
      </div>
      <Link
        href="/settings"
        className="mt-3 inline-block rounded-md bg-accent-dim px-3 py-1.5 text-xs font-semibold text-white"
      >
        去设置 →
      </Link>
    </Panel>
  );
}
