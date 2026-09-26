/**
 * WP-A11 — 公司流程：每家一屏的简答答案、校验，以及候选外公司到 CohortCompany 的映射
 * （交给既有 upsertEntityKeys 做最终校验与落库）。
 */
import { isValidCik, isValidLei, isValidUsci } from '../entity-keys/identifiers';
import { HOME_MARKETS, KEY_NAMES, type CohortCompany, type HomeMarket, type KeyName, type Provenance } from '../entity-keys/types';
import { ISO_DATE } from './theses';

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
    if (trimmed(a.listed_on) !== '' && !ISO_DATE.test(trimmed(a.listed_on))) errors.push('上市日期请用 YYYY-MM-DD，或留空');
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
