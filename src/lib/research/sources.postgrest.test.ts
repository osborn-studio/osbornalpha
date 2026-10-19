/**
 * listSourcesForEntity against the real supabase-js encoder and, when a stack
 * is available, against real PostgREST.
 *
 * research_source_documents.entity_ids is a jsonb column. supabase-js encodes
 * a JS array passed to .contains() as a PostgreSQL array literal (`cs.{…}`),
 * which PostgREST hands to jsonb @> and PostgreSQL rejects with
 * "invalid input syntax for type json" (SQLSTATE 22P02). The in-memory mock in
 * test-support.ts cannot see that, so this file checks the wire format.
 *
 * The live block runs only when both are set (never read from .env files):
 *   ALPHA_POSTGREST_TEST_URL               e.g. http://127.0.0.1:54321
 *   ALPHA_POSTGREST_TEST_SERVICE_ROLE_KEY  the stack's service_role key
 */
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ResearchCtx } from './store';
import { ingestSource, listSourcesForEntity } from './sources';

describe('listSourcesForEntity wire format', () => {
  it('sends the entity id as a JSON array so PostgREST applies jsonb @>', async () => {
    const requests: URL[] = [];
    const fetchStub: typeof fetch = async (input) => {
      requests.push(new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url));
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const supabase = createClient('http://stub.invalid', 'anon', { global: { fetch: fetchStub } });
    const ctx: ResearchCtx = { supabase, userId: randomUUID() };
    const entityId = randomUUID();

    await listSourcesForEntity(ctx, entityId);

    expect(requests).toHaveLength(1);
    const filter = requests[0].searchParams.get('entity_ids');
    expect(filter).toMatch(/^cs\./);
    // The needle after `cs.` must be JSON, not the `{…}` array literal.
    expect(JSON.parse(filter!.slice('cs.'.length))).toEqual([entityId]);
  });
});

const liveUrl = process.env.ALPHA_POSTGREST_TEST_URL;
const liveKey = process.env.ALPHA_POSTGREST_TEST_SERVICE_ROLE_KEY;

describe.skipIf(!liveUrl || !liveKey)('listSourcesForEntity on real PostgREST', () => {
  let supabase: SupabaseClient;
  let ctx: ResearchCtx;
  const entityId = randomUUID();

  beforeAll(async () => {
    supabase = createClient(liveUrl!, liveKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase.auth.admin.createUser({
      email: `sources-postgrest-${randomUUID()}@example.test`,
      email_confirm: true,
    });
    if (error) throw error;
    ctx = { supabase, userId: data.user.id };
    const seed = `sources.postgrest ${entityId} ${randomUUID()}`;
    const ingested = await ingestSource(ctx, {
      source_type: 'NEWS',
      title: 'linked to the entity',
      raw_text: seed,
      entity_ids: [entityId],
    });
    expect(ingested.duplicate).toBe(false);
  });

  afterAll(async () => {
    // auth.users → research_* rows cascade on delete.
    if (ctx) await supabase.auth.admin.deleteUser(ctx.userId);
  });

  it('returns the sources linked to the entity', async () => {
    const rows = await listSourcesForEntity(ctx, entityId);
    expect(rows.map((r) => r.title)).toEqual(['linked to the entity']);
    expect(rows[0].entity_ids).toEqual([entityId]);
  });

  it('returns an empty list for an entity with no sources', async () => {
    await expect(listSourcesForEntity(ctx, randomUUID())).resolves.toEqual([]);
  });
});
