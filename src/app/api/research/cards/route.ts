import { requireResearchUser } from '@/lib/research/store';
import { listCards } from '@/lib/research/cards/run';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/** WP-A8 weekly change cards, newest week first. `?week=YYYY-MM-DD` narrows to one week. */
export async function GET(req: Request) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const week = new URL(req.url).searchParams.get('week');
    return { cards: await listCards(ctx, week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : undefined) };
  });
}
