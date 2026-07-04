import { assertEnabled, getDb } from '@/lib/research/db';
import { listMemos } from '@/lib/research/memos';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  return withResearch(() => {
    assertEnabled();
    const db = getDb();
    return { memos: listMemos(db) };
  });
}
