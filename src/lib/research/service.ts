/**
 * Service-role ResearchCtx for trusted, non-browser entry points:
 *   - scripts/research-*.ts (local CLI: seed / radar ingest / daily / migrate)
 *   - /api/cron/research-daily (Vercel cron, CRON_SECRET-gated)
 *
 * The admin client BYPASSES RLS, so ownership comes from RESEARCH_OWNER_USER_ID
 * (the auth.users id every row is written under). Every research query filters
 * by ctx.userId explicitly, so a service ctx stays scoped to that owner.
 */

import { getAdminSupabase } from '@/lib/supabase/admin';
import type { ResearchCtx, ResearchSupabase } from './store';

export function getServiceResearchCtx(): ResearchCtx {
  const userId = process.env.RESEARCH_OWNER_USER_ID;
  if (!userId || userId.trim() === '') {
    throw new Error(
      'RESEARCH_OWNER_USER_ID is not set — research service scripts/cron need the owner auth.users id ' +
      '(query: select id from auth.users where email = <owner email>).',
    );
  }
  return {
    supabase: getAdminSupabase() as unknown as ResearchSupabase,
    userId: userId.trim(),
  };
}
