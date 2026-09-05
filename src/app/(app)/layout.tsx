import { redirect } from 'next/navigation';
import { TopBar } from '@/components/TopBar';
import { TabBar } from '@/components/TabBar';
import { CopilotFab } from '@/components/CopilotFab';
import { TimezoneProvider } from '@/components/TimezoneProvider';
import { FirstLoginTracker } from '@/components/FirstLoginTracker';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';
import { AppSessionProvider, type AppSessionUser } from '@/components/AppSessionProvider';

// Protected route group. Unauthenticated users are kept out (middleware redirects
// first; this server-side guard is the backup so a bypassed middleware can't leak
// the product). When Supabase is unconfigured (local dev), allow through so the
// app still runs without env vars.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const configured = serverIsSupabaseConfigured();
  let user: AppSessionUser | null = null;
  if (configured) {
    const sb = await getServerSupabase();
    const { data: { user: authenticatedUser } } = await sb.auth.getUser();
    if (!authenticatedUser) redirect('/login');
    user = { id: authenticatedUser.id, email: authenticatedUser.email ?? null };
  }
  return (
    <AppSessionProvider configured={configured} user={user}>
      <TimezoneProvider>
        <FirstLoginTracker />
        <TopBar />
        <main className="mx-auto w-full max-w-[1600px] p-3 lg:p-4">{children}</main>
        <TabBar />
        <CopilotFab />
      </TimezoneProvider>
    </AppSessionProvider>
  );
}
