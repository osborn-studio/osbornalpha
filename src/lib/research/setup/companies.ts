/**
 * WP-A11 — 公司流程：每家一屏的简答答案、校验，以及候选外公司到 CohortCompany 的映射
 * （交给既有 upsertEntityKeys 做最终校验与落库）。
 */
import { isValidCik, isValidLei, isValidUsci } from '../entity-keys/identifiers';
import { HOME_MARKETS, KEY_NAMES, type CohortCompany, type HomeMarket, type KeyName, type Provenance } from '../entity-keys/types';
import { isCalendarDate } from './theses';

export interface OwnerCompanyAnswer {
  /** Existing cohort company being scoped, or null for a company added by the owner. */
  entity_id: string | null;
  rationale: string;
  names_zh: string;
  names_en: string;
  home_market: HomeMarket;
  /** Primary listing code, e.g. 600570.SH / 0268.HK / PLTR. Required for owner-added companies. */
  exchange_code: string;
  /** Listing date YYYY-MM-DD; blank = unknown (today, attributed to owner-input). */
  listed_on: string;
  keys: Record<KeyName, string>;
}

export const RATIONALE_MAX = 200;
/** Primary listing code per market: 600570.SH / 000001.SZ / 0268.HK / PLTR (US, optional .A suffix). */
export const EXCHANGE_CODE: Record<HomeMarket, RegExp> = {
  A: /^\d{6}\.(SH|SZ|BJ)$/,
  HK: /^\d{4,5}\.HK$/,
  US: /^[A-Z]{1,5}(\.[A-Z])?$/,
  other: /^[A-Z0-9.\-]{1,20}$/,
};
export const OWNER_SOURCE = 'owner-input';

const trimmed = (s: string) => s.trim();

export function validateCompanyAnswer(a: OwnerCompanyAnswer): string[] {
  const errors: string[] = [];
  if (trimmed(a.rationale) === '') errors.push('请写一句为什么这家公司进名单');
  else if (trimmed(a.rationale).length > RATIONALE_MAX) errors.push(`理由请控制在 ${RATIONALE_MAX} 字以内`);
  if (a.entity_id === null) {
    if (trimmed(a.names_zh) === '') errors.push('候选外公司需要中文名');
    if (trimmed(a.names_en) === '') errors.push('候选外公司需要英文名');
    if (!HOME_MARKETS.includes(a.home_market)) errors.push('请选择主市场');
    const pattern = EXCHANGE_CODE[a.home_market] ?? EXCHANGE_CODE.other;
    if (!pattern.test(trimmed(a.exchange_code).toUpperCase())) errors.push('主证券代码格式如 600570.SH / 0268.HK / PLTR，并与主市场一致');
    if (trimmed(a.listed_on) !== '' && !isCalendarDate(trimmed(a.listed_on))) errors.push('上市日期请用 YYYY-MM-DD 的真实日期，或留空');
  }
  const lei = trimmed(a.keys.lei), usci = trimmed(a.keys.usci), cik = trimmed(a.keys.cik);
  if (lei !== '' && !isValidLei(lei)) errors.push('LEI 应为 20 位且校验位正确');
  if (usci !== '' && !isValidUsci(usci)) errors.push('统一社会信用代码应为 18 位且校验位正确');
  if (cik !== '' && !isValidCik(cik)) errors.push('CIK 应为 1–10 位数字');
  return errors;
}

/** Owner-entered company → CohortCompany for upsertEntityKeys. Unknown keys go to `missing`. */
export function ownerCompanyToCohort(a: OwnerCompanyAnswer, opts: { today: string }): CohortCompany {
  const attribution: Provenance = { source: OWNER_SOURCE, retrieved_at: opts.today };
  const keys: Partial<Record<KeyName, string | null>> = {};
  const provenance: Partial<Record<KeyName, Provenance>> = {};
  const missing: KeyName[] = [];
  for (const k of KEY_NAMES) {
    const v = trimmed(a.keys[k] ?? '');
    if (v === '') { keys[k] = null; missing.push(k); } else { keys[k] = v; provenance[k] = attribution; }
  }
  const validFrom = trimmed(a.listed_on) === '' ? opts.today : trimmed(a.listed_on);
  return {
    names_en: [trimmed(a.names_en)],
    names_zh: [trimmed(a.names_zh)],
    aliases: [],
    home_market: a.home_market,
    in_scope: true,
    cohort: scopeCohort(opts.today),
    keys,
    provenance,
    missing,
    securities: [{
      exchange_code: trimmed(a.exchange_code).toUpperCase(), mic: null, isin: null,
      market: a.home_market, security_type: 'common', is_primary: true, valid_from: validFrom, valid_to: null,
      provenance: { exchange_code: attribution, valid_from: attribution },
    }],
  };
}

