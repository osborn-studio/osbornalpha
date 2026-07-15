import { describe, expect, it } from 'vitest';
import type { SecuritySnapshot, SecurityUniverse } from '../model';
import { validateSecuritySnapshot } from './validate';

const MINIMA: Record<SecurityUniverse, number> = {
  a_stock: 5000,
  a_exchange_fund: 1800,
  a_cb: 300,
  hk_main: 2200,
  sp500: 490,
  nasdaq_top500: 500,
  us_china: 200,
};

function snapshot(scope: SecurityUniverse, count = MINIMA[scope]): SecuritySnapshot {
  const securities = Array.from({ length: count }, (_, index) => {
    const symbol = String(index).padStart(6, '0');
    const ticker = scope === 'hk_main'
      ? `${String(index).padStart(5, '0')}.HK`
      : scope.startsWith('a_') ? `${symbol}.SZ` : `T${String(index).padStart(5, '0')}`;
    return {
      ticker,
      symbol,
      name: `Security ${index}`,
      name_en: `Security ${index}`,
      full_name: null,
      pinyin: null,
      market: scope === 'hk_main' ? 'HK' as const : scope.startsWith('a_') ? 'A' as const : 'US' as const,
      exchange: scope === 'hk_main' ? 'HKEX' as const : scope.startsWith('a_') ? 'SZSE' as const : 'NASDAQ' as const,
      asset_type: scope === 'a_exchange_fund' ? 'fund' as const : scope === 'a_cb' ? 'convertible_bond' as const : 'stock' as const,
      fund_subtype: scope === 'a_exchange_fund' ? 'other_exchange_fund' as const : null,
      instrument_form: scope === 'a_exchange_fund' ? 'fund_unit' as const : scope === 'a_cb' ? 'bond' as const : 'common_stock' as const,
      currency: scope === 'hk_main' ? 'HKD' as const : scope.startsWith('a_') ? 'CNY' as const : 'USD' as const,
      country_code: scope === 'hk_main' ? 'HK' : scope.startsWith('a_') ? 'CN' : 'US',
      industry: null,
      list_status: 'listed' as const,
      list_date: null,
      delist_date: null,
      is_active: true,
      source: 'fixture',
      source_updated_at: '2026-07-15T00:00:00.000Z',
      metadata: {},
    };
  });
  return {
    source: 'fixture',
    scope,
    asOf: '2026-07-15',
    securities,
    aliases: securities.map((row) => ({ alias: row.symbol, ticker: row.ticker, alias_type: 'symbol' as const, source: 'fixture' })),
    memberships: securities.map((row, index) => ({
      ticker: row.ticker,
      universe: scope,
      rank: scope === 'nasdaq_top500' ? index + 1 : null,
      market_cap_usd: scope === 'nasdaq_top500' ? count - index : null,
      as_of_date: '2026-07-15',
      is_active: true,
      source: 'fixture',
    })),
  };
}

describe('validateSecuritySnapshot', () => {
  it('enforces initial scope minima and exact NASDAQ top-500 size', () => {
    expect(validateSecuritySnapshot(snapshot('a_stock', 4999)).accepted).toBe(false);
    expect(validateSecuritySnapshot(snapshot('nasdaq_top500', 499)).errors.map((row) => row.code))
      .toEqual(expect.arrayContaining(['below_minimum', 'top500_count']));
    expect(validateSecuritySnapshot(snapshot('nasdaq_top500')).accepted).toBe(true);
  });

  it('rejects relative count collapse and excessive membership churn', () => {
    const current = snapshot('a_stock');
    expect(validateSecuritySnapshot(current, { previousCount: 7000 }).errors.map((row) => row.code))
      .toContain('relative_count_drop');

    const sp = snapshot('sp500', 500);
    const previous = [...sp.memberships.map((row) => row.ticker), ...Array.from({ length: 30 }, (_, i) => `OLD${i}`)];
    expect(validateSecuritySnapshot(sp, { previousMemberships: previous }).errors.map((row) => row.code))
      .toContain('membership_churn');
  });

  it('allows 15% NASDAQ turnover but rejects more', () => {
    const top = snapshot('nasdaq_top500');
    const fourteenPercent = [...top.memberships.slice(70).map((row) => row.ticker), ...Array.from({ length: 70 }, (_, i) => `OLD${i}`)];
    const sixteenPercent = [...top.memberships.slice(80).map((row) => row.ticker), ...Array.from({ length: 80 }, (_, i) => `OLD${i}`)];
    expect(validateSecuritySnapshot(top, { previousMemberships: fourteenPercent }).accepted).toBe(true);
    expect(validateSecuritySnapshot(top, { previousMemberships: sixteenPercent }).errors.map((row) => row.code))
      .toContain('membership_churn');
  });

  it('rejects duplicate identities and conflicting primary aliases but permits shared names', () => {
    const value = snapshot('nasdaq_top500');
    value.securities[1] = { ...value.securities[1], ticker: value.securities[0].ticker };
    expect(validateSecuritySnapshot(value).errors.map((row) => row.code)).toContain('duplicate_ticker');

    const aliases = snapshot('nasdaq_top500');
    aliases.aliases.push({ alias: 'primary', ticker: aliases.securities[0].ticker, alias_type: 'vendor', source: 'fixture' });
    aliases.aliases.push({ alias: 'primary', ticker: aliases.securities[1].ticker, alias_type: 'vendor', source: 'fixture' });
    aliases.aliases.push({ alias: 'shared name', ticker: aliases.securities[0].ticker, alias_type: 'name', source: 'fixture' });
    aliases.aliases.push({ alias: 'shared name', ticker: aliases.securities[1].ticker, alias_type: 'name', source: 'fixture' });
    expect(validateSecuritySnapshot(aliases).errors.map((row) => row.code)).toContain('conflicting_primary_alias');
  });

  it('produces an order-independent checksum', () => {
    const value = snapshot('nasdaq_top500');
    const shuffled = {
      ...value,
      securities: [...value.securities].reverse(),
      aliases: [...value.aliases].reverse(),
      memberships: [...value.memberships].reverse(),
    };
    expect(validateSecuritySnapshot(value).checksum).toBe(validateSecuritySnapshot(shuffled).checksum);
  });
});
