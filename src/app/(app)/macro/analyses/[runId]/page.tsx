// /intel/macro/analyses/[runId] — the caller's saved correlation run (spec §3.1). Server shell; RLS read client-side.
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AnalysisRunView } from '@/components/macro/AnalysisRunView';

// Auth-gated server component — must render dynamically per request (see briefs/page.tsx).
export const dynamic = 'force-dynamic';

export default async function MacroAnalysisPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const t = await getTranslations('macro');
  return (
    <div className="space-y-3">
      <Link href="/intel/macro?tab=correlation" className="text-sm">{t('page.back')}</Link>
      <AnalysisRunView runId={runId} />
    </div>
  );
}
