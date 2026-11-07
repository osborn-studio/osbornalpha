// /intel/macro/[seriesId] — indicator detail (spec §3.3). Server component: catalog whitelist; data loads client-side.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { IndicatorDetail } from '@/components/macro/IndicatorDetail';
import { catalogById } from '@/lib/macro/catalog';

// Auth-gated server component — must render dynamically per request (see briefs/page.tsx).
export const dynamic = 'force-dynamic';

export default async function MacroSeriesPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params;
  const def = catalogById(seriesId);
  if (!def || def.role === 'event_source') notFound();
  const t = await getTranslations('macro');
  return (
    <div className="space-y-3">
      <Link href={`/intel/macro?region=${def.region}&tab=indicators`} className="text-sm">{t('page.back')}</Link>
      <IndicatorDetail seriesId={def.id} />
    </div>
  );
}
