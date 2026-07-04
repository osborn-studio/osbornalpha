import { redirect } from 'next/navigation';
import { TopBar } from '@/components/TopBar';
import { TabBar } from '@/components/TabBar';
import { CopilotFab } from '@/components/CopilotFab';
import { TimezoneProvider } from '@/components/TimezoneProvider';
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
  return (
    <TimezoneProvider>
      <TopBar />
      <main className="mx-auto w-full max-w-[1600px] p-3 lg:p-4">{children}</main>
      <TabBar />
      <CopilotFab />
    </TimezoneProvider>
  );
}
