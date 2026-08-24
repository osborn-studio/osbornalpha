/**
 * Client-side registry of stocks added via search (Eastmoney API).
 * Persists to localStorage so subsequent renders see correct name / market.
 *
 * Browser-only: all functions are no-ops on the server.
 */

import type { Market } from '../supabase/database.types';

const KEY = 'stock-monitor:custom-stocks:v1';

export interface CustomStock {
  t: string;       // canonical ticker
  n: string;       // name
  py?: string;     // pinyin
  m: Market;
}

let cache: Record<string, CustomStock> | null = null;

function ensureLoaded(): Record<string, CustomStock> {
  if (cache !== null) return cache;
  if (typeof window === 'undefined') {
    cache = {};
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : {};
  } catch {
    cache = {};
  }
  return cache!;
}

export function getCustomStock(ticker: string): CustomStock | undefined {
  return ensureLoaded()[ticker];
}

export function getAllCustomStocks(): Record<string, CustomStock> {
  return { ...ensureLoaded() };
}

export function addCustomStock(stock: CustomStock): void {
  if (typeof window === 'undefined') return;
  const all = ensureLoaded();
  all[stock.t] = stock;
  cache = all;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

export function removeCustomStock(ticker: string): void {
  if (typeof window === 'undefined') return;
  const all = ensureLoaded();
  delete all[ticker];
  cache = all;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}
