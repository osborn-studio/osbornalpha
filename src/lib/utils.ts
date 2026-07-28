import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Market } from '@/lib/supabase/database.types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(v: number, currency = '') {
  return `${currency}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPct(v: number, withSign = true) {
  const s = withSign && v > 0 ? '+' : '';
  return `${s}${v.toFixed(2)}%`;
}

export function formatChange(v: number, withSign = true) {
  const s = withSign && v > 0 ? '+' : '';
  return `${s}${v.toFixed(2)}`;
}

export function formatVolume(v: number) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  return v.toString();
}

export function changeClass(v: number) {
  return v > 0 ? 'text-up' : v < 0 ? 'text-down' : '';
}

export function stars(n: number) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

/**
 * Display currency symbol per market. JPY uses 'JP¥' to avoid confusion
 * with RMB '¥'; TWD uses 'NT$' to avoid confusion with USD/HKD.
 */
export const MARKET_CURRENCY: Record<Market, string> = {
  A: '¥', HK: 'HK$', US: '$', JP: 'JP¥', KR: '₩', TW: 'NT$',
};

export function currencyOfMarket(market: Market): string {
  return MARKET_CURRENCY[market];
}

/**
 * Single source of truth for ticker → market classification (six markets).
 * Suffix rules ($-anchored so `.TW`/`.TWO` are never eaten by the `.T` rule):
 *   .SH/.SZ/.BJ → A    .HK → HK    .TW/.TWO → TW
 *   .KS/.KQ → KR       .T → JP     everything else → US
 */
export function classifyMarket(ticker: string): Market {
  const t = ticker.toUpperCase();
  if (/\.(SH|SZ|BJ)$/.test(t)) return 'A';
  if (/\.HK$/.test(t)) return 'HK';
  if (/\.(TW|TWO)$/.test(t)) return 'TW';
  if (/\.(KS|KQ)$/.test(t)) return 'KR';
  if (/\.T$/.test(t)) return 'JP';
  return 'US';
}
