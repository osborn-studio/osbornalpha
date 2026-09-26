/**
 * WP-A2 entity keys store (Supabase client path, like entities.ts).
 * Company keys are master data: revisable by the owner, hashed by
 * entityTableVersion() so judgment snapshots can pin the table state they saw.
 */
import { digest, fail } from '../ingest/pa-v1/json.js';
import { upsertEntity } from '../entities';
import type { ResearchCtx } from '../store';
import { isValidCik, isValidIsin, isValidLei, isValidUsci } from './identifiers';
import { HOME_MARKETS, KEY_NAMES, SECURITY_TYPES, type CohortCompany, type CohortSecurity, type KeyName } from './types';

const KEYS_TABLE = 'research_entity_keys', SECURITIES_TABLE = 'research_entity_securities';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
/** PostgREST returns dates as YYYY-MM-DD strings; pg returns Date objects. */
const dateOnly = (v: unknown): string => v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

export interface EntityKeysRow {
  entity_id: string;
  keys: Record<KeyName, string | null>;
  names_zh: string[]; names_en: string[]; aliases: string[];
  home_market: string; in_scope: boolean; cohort: string | null;
  provenance: Record<string, unknown>; missing: KeyName[]; updated_at: string;
  securities: Array<{ id: string; exchange_code: string; mic: string | null; isin: string | null; market: string; security_type: string;
    is_primary: boolean; valid_from: string; valid_to: string | null; provenance: Record<string, unknown> }>;
}

function validateCompany(c: CohortCompany) {
  if (!Array.isArray(c?.names_en) || !text(c.names_en[0]) || !HOME_MARKETS.includes(c.home_market) || typeof c.in_scope !== 'boolean') fail('invalid_schema');
  for (const list of [c.names_zh, c.aliases]) if (!Array.isArray(list) || !list.every(text)) fail('invalid_schema');
  const missing = new Set(c.missing ?? []);
  for (const k of KEY_NAMES) {
    const v = c.keys?.[k] ?? null;
    if (v === null) { if (!missing.has(k)) fail('invalid_schema'); continue; }
    if (missing.has(k) || !text(v)) fail('invalid_schema');
    if ((k === 'lei' && !isValidLei(v)) || (k === 'usci' && !isValidUsci(v)) || (k === 'cik' && !isValidCik(v))) fail('invalid_schema');
    if (!text(c.provenance?.[k]?.source)) fail('invalid_schema');
  }
  if (![...missing].every(m => (KEY_NAMES as readonly string[]).includes(m))) fail('invalid_schema');
  if (!Array.isArray(c.securities) || c.securities.filter(s => s.is_primary).length !== 1) fail('invalid_schema');
  for (const s of c.securities) validateSecurity(s, c.home_market);
}
function validateSecurity(s: CohortSecurity, market: string) {
  if (!/^[A-Z0-9.\-]{1,20}$/.test(s?.exchange_code ?? '') || s.market !== market || !SECURITY_TYPES.includes(s.security_type)) fail('invalid_schema');
  if (s.mic != null && !/^[A-Z0-9]{4}$/.test(s.mic)) fail('invalid_schema');
  if (s.isin != null && !isValidIsin(s.isin)) fail('invalid_schema');
  if (!ISO_DATE.test(s.valid_from) || (s.valid_to != null && (!ISO_DATE.test(s.valid_to) || s.valid_to <= s.valid_from))) fail('invalid_schema');
}

