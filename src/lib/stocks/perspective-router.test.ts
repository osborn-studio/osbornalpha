import { describe, expect, it } from 'vitest';
import { PERSONAS, type StockContext } from '@/lib/data/personas';
import type { ExternalEvidence } from '@/lib/external-evidence/types';
import { selectPerspectivePersonas } from './perspective-router';

function context(patch: Partial<StockContext> = {}): StockContext {
  return {
    ticker: 'AAPL', name: 'Apple', market: 'US', currency: '$', price: 200,
    change_pct: 0.5, external_evidence: [], ...patch,
  };
}

describe('perspective importance router', () => {
  it('bounds the default committee and promotes personas relevant to available evidence', () => {
    const selected = selectPerspectivePersonas(PERSONAS, context({
      pe_ttm: 45,
      change_pct: -4,
      external_evidence: [{ sourceType: 'macro' } as ExternalEvidence],
    }));
    expect(selected).toHaveLength(4);
    expect(selected.map((item) => item.id)).toEqual(expect.arrayContaining(['burry', 'druckenmiller', 'marks']));
  });

  it('honors an explicit valid persona selection in registry order', () => {
    expect(selectPerspectivePersonas(PERSONAS, context(), ['li_lu', 'buffett']).map((item) => item.id))
      .toEqual(['buffett', 'li_lu']);
  });
});
