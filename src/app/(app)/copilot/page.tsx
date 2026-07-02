import { CopilotClient } from './CopilotClient';

// Auth-gated server component — must render dynamically per request (see briefs/page.tsx).
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Copilot' };

export default function CopilotPage({ searchParams }: { searchParams: { ticker?: string; method?: string; q?: string } }) {
  // Next.js already decodes searchParams values — they arrive as plain strings,
  // not percent-encoded. No further decodeURIComponent needed here.
  return (
    <>
      <h1 className="mb-3 text-xl font-bold">🎩 John Cameron · 投研助手</h1>
      <CopilotClient
        initialTicker={searchParams.ticker ?? ''}
        initialQuestion={searchParams.q ?? ''}
        methodId={searchParams.method}
      />
    </>
  );
}
