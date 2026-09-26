/**
 * WP-A11 — 名单圈定的写路径：改 in_scope / cohort、记录理由、补录实体键，或新增候选外公司。
 * 只写 research_entity_keys 与 research_entities.metadata；证券与既有键不动；新增走 upsertEntityKeys 的全套校验。
 */
import { getEntity, listEntities } from '../entities';
import { isUuid, type ResearchCtx } from '../store';
import { coerceOwnerCompanyAnswer, ownerCompanyToCohort, OWNER_SOURCE, RATIONALE_MAX, scopeCohort, validateCompanyAnswer, type OwnerCompanyAnswer } from '../setup/companies';
import { isValidCik, isValidLei, isValidUsci } from './identifiers';
import { listEntityKeys, upsertEntityKeys, type EntityKeysRow } from './store';
import { KEY_NAMES, type KeyName, type Provenance } from './types';

const KEYS_TABLE = 'research_entity_keys', ENTITIES_TABLE = 'research_entities';

export class ScopeError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = 'ScopeError'; }
}

export interface ScopeInput {
  in_scope: boolean;
  rationale: string;
  /** YYYY-MM-DD; drives the cohort label and owner-input provenance. */
  today: string;
  cohort?: string;
  keys?: Partial<Record<KeyName, string>>;
  names_zh?: string[];
  names_en?: string[];
  aliases?: string[];
}

const text = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const cleanList = (v: unknown, field: string): string[] | undefined => {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || !v.every(text)) throw new ScopeError(`${field} must be a list of non-empty strings`, 422);
  return [...new Set(v.map((s) => s.trim()))];
};

/** Change a listed company's scope and rationale; optionally fill in keys or names the owner knows. */
export async function setScope(ctx: ResearchCtx, entityId: string, input: ScopeInput): Promise<EntityKeysRow> {
  if (!isUuid(entityId)) throw new ScopeError('entity id must be a uuid', 400);
  const rationale = typeof input.rationale === 'string' ? input.rationale.trim() : '';
  if (rationale === '') throw new ScopeError('rationale is required', 422);
  if (rationale.length > RATIONALE_MAX) throw new ScopeError(`rationale must be at most ${RATIONALE_MAX} characters`, 422);
  if (typeof input.in_scope !== 'boolean') throw new ScopeError('in_scope must be a boolean', 422);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.today)) throw new ScopeError('today must be YYYY-MM-DD', 422);
  if (input.keys !== undefined && (input.keys === null || typeof input.keys !== 'object' || Array.isArray(input.keys)
      || Object.values(input.keys).some((v) => v !== undefined && typeof v !== 'string'))) throw new ScopeError('keys must be an object of strings', 422);
  const row = (await listEntityKeys(ctx)).find((r) => r.entity_id === entityId);
  if (!row) throw new ScopeError('entity not found', 404);

  const keys = { ...row.keys };
  const provenance = { ...(row.provenance as Record<string, unknown>) };
  const missing = new Set<KeyName>(row.missing);
  const attribution: Provenance = { source: OWNER_SOURCE, retrieved_at: input.today };
  for (const k of KEY_NAMES) {
    const v = input.keys?.[k];
    if (v === undefined || v.trim() === '') continue;
    const value = v.trim();
    if ((k === 'lei' && !isValidLei(value)) || (k === 'usci' && !isValidUsci(value)) || (k === 'cik' && !isValidCik(value))) {
      throw new ScopeError(`${k} is not a valid identifier`, 422);
    }
    keys[k] = value; provenance[k] = attribution; missing.delete(k);
  }
  // Name corrections add identifiers and may change the canonical (first) English name; they never
  // drop identifiers already known to the key row or the entity — fanout matches companies by them.
  const union = (first: string[], rest: string[]) => [...new Set([...first, ...rest])];
  const names_zh = union(cleanList(input.names_zh, 'names_zh') ?? [], row.names_zh);
  const names_en = union(cleanList(input.names_en, 'names_en') ?? [], row.names_en);
  const aliases = union(cleanList(input.aliases, 'aliases') ?? [], row.aliases);
  if (names_en.length === 0) throw new ScopeError('names_en must keep at least one name', 422);
  const cohort = input.in_scope ? (text(input.cohort) ? input.cohort!.trim() : scopeCohort(input.today)) : row.cohort;
  const now = new Date().toISOString();

  const { error } = await ctx.supabase.from(KEYS_TABLE).update({
    in_scope: input.in_scope, cohort, lei: keys.lei, usci: keys.usci, cninfo_org_id: keys.cninfo_org_id, cik: keys.cik,
    names_zh, names_en, aliases, provenance, missing: [...missing], updated_at: now,
  }).eq('user_id', ctx.userId).eq('entity_id', entityId);
  if (error) throw new Error(error.message);

  const entity = await getEntity(ctx, entityId);
  if (entity) {
    const metadata = { ...entity.metadata, in_scope: input.in_scope, scope_rationale: rationale, scope_updated_at: now };
    // Name corrections reach the entity too (the company pages render research_entities.name/aliases):
    // canonical name = first English name, aliases = the other names, as resolveCompanyEntity does.
    const renamed = input.names_zh !== undefined || input.names_en !== undefined || input.aliases !== undefined;
    const patch: Record<string, unknown> = { metadata, updated_at: now };
    if (renamed) {
      const name = names_en[0]!;
      // Existing entity aliases and the previous canonical name are kept; only the new canonical name leaves the alias list.
      patch.name = name;
      patch.aliases = [...new Set([...names_zh, ...names_en, ...aliases, ...entity.aliases, entity.name])].filter((a) => a !== name);
    }
    const { error: entityErr } = await ctx.supabase.from(ENTITIES_TABLE).update(patch).eq('user_id', ctx.userId).eq('id', entityId);
    if (entityErr) throw new Error(entityErr.message);
  }
  const updated = (await listEntityKeys(ctx)).find((r) => r.entity_id === entityId);
  if (!updated) throw new ScopeError('entity not found', 404);
  return updated;
}

