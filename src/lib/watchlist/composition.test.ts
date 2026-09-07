import { describe, expect, it } from 'vitest';
import { compositionEnvelope } from './composition';

describe('compositionEnvelope', () => {
  it('normalizes composition and publishes only correlations with enough observations', () => {
    const result = compositionEnvelope({
      totalSecurities: 4,
      markets: [{ key: 'US', count: 3, sharePct: 75 }],
      industries: [{ key: 'Technology', count: 2, sharePct: 50 }],
      currencies: [{ key: 'USD', count: 3, sharePct: 75 }],
      correlations: [
        { leftTicker: 'AAPL', rightTicker: 'MSFT', correlation: 0.91, observations: 50 },
        { leftTicker: 'AAPL', rightTicker: 'NVDA', correlation: 0.7, observations: 10 },
      ],
      asOf: new Date().toISOString(),
    });
    expect(result.value).toMatchObject({
      totalSecurities: 4,
      markets: [{ key: 'US', count: 3, sharePct: 75 }],
      highCorrelationCount: 1,
      correlations: [{ leftTicker: 'AAPL', rightTicker: 'MSFT', correlation: 0.91, observations: 50 }],
    });
  });
});
