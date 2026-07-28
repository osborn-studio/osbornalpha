import { getTranslations } from 'next-intl/server';
import { CopilotClient } from './CopilotClient';

// Auth-gated server component — must render dynamically per request (see briefs/page.tsx).
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Copilot' };

export default async function CopilotPage({ searchParams }: { searchParams: Promise<{ ticker?: string; method?: string; q?: string }> }) {
  // Next.js already decodes searchParams values — they arrive as plain strings,
  // not percent-encoded. No further decodeURIComponent needed here.
  const query = await searchParams;
  const t = await getTranslations('market.copilot');
  return (
    <>
      <h1 className="mb-3 text-xl font-bold">{t('pageTitle')}</h1>
      <CopilotClient
        initialTicker={query.ticker ?? ''}
        initialQuestion={query.q ?? ''}
        methodId={query.method}
      />
    </>
  );
}
