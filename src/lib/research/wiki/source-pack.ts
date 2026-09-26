/**
 * WP-B2 (Alpha side): export public Sources + in-scope companies as an
 * `alpha-wiki-source-pack/1.0` file for the Brain wiki generator. Brain never
 * connects to this database; it validates this file (schema, content hashes,
 * pack hash) fail-closed. Contract and hash definition: Osborn-brain
 * config/alpha-wiki-source-pack.schema.json + docs/superpowers/specs/2026-09-26-wiki-page-generator-design.md.
 */
import { createHash } from 'node:crypto';
import { type EntityKeysRow, listEntityKeys, versionInput } from '../entity-keys/store';
import { legacySourceVisible } from '../sources';
import type { ResearchCtx } from '../store';

export const PACK_SCHEMA_NAME = 'alpha-wiki-source-pack';
export const PACK_SCHEMA_VERSION = '1.0';
const SOURCES_TABLE = 'research_source_documents';
const PAGE = 1000;
/** The owner's own material is never wiki raw evidence, whatever its permission. */
const OWNER_SOURCE_TYPES = new Set(['NOTE', 'MANUAL']);
const PRIVATE_ORIGINS = new Set(['private_observation', 's4_controlled_copy']);

export interface PackCompany {
  entity_id: string; names_en: string[]; names_zh: string[]; aliases: string[];
  home_market: string; lei: string | null; tickers: string[]; cohort: string | null;
}
export interface PackSource {
  id: string; source_version: string; source_type: string; origin_type: string | null; title: string;
  url: string | null; author: string | null; published_at: string | null; event_time: string | null;
  available_at: string; market: string | null; trust_level: string; entity_ids: string[];
  cluster_id: string | null; cluster_first: boolean | null; content_hash: string; raw_text: string;
}
export interface WikiSourcePack {
  schema_name: typeof PACK_SCHEMA_NAME; schema_version: typeof PACK_SCHEMA_VERSION; generated_at: string;
  producer_commit: string; entity_table_version: string; pack_hash: string; companies: PackCompany[]; sources: PackSource[];
}
export interface PackStats {
  companies: number; sources: number;
  skipped: { not_public: number; controlled_copy: number; owner_material: number; private_origin: number; no_in_scope_entity: number; content_hash_mismatch: number };
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Same definition as Brain: keys sorted recursively, no whitespace, JSON.stringify strings. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().filter(k => record[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`;
}
export function computePackHash(pack: object): string {
  const { pack_hash: _omitted, ...rest } = pack as Record<string, unknown>;
  return sha256(canonicalJson(rest));
}

const iso = (v: unknown): string | null => {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

function companyFromKeys(row: EntityKeysRow): PackCompany {
  const current = row.securities.filter(s => s.valid_to == null);
  const tickers = [...current].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.exchange_code.localeCompare(b.exchange_code)).map(s => s.exchange_code);
  return {
    entity_id: row.entity_id, names_en: [...row.names_en], names_zh: [...row.names_zh], aliases: [...row.aliases],
    home_market: row.home_market, lei: row.keys.lei ?? null, tickers: [...new Set(tickers)], cohort: row.cohort ?? null,
  };
}

/** Pure: rows in, deterministic pack + skip counts out. */
export function packFromRows(input: { entityKeys: EntityKeysRow[]; sources: any[]; generated_at: string; producer_commit: string }): { pack: WikiSourcePack; stats: PackStats } {
  const inScope = input.entityKeys.filter(r => r.in_scope).sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  const scopeIds = new Set(inScope.map(r => r.entity_id));
  const skipped: PackStats['skipped'] = { not_public: 0, controlled_copy: 0, owner_material: 0, private_origin: 0, no_in_scope_entity: 0, content_hash_mismatch: 0 };
  const sources: PackSource[] = [];
  for (const row of input.sources) {
    if (row.permission !== 'public') { skipped.not_public++; continue; }
    if (!legacySourceVisible(row)) { skipped.controlled_copy++; continue; }
    if (OWNER_SOURCE_TYPES.has(row.source_type)) { skipped.owner_material++; continue; }
    if (row.origin_type != null && PRIVATE_ORIGINS.has(row.origin_type)) { skipped.private_origin++; continue; }
    const entityIds = (Array.isArray(row.entity_ids) ? (row.entity_ids as string[]) : []).filter(id => scopeIds.has(id));
    if (entityIds.length === 0) { skipped.no_in_scope_entity++; continue; }
    if (typeof row.raw_text !== 'string' || row.raw_text === '' || sha256(row.raw_text) !== row.content_hash) { skipped.content_hash_mismatch++; continue; }
    const availableAt = iso(row.available_at) ?? iso(row.ingested_at);
    if (!availableAt) { skipped.content_hash_mismatch++; continue; }
    sources.push({
      id: row.id, source_version: String(row.source_version ?? '1'), source_type: row.source_type, origin_type: text(row.origin_type),
      title: typeof row.title === 'string' && row.title.trim() !== '' ? row.title : row.id, url: text(row.url), author: text(row.author),
      published_at: iso(row.published_at), event_time: iso(row.event_time), available_at: availableAt, market: text(row.market),
      trust_level: row.trust_level, entity_ids: [...new Set(entityIds)].sort(), cluster_id: text(row.cluster_id),
      cluster_first: typeof row.cluster_first === 'boolean' ? row.cluster_first : null, content_hash: row.content_hash, raw_text: row.raw_text,
    });
  }
  sources.sort((a, b) => a.available_at.localeCompare(b.available_at) || a.id.localeCompare(b.id));
  const pack: WikiSourcePack = {
    schema_name: PACK_SCHEMA_NAME, schema_version: PACK_SCHEMA_VERSION, generated_at: input.generated_at, producer_commit: input.producer_commit,
    entity_table_version: versionInput(input.entityKeys), pack_hash: '', companies: inScope.map(companyFromKeys), sources,
  };
  pack.pack_hash = computePackHash(pack);
  return { pack, stats: { companies: pack.companies.length, sources: sources.length, skipped } };
}

async function fetchPublicSources(ctx: ResearchCtx): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await ctx.supabase.from(SOURCES_TABLE).select('*').eq('user_id', ctx.userId).eq('permission', 'public').order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as any[];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

export async function buildWikiSourcePack(ctx: ResearchCtx, opts: { producerCommit: string; now?: () => string }): Promise<{ pack: WikiSourcePack; stats: PackStats }> {
  const [entityKeys, sources] = await Promise.all([listEntityKeys(ctx), fetchPublicSources(ctx)]);
  return packFromRows({ entityKeys, sources, generated_at: (opts.now ?? (() => new Date().toISOString()))(), producer_commit: opts.producerCommit });
}
