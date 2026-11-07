import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

type Domain = 'common' | 'components' | 'portfolio' | 'analyst';

function messageKeys(locale: 'en' | 'zh', file: Domain) {
  const path = resolve(process.cwd(), 'messages', locale, `${file}.json`);
  return keys(JSON.parse(readFileSync(path, 'utf8'))).sort();
}

function section(locale: 'en' | 'zh', file: Domain, name: string): Record<string, string> {
  const path = resolve(process.cwd(), 'messages', locale, `${file}.json`);
  return JSON.parse(readFileSync(path, 'utf8'))[name];
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();
}

describe('usage notice translations', () => {
  it('keeps Chinese and English keys in parity', () => {
    for (const file of ['common', 'components', 'portfolio', 'analyst'] as const) {
      expect(messageKeys('zh', file)).toEqual(messageKeys('en', file));
    }
  });

  it('keeps quota and daily-usage interpolation parameters in parity', () => {
    for (const [file, name] of [['common', 'quota'], ['components', 'usageToday']] as const) {
      const en = section('en', file, name);
      const zh = section('zh', file, name);
      for (const key of Object.keys(en)) {
        expect(placeholders(zh[key])).toEqual(placeholders(en[key]));
      }
    }
  });
});

// COMPANY — company research module domains (plan 2026-11-06 Task 11)
describe('company module translations', () => {
  const read = (locale: 'en' | 'zh', file: 'company' | 'tracking') =>
    JSON.parse(readFileSync(resolve(process.cwd(), 'messages', locale, `${file}.json`), 'utf8')) as unknown;
  const leaves = (value: unknown, prefix = ''): [string, string][] =>
    typeof value === 'string' ? [[prefix, value]]
      : Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
  for (const file of ['company', 'tracking'] as const) {
    it(`${file}: zh and en keys and placeholders are in parity`, () => {
      const zh = new Map(leaves(read('zh', file)));
      const en = new Map(leaves(read('en', file)));
      expect([...zh.keys()].sort()).toEqual([...en.keys()].sort());
      for (const [key, value] of en) expect(placeholders(zh.get(key) ?? '')).toEqual(placeholders(value));
    });
  }
});
// /COMPANY
