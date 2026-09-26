import { requireResearchUser } from '@/lib/research/store';
import { listCards } from '@/lib/research/cards/run';
import { recordCardExposure } from '@/lib/research/weekly/weekly';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/** WP-A8 weekly change cards, newest week first. `?week=YYYY-MM-DD` narrows to one week. */
export async function GET(req: Request) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const week = new URL(req.url).searchParams.get('week');
    const cards = await listCards(ctx, week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : undefined);
    // Showing cards here counts as exposure: a weekly baseline frozen afterwards would not be independent.
    if (process.env.ALPHA_S4_ENABLED === '1') await recordCardExposure({ actor: { userId: ctx.userId, kind: 'human' }, cards, origin: 'cards_page' });
    return { cards };
  });
}
