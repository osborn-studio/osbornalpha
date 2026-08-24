import { requireResearchUser } from '@/lib/research/store';
import { listEntities } from '@/lib/research/entities';
import { withResearch } from '@/lib/research/api';
import type { EntityType } from '@/lib/research/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const url = new URL(req.url);
    const type = (url.searchParams.get('type') || undefined) as EntityType | undefined;
    const q = url.searchParams.get('q') || undefined;
    return { entities: await listEntities(ctx, { type, q }) };
  });
}
