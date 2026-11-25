import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { supabaseTableClient } from '@/lib/db/table-client';
import { freshnessOf } from '@/lib/dq/freshness';
import { LICENSES_PATH, validateLicenseTable } from '@/lib/judgments/methodology-sync';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { buildAdminView, readRouting } from './admin-view';

async function readOrNull<T>(read:() => Promise<T>) {
  try { return await read(); } catch { return null; }
}

export async function loadAdminView() {
  const db = () => supabaseTableClient(getAdminSupabase());
  const [freshness, industry, judgments, hasBatches] = await Promise.all([
    readOrNull(() => freshnessOf(db())),
    readOrNull(() => db().select('industry_dataset_licenses', {}, { orderBy:'dataset_key', limit:100 })),
    readOrNull(async () => validateLicenseTable(JSON.parse(await readFile(join(process.cwd(), LICENSES_PATH), 'utf8')))),
    readOrNull(async () => (await db().select('ingest_batches', {}, { limit:1 })).length > 0),
  ]);
  return buildAdminView(readRouting(), { freshness, industry, judgments, hasBatches });
}
