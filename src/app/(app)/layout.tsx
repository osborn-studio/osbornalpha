import { redirect } from 'next/navigation';
import { TopBar } from '@/components/TopBar';
import { ResearchChain } from '@/components/research-ui/ResearchChain';
// FOREIGN ↓ Chain availability from the cached public settings flag.
import {DEFAULT_CHAIN_AVAILABILITY} from '@/components/research-ui/chain';
import {readForeignPublicEnabled} from '@/lib/broker-research/public-flag';
// FOREIGN ↑
// TOPICS ↓ chain step 05 follows the cached public switch
import {readTopicsPublicEnabled} from '@/lib/topics/public-flag';
// TOPICS ↑
import { TabBar } from '@/components/TabBar';
import { CopilotFab } from '@/components/CopilotFab';
import { TimezoneProvider } from '@/components/TimezoneProvider';
import { FirstLoginTracker } from '@/components/FirstLoginTracker';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';

// Protected route group. Unauthenticated users are kept out (middleware redirects
// first; this server-side guard is the backup so a bypassed middleware can't leak
// the product). When Supabase is unconfigured (local dev), allow through so the
// app still runs without env vars.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (serverIsSupabaseConfigured()) {
    const sb = await getServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) redirect('/login');
  }
  // TOPICS ↓
  const availability = {...DEFAULT_CHAIN_AVAILABILITY, foreign: await readForeignPublicEnabled(), topic: await readTopicsPublicEnabled()};
  // TOPICS ↑
  return (
    <TimezoneProvider>
      <FirstLoginTracker />
      {/* // FOREIGN ↓ */}
      <TopBar />
      <ResearchChain availability={availability} />
      {/* // FOREIGN ↑ */}
      <main className="mx-auto w-full max-w-[1600px] p-3 lg:p-4">{children}</main>
      <TabBar />
      <CopilotFab />
    </TimezoneProvider>
  );
}
