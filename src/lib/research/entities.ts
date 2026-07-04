/**
 * Entity service (Research OS Phase 5 — Supabase Postgres).
 * Companies + themes with idempotent upsert keyed by (type, lower(name)) —
 * the seed script can run any number of times without duplicating rows.
 * (Single-user data volume is tiny, so the case-insensitive match is done
 * client-side; the (user_id, type, lower(name)) unique index backstops races.)
 */

import { isUuid, type ResearchCtx } from './store';
import type { Entity, EntityType } from './types';

const TABLE = 'research_entities';

export interface UpsertEntityInput {
  type: EntityType;
  name: string;
  aliases?: string[];
  ticker?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
}

function rowToEntity(row: any): Entity {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    aliases: Array.isArray(row.aliases) ? (row.aliases as string[]) : [],
    ticker: row.ticker,
    description: row.description,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Idempotent upsert by (type, lower(name)). Returns the entity id. */
export async function upsertEntity(ctx: ResearchCtx, input: UpsertEntityInput): Promise<string> {
  const { data: sameType, error: selErr } = await ctx.supabase
    .from(TABLE)
    .select('id, name')
    .eq('user_id', ctx.userId)
    .eq('type', input.type);
  if (selErr) throw new Error(selErr.message);
  const existing = ((sameType ?? []) as Array<{ id: string; name: string }>).find(
    (r) => r.name.toLowerCase() === input.name.toLowerCase(),
  );
  const now = new Date().toISOString();
  if (existing) {
    const { error } = await ctx.supabase
      .from(TABLE)
      .update({
        aliases: input.aliases ?? [],
        ticker: input.ticker ?? null,
        description: input.description ?? null,
        metadata: input.metadata ?? {},
        updated_at: now,
      })
      .eq('user_id', ctx.userId)
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
    return existing.id;
  }
  const id = crypto.randomUUID();
  const { error } = await ctx.supabase.from(TABLE).insert({
    id,
    user_id: ctx.userId,
    type: input.type,
    name: input.name,
    aliases: input.aliases ?? [],
    ticker: input.ticker ?? null,
    description: input.description ?? null,
    metadata: input.metadata ?? {},
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error(error.message);
  return id;
}

export async function getEntity(ctx: ResearchCtx, id: string): Promise<Entity | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await ctx.supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', ctx.userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToEntity(data) : null;
}

export interface ListEntitiesOpts {
  type?: EntityType;
  q?: string;
}

export async function listEntities(ctx: ResearchCtx, opts: ListEntitiesOpts = {}): Promise<Entity[]> {
  let query = ctx.supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', ctx.userId)
    .order('name', { ascending: true });
  if (opts.type) query = query.eq('type', opts.type);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  let entities = ((data ?? []) as any[]).map(rowToEntity);
  if (opts.q) {
    const q = opts.q.toLowerCase();
    entities = entities.filter(
      (e) => e.name.toLowerCase().includes(q) || (e.ticker ?? '').toLowerCase().includes(q),
    );
  }
  return entities;
}