/** Upsert a company's entity, key row and securities. Securities match on (exchange_code, valid_from). */
export async function upsertEntityKeys(ctx: ResearchCtx, company: CohortCompany): Promise<{ entity_id: string; securities: number }> {
  validateCompany(company);
  const primary = company.securities.find(s => s.is_primary)!;
  const entity_id = await upsertEntity(ctx, { type: 'COMPANY', name: company.names_en[0], aliases: [...company.names_zh, ...company.aliases],
    ticker: primary.exchange_code, metadata: { home_market: company.home_market, in_scope: company.in_scope } });
  const now = new Date().toISOString();
  const keyRow = { user_id: ctx.userId, entity_id, lei: company.keys.lei ?? null, usci: company.keys.usci ?? null, cninfo_org_id: company.keys.cninfo_org_id ?? null,
    cik: company.keys.cik ?? null, names_zh: company.names_zh, names_en: company.names_en, aliases: company.aliases, home_market: company.home_market,
    in_scope: company.in_scope, cohort: company.cohort ?? null, provenance: company.provenance ?? {}, missing: company.missing ?? [], updated_at: now };
  const { data: existingKey, error: keyErr } = await ctx.supabase.from(KEYS_TABLE).select('entity_id').eq('user_id', ctx.userId).eq('entity_id', entity_id).maybeSingle();
  if (keyErr) throw new Error(keyErr.message);
  const write = existingKey
    ? ctx.supabase.from(KEYS_TABLE).update(keyRow).eq('user_id', ctx.userId).eq('entity_id', entity_id)
    : ctx.supabase.from(KEYS_TABLE).insert(keyRow);
  const { error } = await write;
  if (error) throw new Error(error.message);

  const { data: existingSecs, error: secErr } = await ctx.supabase.from(SECURITIES_TABLE).select('id, exchange_code, valid_from').eq('user_id', ctx.userId).eq('entity_id', entity_id);
  if (secErr) throw new Error(secErr.message);
  const byKey = new Map(((existingSecs ?? []) as Array<{ id: string; exchange_code: string; valid_from: string }>).map(r => [`${r.exchange_code}|${r.valid_from}`, r.id]));
  for (const s of company.securities) {
    const row = { user_id: ctx.userId, entity_id, exchange_code: s.exchange_code, mic: s.mic ?? null, isin: s.isin ?? null, market: s.market, security_type: s.security_type,
      is_primary: s.is_primary, valid_from: s.valid_from, valid_to: s.valid_to ?? null, provenance: s.provenance ?? {} };
    const id = byKey.get(`${s.exchange_code}|${s.valid_from}`);
    const { error: e } = id
      ? await ctx.supabase.from(SECURITIES_TABLE).update(row).eq('user_id', ctx.userId).eq('id', id)
      : await ctx.supabase.from(SECURITIES_TABLE).insert({ id: crypto.randomUUID(), ...row });
    if (e) throw new Error(e.message);
  }
  return { entity_id, securities: company.securities.length };
}

export async function listEntityKeys(ctx: ResearchCtx): Promise<EntityKeysRow[]> {
  const [{ data: keys, error: e1 }, { data: secs, error: e2 }] = await Promise.all([
    ctx.supabase.from(KEYS_TABLE).select('*').eq('user_id', ctx.userId).order('entity_id'),
    ctx.supabase.from(SECURITIES_TABLE).select('*').eq('user_id', ctx.userId).order('exchange_code'),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  const grouped = new Map<string, EntityKeysRow['securities']>();
  for (const s of (secs ?? []) as any[]) (grouped.get(s.entity_id) ?? grouped.set(s.entity_id, []).get(s.entity_id)!).push({
    id: s.id, exchange_code: s.exchange_code, mic: s.mic ?? null, isin: s.isin ?? null, market: s.market, security_type: s.security_type,
    is_primary: !!s.is_primary, valid_from: dateOnly(s.valid_from), valid_to: s.valid_to ? dateOnly(s.valid_to) : null, provenance: s.provenance ?? {} });
  return ((keys ?? []) as any[]).map(r => ({
    entity_id: r.entity_id, keys: { lei: r.lei ?? null, usci: r.usci ?? null, cninfo_org_id: r.cninfo_org_id ?? null, cik: r.cik ?? null },
    names_zh: r.names_zh ?? [], names_en: r.names_en ?? [], aliases: r.aliases ?? [], home_market: r.home_market, in_scope: !!r.in_scope,
    cohort: r.cohort ?? null, provenance: r.provenance ?? {}, missing: r.missing ?? [], updated_at: r.updated_at,
    securities: grouped.get(r.entity_id) ?? [] }));
}

/**
 * Canonical content of the table: identifying fields only, sorted, without
 * provenance/timestamps/row ids. Pure so the real-database test can apply it
 * to rows read through pg and get the same answer as the Supabase path.
 */
export function versionInput(rows: EntityKeysRow[]): string {
  const content = [...rows].sort((a, b) => a.entity_id.localeCompare(b.entity_id)).map(r => ({
    entity_id: r.entity_id, keys: r.keys, names_zh: r.names_zh, names_en: r.names_en, aliases: r.aliases, home_market: r.home_market,
    in_scope: r.in_scope, cohort: r.cohort, missing: [...r.missing].sort(),
    securities: [...r.securities].sort((x, y) => `${x.exchange_code}|${x.valid_from}`.localeCompare(`${y.exchange_code}|${y.valid_from}`)).map(s => ({
      exchange_code: s.exchange_code, mic: s.mic, isin: s.isin, market: s.market, security_type: s.security_type, is_primary: s.is_primary,
      valid_from: s.valid_from, valid_to: s.valid_to })) }));
  return digest({ entity_table_version: 1, companies: content });
}

/** sha256 hex of the owner's whole entity table; cite it as snapshot.entity_table_version. */
export async function entityTableVersion(ctx: ResearchCtx): Promise<string> {
  return versionInput(await listEntityKeys(ctx));
}
