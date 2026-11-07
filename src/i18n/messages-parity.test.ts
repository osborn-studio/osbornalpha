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

// INDUSTRY:BEGIN
describe('industries translations', () => {
  const load = (locale: 'en' | 'zh') => JSON.parse(readFileSync(resolve(process.cwd(), 'messages', locale, 'industries.json'), 'utf8'));
  const leaves = (value: unknown, prefix = ''): [string, string][] =>
    typeof value === 'string' ? [[prefix, value]] : Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));

  it('keeps Chinese and English keys in parity', () => {
    expect(keys(load('zh')).sort()).toEqual(keys(load('en')).sort());
  });

  it('keeps every interpolation parameter in parity and every value non-empty', () => {
    const zh = new Map(leaves(load('zh')));
    for (const [key, en] of leaves(load('en'))) {
      expect(en.trim(), key).not.toBe('');
      expect(zh.get(key)?.trim(), key).not.toBe('');
      expect(placeholders(zh.get(key) ?? ''), key).toEqual(placeholders(en));
    }
  });
});
// INDUSTRY:END
