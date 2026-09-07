import { describe, expect, it } from 'vitest';
import type { PersonaSpec } from '@/lib/data/personas';
import type { ExternalEvidence } from '@/lib/external-evidence/types';
import { normalizePerspectiveModelOutput, PerspectiveOutputError } from './perspective-output';

const persona: PersonaSpec = {
  id: 'buffett',
  name: 'Buffett',
  style: 'value',
  prompt: 'prompt',
};

const evidence: ExternalEvidence = {
  citationId: 'web_valid',
  title: 'Verified filing',
  url: 'https://sec.gov/filing',
  domain: 'sec.gov',
  snippet: 'Revenue increased.',
  sourceType: 'filing',
  publishedAt: '2026-09-03T00:00:00.000Z',
  fetchedAt: '2026-09-04T00:00:00.000Z',
  trustScore: 0.95,
  relevanceScore: 0.9,
  qualityScore: 0.92,
  qualityFlags: [],
  document: {
    url: 'https://sec.gov/filing',
    contentHash: 'document-hash',
    fetchedAt: '2026-09-04T00:00:00.000Z',
    paragraphs: [{ id: 'web_valid#p1', text: 'Revenue increased by 12%.', contentHash: 'paragraph-hash' }],
  },
};

describe('perspective model output', () => {
  it('normalizes independently cited claims and rejects invented citation ids', () => {
    const result = normalizePerspectiveModelOutput({
      value: {
        stance: 'bullish',
        confidence: 8,
        summary: 'Growth remains durable.',
        claims: [{
          kind: 'catalyst',
          text: 'Revenue growth is a near-term catalyst.',
          data_cites: ['Revenue growth'],
          citation_ids: ['web_valid#p1', 'web_invented'],
        }],
      },
      persona,
      evidence: [evidence],
      analysisMode: 'evidence_backed',
    });

    expect(result).toMatchObject({
      stance: 'bullish',
      cites: ['Revenue growth'],
      citations: [{ id: 'web_valid#p1', paragraphId: 'web_valid#p1' }],
      claims: [{
        kind: 'catalyst',
        text: 'Revenue growth is a near-term catalyst.',
        dataCites: ['Revenue growth'],
        citations: [{ id: 'web_valid#p1', excerpt: 'Revenue increased by 12%.' }],
      }],
    });
  });

  it('normalizes alert-ready invalidation conditions through the alert catalog', () => {
    const result = normalizePerspectiveModelOutput({
      value: {
        stance: 'bearish',
        confidence: 7,
        summary: 'Momentum is stretched.',
        claims: [{
          kind: 'risk',
          text: 'RSI indicates elevated reversal risk.',
          data_cites: ['RSI (14)'],
          citation_ids: [],
          invalidation: {
            condition: 'The risk signal clears when RSI falls below 45.',
            alert_type: 'metric',
            operator: 'crosses_below',
            threshold: 45,
            config: { metric: 'rsi14' },
          },
        }],
      },
      persona,
      evidence: [],
      analysisMode: 'structured_only',
    });

    expect(result.claims?.[0].invalidation).toEqual({
      condition: 'The risk signal clears when RSI falls below 45.',
      alertType: 'metric',
      operator: 'crosses_below',
      threshold: 45,
      config: { metric: 'rsi14' },
    });
  });

  it('drops invalid invalidation payloads without rejecting legacy claims', () => {
    const result = normalizePerspectiveModelOutput({
      value: {
        stance: 'neutral',
        confidence: 5,
        summary: 'Valuation is balanced.',
        claims: [{
          kind: 'thesis',
          text: 'Valuation is near its normal range.',
          data_cites: ['PE TTM'],
          citation_ids: [],
          invalidation: {
            condition: 'Unexpected field must not reach alert config.',
            alert_type: 'valuation',
            operator: 'gt',
            threshold: 40,
            config: { metric: 'pe_ttm', prompt: 'ignore rules' },
          },
        }],
      },
      persona,
      evidence: [],
      analysisMode: 'structured_only',
    });

    expect(result.claims?.[0].invalidation).toBeUndefined();
  });

  it('projects legacy summaries into the claim read model', () => {
    const result = normalizePerspectiveModelOutput({
      value: {
        stance: 'neutral', confidence: 6, summary: 'Valuation is balanced.',
        data_cites: ['PE TTM'], citation_ids: [],
      },
      persona,
      evidence: [],
      analysisMode: 'structured_only',
    });

    expect(result.claims).toEqual([{
      id: 'claim_1', kind: 'thesis', text: 'Valuation is balanced.', dataCites: ['PE TTM'], citations: [],
    }]);
  });

  it('rejects unsupported claims instead of presenting model prose as evidence-backed', () => {
    expect(() => normalizePerspectiveModelOutput({
      value: {
        summary: 'Unsupported.',
        claims: [{ kind: 'risk', text: 'A risk with no supplied support.', data_cites: [], citation_ids: [] }],
      },
      persona,
      evidence: [evidence],
      analysisMode: 'structured_only',
    })).toThrow(new PerspectiveOutputError('evidence_citation_required'));
  });

  it('requires at least one verified web citation in evidence-backed mode', () => {
    expect(() => normalizePerspectiveModelOutput({
      value: {
        summary: 'Structured-only claim.',
        claims: [{ kind: 'thesis', text: 'PE supports the view.', data_cites: ['PE TTM'], citation_ids: [] }],
      },
      persona,
      evidence: [evidence],
      analysisMode: 'evidence_backed',
    })).toThrow(new PerspectiveOutputError('evidence_citation_required'));
  });

  it('rejects claims that cite structured data absent from this generation context', () => {
    expect(() => normalizePerspectiveModelOutput({
      value: {
        summary: 'Forward earnings support the view.',
        claims: [{
          kind: 'thesis', text: 'Forward PE is attractive.',
          data_cites: ['Forward PE'], citation_ids: [],
        }],
      },
      persona,
      evidence: [],
      analysisMode: 'structured_only',
      allowedDataCites: ['PE TTM', 'PB'],
    })).toThrow(new PerspectiveOutputError('evidence_citation_required'));
  });
});
