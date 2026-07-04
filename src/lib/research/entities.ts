/**
 * Entity service (Research OS Phase 1).
 * Companies + themes with idempotent upsert keyed by (type, lower(name)) —
 * the seed script can run any number of times without duplicating rows.
 */

import { type ResearchDb } from './db';
import { readJson, writeJson, type Entity, type EntityType } from './types';

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
    aliases: readJson<string[]>(row.aliases, []),
    ticker: row.ticker,
    description: row.description,
    metadata: readJson<Record<string, unknown>>(row.metadata, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Idempotent upsert by (type, lower(name)). Returns the entity id. */
export function upsertEntity(db: ResearchDb, input: UpsertEntityInput): string {
  const existing = db
    .prepare(`select id from entities where type = ? and lower(name) = lower(?)`)
    .get(input.type, input.name) as { id: string } | undefined;
  const now = new Date().toISOString();
  if (existing) {
    db.prepare(
      `update entities
       set aliases = ?, ticker = ?, description = ?, metadata = ?, updated_at = ?
       where id = ?`,
    ).run(
      writeJson(input.aliases ?? []),
      input.ticker ?? null,
      input.description ?? null,
      writeJson(input.metadata ?? {}),
      now,
      existing.id,
    );
    return existing.id;
  }
  const id = crypto.randomUUID();
  db.prepare(
    `insert into entities (id, type, name, aliases, ticker, description, metadata, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.type,
    input.name,
    writeJson(input.aliases ?? []),
    input.ticker ?? null,
    input.description ?? null,
    writeJson(input.metadata ?? {}),
    now,
    now,
  );
  return id;
}

export function getEntity(db: ResearchDb, id: string): Entity | null {
  const row = db.prepare(`select * from entities where id = ?`).get(id);
  return row ? rowToEntity(row) : null;
}

export interface ListEntitiesOpts {
  type?: EntityType;
  q?: string;
}

export function listEntities(db: ResearchDb, opts: ListEntitiesOpts = {}): Entity[] {
  const clauses: string[] = [];
  const args: unknown[] = [];
  if (opts.type) {
    clauses.push('type = ?');
    args.push(opts.type);
  }
  if (opts.q) {
    clauses.push('(lower(name) like ? or lower(ifnull(ticker,\'\')) like ?)');
    const like = `%${opts.q.toLowerCase()}%`;
    args.push(like, like);
  }
  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const rows = db.prepare(`select * from entities ${where} order by name asc`).all(...args);
  return rows.map(rowToEntity);
}
