import { describe, expect, it } from 'vitest';
import { parseSinaUsKlineJsonp, sinaUsKlineSymbol } from './sina';

describe('Sina US historical K-line adapter', () => {
  it('only accepts the verified simple US symbol form', () => {
    expect(sinaUsKlineSymbol('NVDA')).toBe('NVDA');
    expect(sinaUsKlineSymbol('BRK.B')).toBeNull();
    expect(sinaUsKlineSymbol('00700.HK')).toBeNull();
  });

  it('parses the anti-redirect-prefixed JSONP payload', () => {
    const bars = parseSinaUsKlineJsonp(`/*<script>location.href='//sina.com';</script>*/\nvar _data=([{"d":"2026-08-11","o":"222.17","h":"222.20","l":"216.20","c":"217.50","v":"101273148"}]);`);
    expect(bars).toEqual([{ time: '2026-08-11', open: 222.17, high: 222.2, low: 216.2, close: 217.5, volume: 101273148 }]);
  });

  it('fails closed on a changed wrapper', () => {
    expect(() => parseSinaUsKlineJsonp('{"data":[]}')).toThrow(/wrapper changed/);
  });
});
