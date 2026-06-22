import { CopilotClient } from './CopilotClient';

// Auth-gated server component — must render dynamically per request (see briefs/page.tsx).
export const dynamic = 'force-dynamic';

export default function CopilotPage({ searchParams }: { searchParams: { ticker?: string } }) {
  return (
    <>
      <h1 className="mb-3 text-xl font-bold">🎩 John Cameron · 投研助手</h1>
      <CopilotClient initialTicker={searchParams.ticker ?? ''} />
    </>
  );
}
