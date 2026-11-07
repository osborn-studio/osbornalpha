// /intel/macro — macro workbench (spec §3.1, §3.2). Server component: reads the judgment flag server-side and builds
// correlation options from the catalog; data loads client-side from /api/macro/*.
import { MacroWorkbench, type WorkbenchTab } from '@/components/macro/MacroWorkbench';
import { correlationOptions } from '@/lib/macro/workbench-options';

// Auth-gated server component — must render dynamically per request (see briefs/page.tsx).
export const dynamic = 'force-dynamic';
const TABS: readonly WorkbenchTab[] = ['overview', 'indicators', 'correlation', 'methodology'];

export default async function MacroPage({ searchParams }: { searchParams: Promise<{ region?: string; tab?: string }> }) {
  const sp = await searchParams;
  const region = sp.region === 'CN' ? 'CN' : 'US';
  const tab = TABS.find((x) => x === sp.tab) ?? 'overview';
  const judgmentsEnabled = process.env.MACRO_JUDGMENTS_ENABLED === '1';
  return <MacroWorkbench initialRegion={region} initialTab={tab} judgmentsEnabled={judgmentsEnabled} options={correlationOptions()} />;
}