export interface ScopedCompany extends EntityKeysRow {
  /** research_entities.metadata.scope_rationale, so a fresh browser can prefill the owner's reason. */
  scope_rationale: string | null;
}

/** Key rows joined with the entity's scope rationale (the GET shape of /api/research/entity-keys). */
export async function listScopedCompanies(ctx: ResearchCtx): Promise<ScopedCompany[]> {
  const [rows, entities] = await Promise.all([listEntityKeys(ctx), listEntities(ctx, { type: 'COMPANY' })]);
  const rationale = new Map(entities.map((e) => [e.id, typeof e.metadata.scope_rationale === 'string' ? (e.metadata.scope_rationale as string) : null]));
  return rows.map((r) => ({ ...r, scope_rationale: rationale.get(r.entity_id) ?? null }));
}

const lower = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

/**
 * Add a company outside the candidate list: wizard validation → CohortCompany → store validation → scope + rationale.
 * A company that already exists (by any name, alias or primary ticker) is refused with 409: upsertEntityKeys would
 * otherwise replace its researched key row with the wizard's blank identifiers. Scope the existing row instead.
 */
export async function addOwnerCompany(ctx: ResearchCtx, rawAnswer: OwnerCompanyAnswer | unknown, opts: { today: string }): Promise<EntityKeysRow> {
  const answer = coerceOwnerCompanyAnswer(rawAnswer);
  const errors = validateCompanyAnswer({ ...answer, entity_id: null });
  if (errors.length) throw new ScopeError(errors.join('；'), 422);
  const names = new Set([answer.names_zh, answer.names_en].map(lower).filter(Boolean));
  const ticker = lower(answer.exchange_code);
  const [entities, keyRows] = await Promise.all([listEntities(ctx, { type: 'COMPANY' }), listEntityKeys(ctx)]);
  // Only a company that already has a researched key row is protected: an entity without one (legacy
  // seed, or a stranded earlier attempt) is enriched by upsertEntityKeys and becomes scopeable.
  // An earlier creation of this very company that did not get to the scope step (owner-input key row with no
  // researched keys; no securities, or only the same primary listing) may be resumed: upsertEntityKeys updates
  // that same row and the scope step below finishes the job. Anything with researched keys is protected.
  // "Owner submission" means: nothing researched anywhere — no entity keys, no key provenance, and securities
  // (if any) that are the same listing with no MIC/ISIN and only owner-input provenance.
  const ownerOnly = (prov: Record<string, unknown>) => Object.values(prov).every((p) => (p as { source?: string } | null)?.source === OWNER_SOURCE);
  const resumable = (r: EntityKeysRow) => KEY_NAMES.every((k) => r.keys[k] === null)
    && ownerOnly(r.provenance as Record<string, unknown>)
    && r.securities.every((sec) => lower(sec.exchange_code) === ticker && sec.mic === null && sec.isin === null && ownerOnly(sec.provenance));
  const keyed = new Set(keyRows.filter((r) => !resumable(r)).map((r) => r.entity_id));
  const byName = entities.find((e) => keyed.has(e.id) && (names.has(lower(e.name)) || lower(e.ticker) === ticker || e.aliases.some((a) => names.has(lower(a)))));
  const byKeys = keyRows.find((r) => !resumable(r) && ([...r.names_zh, ...r.names_en, ...r.aliases].some((n) => names.has(lower(n))) || r.securities.some((sec) => lower(sec.exchange_code) === ticker)));
  if (byName || byKeys) throw new ScopeError('company already exists; scope the existing record instead of adding it again', 409);
  // Resuming: keep the listing date persisted by the earlier attempt, otherwise a blank date retried on another
  // day would become a second (exchange_code, valid_from) security row.
  const resumed = keyRows.find((r) => resumable(r) && r.securities.some((sec) => lower(sec.exchange_code) === ticker));
  const persistedDate = resumed?.securities.find((sec) => lower(sec.exchange_code) === ticker)?.valid_from;
  const effective = answer.listed_on.trim() === '' && persistedDate ? { ...answer, listed_on: persistedDate } : answer;
  let entityId: string;
  try {
    entityId = (await upsertEntityKeys(ctx, ownerCompanyToCohort(effective, opts))).entity_id;
  } catch (e) {
    if (e instanceof Error && e.message === 'invalid_schema') throw new ScopeError('company record failed validation', 422);
    throw e;
  }
  return setScope(ctx, entityId, { in_scope: true, rationale: answer.rationale, today: opts.today });
}
