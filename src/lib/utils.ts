import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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

export function classifyMarket(ticker: string): 'A' | 'HK' | 'US' {
  if (/\.(SH|SZ|BJ)$/i.test(ticker)) return 'A';
  if (/\.HK$/i.test(ticker)) return 'HK';
  return 'US';
}