/** The cohort label for a scoping done in a given month: scope-YYYY-MM. */
export function scopeCohort(today: string): string {
  return `scope-${today.slice(0, 7)}`;
}

/**
 * Screen order of the companies flow: 0 = select, 1..n = one per selected company, n+1 = owner-added
 * companies, n+2 = review. Leaving the selection screen with nothing selected is allowed (owner-added
 * companies are entered later); the non-empty roster is enforced at review.
 */
export function companiesStepErrors(input: { step: number; selected: OwnerCompanyAnswer[]; added: OwnerCompanyAnswer[] }): string[] {
  const n = input.selected.length;
  if (input.step >= 1 && input.step <= n) return validateCompanyAnswer(input.selected[input.step - 1]!);
  if (input.step === n + 1) {
    return input.added.flatMap((a) => validateCompanyAnswer({ ...a, entity_id: null }).map((e) => `${a.names_zh.trim() || a.names_en.trim() || '新公司'}：${e}`));
  }
  if (input.step === n + 2 && n + input.added.length === 0) return ['至少勾选或添加 1 家公司'];
  return [];
}

/**
 * Everything the review screen must know before a single write is issued: every selected and added
 * answer validated, and the first screen the owner has to go back to (selection screen when the
 * roster is empty; the k-th company's screen; or the owner-added screen n + 1).
 */
export function companiesSubmitErrors(input: { selected: OwnerCompanyAnswer[]; added: OwnerCompanyAnswer[] }): { errors: string[]; firstStep: number | null } {
  const n = input.selected.length;
  if (n + input.added.length === 0) return { errors: ['至少勾选或添加 1 家公司'], firstStep: 0 };
  const errors: string[] = [];
  let firstStep: number | null = null;
  input.selected.forEach((a, i) => {
    const e = validateCompanyAnswer(a);
    if (e.length) { errors.push(...e.map((m) => `第 ${i + 1} 家：${m}`)); firstStep ??= i + 1; }
  });
  const addedErrors = companiesStepErrors({ step: n + 1, selected: input.selected, added: input.added });
  if (addedErrors.length) { errors.push(...addedErrors); firstStep ??= n + 1; }
  return { errors, firstStep };
}

/** A `new:<n>` answer whose POST succeeded becomes a selected existing company keyed by its entity id. */
export function reconcileAddedCompany(answers: Record<string, OwnerCompanyAnswer>, key: string, entityId: string): Record<string, OwnerCompanyAnswer> {
  const { [key]: created, ...rest } = answers;
  if (!created) return answers;
  return { ...rest, [entityId]: { ...created, entity_id: entityId } };
}

/**
 * The roster as the draft knows it: selected existing companies (any key that is an entity id,
 * including ones created earlier in a partially successful run) and still-to-create `new:` answers.
 * Deriving it from the draft rather than from the fetched company list keeps retries usable.
 */
export function rosterKeys(answers: Record<string, OwnerCompanyAnswer>): { selected: string[]; added: string[] } {
  const keys = Object.keys(answers);
  return { selected: keys.filter((k) => !k.startsWith('new:')), added: keys.filter((k) => k.startsWith('new:')) };
}

/**
 * Runtime shape guard for request bodies: every field becomes the string the form would hold
 * (non-strings → ''), so the typed validator can report 422s instead of throwing on `.trim()`.
 */
export function coerceOwnerCompanyAnswer(raw: unknown): OwnerCompanyAnswer {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const rawKeys = o.keys && typeof o.keys === 'object' && !Array.isArray(o.keys) ? (o.keys as Record<string, unknown>) : {};
  const market = HOME_MARKETS.includes(o.home_market as HomeMarket) ? (o.home_market as HomeMarket) : 'other';
  return {
    entity_id: typeof o.entity_id === 'string' ? o.entity_id : null,
    rationale: str(o.rationale), names_zh: str(o.names_zh), names_en: str(o.names_en), home_market: market,
    exchange_code: str(o.exchange_code), listed_on: str(o.listed_on),
    keys: Object.fromEntries(KEY_NAMES.map((k) => [k, str(rawKeys[k])])) as Record<KeyName, string>,
  };
}
