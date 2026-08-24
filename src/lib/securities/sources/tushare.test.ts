import { describe, expect, it, vi } from 'vitest';
import { fetchAShareSnapshot } from './tushare-a';
import { fetchConvertibleBondSnapshot } from './tushare-cb';
import { fetchExchangeFundSnapshot } from './tushare-funds';
import { fetchHongKongMainBoardSnapshot } from './tushare-hk';
import { callTushare, SecuritySourceError } from './tushare-client';

type Fixture = {
  fields: string[];
  items: unknown[][];
};

function tushareFetch(fixtures: Record<string, Fixture>): typeof fetch {
  return vi.fn(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { api_name: string };
    const fixture = fixtures[body.api_name];
    if (!fixture) throw new Error(`Missing fixture for ${body.api_name}`);
    return new Response(JSON.stringify({ code: 0, msg: '', data: fixture }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
}

const options = { token: 'test-token', asOf: '2026-07-15' } as const;

describe('Tushare source client', () => {
  it('rejects malformed fields/items without leaking payloads', async () => {
    const fetchImpl = tushareFetch({ broken: { fields: ['ts_code', 'name'], items: [['002463.SZ']] } });
    await expect(callTushare({
      apiName: 'broken',
      params: {},
      fields: ['ts_code', 'name'],
      token: 'private-token',
      fetchImpl,
    })).rejects.toMatchObject({ code: 'source_schema' });
  });

  it('maps provider errors to stable, credential-safe source errors', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      code: 40101,
      msg: 'bad token private-token',
      data: null,
    }), { status: 200 })) as typeof fetch;

    const error = await callTushare({
      apiName: 'stock_basic',
      params: {},
      fields: ['ts_code'],
      token: 'private-token',
      fetchImpl,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SecuritySourceError);
    expect(error).toMatchObject({ code: 'source_auth', source: 'tushare' });
    expect(String(error)).not.toContain('private-token');
  });

  it('fails safely when TUSHARE_TOKEN is absent', async () => {
    const original = process.env.TUSHARE_TOKEN;
    delete process.env.TUSHARE_TOKEN;
    try {
      await expect(callTushare({
        apiName: 'stock_basic',
        params: {},
        fields: ['ts_code'],
      })).rejects.toMatchObject({ code: 'source_auth' });
    } finally {
      if (original) process.env.TUSHARE_TOKEN = original;
    }
  });
});

describe('Tushare security snapshots', () => {
  it('builds the active A-share universe and excludes B shares and CDRs', async () => {
    const fetchImpl = tushareFetch({
      stock_basic: {
        fields: ['ts_code', 'symbol', 'name', 'area', 'industry', 'fullname', 'market', 'exchange', 'curr_type', 'list_status', 'list_date', 'delist_date'],
        items: [
          ['002463.SZ', '002463', '沪电股份', '江苏', '元器件', '沪士电子股份有限公司', '中小板', 'SZSE', 'CNY', 'L', '20100818', null],
          ['200002.SZ', '200002', '万科B', '深圳', '房地产', null, '主板', 'SZSE', 'HKD', 'L', '19910129', null],
          ['689009.SH', '689009', '九号公司', '北京', '软件', null, 'CDR', 'SSE', 'CNY', 'L', '20201029', null],
        ],
      },
    });

    const snapshot = await fetchAShareSnapshot({ ...options, fetchImpl });
    expect(snapshot.securities.map((row) => row.ticker)).toEqual(['002463.SZ']);
    expect(snapshot.memberships).toContainEqual(expect.objectContaining({
      ticker: '002463.SZ', universe: 'a_stock', is_active: true,
    }));
    expect(snapshot.aliases.map((row) => row.alias)).toContain('sz002463');
  });

  it('classifies exchange-listed ETFs and REITs without name guessing', async () => {
    const fetchImpl = tushareFetch({
      fund_basic: {
        fields: ['ts_code', 'name', 'fund_type', 'invest_type', 'type', 'market', 'status', 'list_date', 'delist_date'],
        items: [
          ['510300.SH', '300ETF', '股票型', '被动指数型', '契约型开放式', 'E', 'L', '20120528', null],
          ['180101.SZ', '博时蛇口产园REIT', 'REITs', '其他', '契约型封闭式', 'E', 'L', '20210621', null],
          ['160119.SZ', '南方中证500LOF', '混合型', '指数型', '契约型开放式', 'E', 'L', '20110916', null],
        ],
      },
      etf_basic: {
        fields: ['ts_code', 'csname', 'extname', 'cname', 'index_code', 'list_date', 'list_status', 'exchange'],
        items: [['510300.SH', '300ETF', '华泰柏瑞沪深300ETF', '华泰柏瑞沪深300交易型开放式指数证券投资基金', '000300.SH', '20120528', 'L', 'SSE']],
      },
    });

    const snapshot = await fetchExchangeFundSnapshot({ ...options, fetchImpl });
    const etf = snapshot.securities.find((row) => row.ticker === '510300.SH');
    const reit = snapshot.securities.find((row) => row.ticker === '180101.SZ');
    const other = snapshot.securities.find((row) => row.ticker === '160119.SZ');
    expect(etf).toMatchObject({ asset_type: 'etf', fund_subtype: 'etf' });
    expect(reit).toMatchObject({ asset_type: 'fund', fund_subtype: 'reit' });
    expect(other).toMatchObject({ asset_type: 'fund', fund_subtype: 'other_exchange_fund' });
  });

  it('keeps only currently active convertible bonds', async () => {
    const fetchImpl = tushareFetch({
      cb_basic: {
        fields: ['ts_code', 'bond_short_name', 'bond_full_name', 'stk_code', 'list_date', 'delist_date', 'maturity_date'],
        items: [
          ['113001.SH', '中行转债', '中国银行A股可转换公司债券', '601988.SH', '20100618', null, '20300602'],
          ['128001.SZ', '澄星转债', '江苏澄星转债', '600078.SH', '20120510', '20150320', '20170510'],
        ],
      },
    });

    const snapshot = await fetchConvertibleBondSnapshot({ ...options, fetchImpl });
    expect(snapshot.securities.map((row) => row.ticker)).toEqual(['113001.SH']);
    expect(snapshot.securities[0]).toMatchObject({ asset_type: 'convertible_bond', instrument_form: 'bond' });
  });

  it('keeps Hong Kong Main Board listings and excludes GEM', async () => {
    const fetchImpl = tushareFetch({
      hk_basic: {
        fields: ['ts_code', 'name', 'fullname', 'enname', 'cn_spell', 'market', 'list_status', 'list_date', 'delist_date', 'curr_type'],
        items: [
          ['00700.HK', '腾讯控股', '腾讯控股有限公司', 'Tencent Holdings Limited', 'TXKG', '主板', 'L', '20040616', null, 'HKD'],
          ['08001.HK', '东方汇财证券', null, null, null, '创业板', 'L', '20000101', null, 'HKD'],
        ],
      },
    });

    const snapshot = await fetchHongKongMainBoardSnapshot({ ...options, fetchImpl });
    expect(snapshot.securities.map((row) => row.ticker)).toContain('00700.HK');
    expect(snapshot.securities.map((row) => row.ticker)).not.toContain('08001.HK');
    expect(snapshot.aliases.map((row) => row.alias)).toContain('700');
  });
});
