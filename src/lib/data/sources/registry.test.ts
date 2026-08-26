import { afterEach, describe, it, expect } from 'vitest';
import { quoteSourcesFor } from './registry';

const originalBaseUrl = process.env.DATAGATEWAY_BASE_URL;
const originalApiKey = process.env.DATAGATEWAY_API_KEY;

afterEach(() => {
  if (originalBaseUrl === undefined) delete process.env.DATAGATEWAY_BASE_URL;
  else process.env.DATAGATEWAY_BASE_URL = originalBaseUrl;
  if (originalApiKey === undefined) delete process.env.DATAGATEWAY_API_KEY;
  else process.env.DATAGATEWAY_API_KEY = originalApiKey;
});

describe('quoteSourcesFor', () => {
  it('routes markets to sources', () => {
    expect(quoteSourcesFor('A').map((s) => s.name)).toEqual(['eastmoney', 'sina', 'tencent']);
    expect(quoteSourcesFor('HK').map((s) => s.name)).toEqual(['eastmoney', 'sina', 'tencent']);
    expect(quoteSourcesFor('US').map((s) => s.name)).toEqual(['eastmoney', 'sina', 'tencent']);
    expect(quoteSourcesFor('TW').map((s) => s.name)).toEqual(['twse']);
    expect(quoteSourcesFor('JP').map((s) => s.name)).toEqual([]); // EODHD 未配置
    expect(quoteSourcesFor('KR').map((s) => s.name)).toEqual([]); // EODHD 未配置
  });

  it('puts Wind DataGateway first when configured', () => {
    process.env.DATAGATEWAY_BASE_URL = 'https://wind-gateway.example.ts.net';
    process.env.DATAGATEWAY_API_KEY = 'test-secret';
    expect(quoteSourcesFor('A').map((s) => s.name)).toEqual(['datagateway-wind', 'eastmoney', 'sina', 'tencent']);
    expect(quoteSourcesFor('TW').map((s) => s.name)).toEqual(['datagateway-wind', 'twse']);
    expect(quoteSourcesFor('JP').map((s) => s.name)).toContain('datagateway-wind');
  });
});
