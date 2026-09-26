/**
 * WP-A2 identifier check digits. The database only constrains shape; these
 * pure functions are the authority on validity for ISIN, LEI, USCI and CIK.
 */
import { fail } from '../ingest/pa-v1/json.js';

const base36 = (s: string) => [...s].map(c => parseInt(c, 36).toString()).join('');

/** ISO 6166: letters → two digits, then Luhn over the whole expansion. */
export function isValidIsin(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value)) return false;
  const digits = base36(value);
  let total = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) d *= 2;
    total += Math.floor(d / 10) + (d % 10);
  }
  return total % 10 === 0;
}

/** ISO 17442: letters → two digits, whole number mod 97 must equal 1. */
export function isValidLei(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Z0-9]{18}[0-9]{2}$/.test(value)) return false;
  let remainder = 0;
  for (const ch of base36(value)) remainder = (remainder * 10 + Number(ch)) % 97;
  return remainder === 1;
}

const USCI_CHARS = '0123456789ABCDEFGHJKLMNPQRTUWXY';
const USCI_WEIGHTS = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];

/** GB 32100-2015 统一社会信用代码: 17 weighted characters + mod-31 check character. */
export function isValidUsci(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 18 || ![...value].every(c => USCI_CHARS.includes(c))) return false;
  let total = 0;
  for (let i = 0; i < 17; i++) total += USCI_CHARS.indexOf(value[i]) * USCI_WEIGHTS[i];
  return USCI_CHARS[(31 - (total % 31)) % 31] === value[17];
}

/** SEC CIK stored without zero padding, 1–10 digits. */
export function isValidCik(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9][0-9]{0,9}$/.test(value);
}

export function normalizeCik(value: unknown): string {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^[0-9]{1,10}$/.test(text)) fail('invalid_schema');
  const stripped = text.replace(/^0+/, '');
  if (!isValidCik(stripped)) fail('invalid_schema');
  return stripped;
}
