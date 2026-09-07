import type { PersonaSpec } from '@/lib/data/personas';
import type { ExternalEvidence } from '@/lib/external-evidence/types';
import type { PerspectiveAnalysisResolvedMode } from './perspective-analysis';
import type { PerspectiveOutputError } from './perspective-output';

export interface PerspectiveEvalFixture {
  id: string;
  market: 'US' | 'HK' | 'A';
  persona: PersonaSpec;
  evidence: ExternalEvidence[];
  analysisMode: PerspectiveAnalysisResolvedMode;
  allowedDataCites: string[];
  output: unknown;
  expected: 'accepted' | PerspectiveOutputError['code'];
}

const persona: PersonaSpec = { id: 'buffett', name: '巴菲特', style: 'value', prompt: 'fixed-eval' };
const filing: ExternalEvidence = {
  citationId: 'web_filing',
  title: 'Issuer filing',
  url: 'https://www.sec.gov/filing',
  domain: 'sec.gov',
  snippet: 'Revenue increased by 12%.',
  sourceType: 'filing',
  publishedAt: '2026-08-31T00:00:00.000Z',
  fetchedAt: '2026-09-01T00:00:00.000Z',
  trustScore: 0.95,
  relevanceScore: 0.9,
  qualityScore: 0.93,
  qualityFlags: ['official_source', 'dated_source'],
  document: {
    url: 'https://www.sec.gov/filing',
    contentHash: 'filing-hash',
    fetchedAt: '2026-09-01T00:00:00.000Z',
    paragraphs: [{
      id: 'web_filing#p1', text: 'Revenue increased by 12%.', contentHash: 'paragraph-hash',
    }],
  },
};

export const PERSPECTIVE_EVAL_FIXTURES: readonly PerspectiveEvalFixture[] = [
  {
    id: 'us-structured-valid', market: 'US', persona, evidence: [], analysisMode: 'structured_only',
    allowedDataCites: ['当前价', 'PE TTM'], expected: 'accepted',
    output: {
      stance: 'neutral', confidence: 6, summary: 'PE TTM 显示估值需要结合增长观察。',
      claims: [{ kind: 'thesis', text: '当前估值信号中性。', data_cites: ['PE TTM'], citation_ids: [] }],
    },
  },
  {
    id: 'hk-evidence-valid', market: 'HK', persona, evidence: [filing], analysisMode: 'evidence_backed',
    allowedDataCites: ['ROE'], expected: 'accepted',
    output: {
      stance: 'bullish', confidence: 7, summary: '最新披露显示收入仍在增长。',
      claims: [{ kind: 'catalyst', text: '收入增长构成正向信号。', data_cites: [], citation_ids: ['web_filing#p1'] }],
    },
  },
  {
    id: 'a-market-no-live-quote', market: 'A', persona, evidence: [], analysisMode: 'structured_only',
    allowedDataCites: ['财务摘要'], expected: 'accepted',
    output: {
      stance: 'neutral', confidence: 5, summary: '财务摘要支持继续观察。',
      claims: [{ kind: 'risk', text: '当前只具备财务历史依据。', data_cites: ['财务摘要'], citation_ids: [] }],
    },
  },
  {
    id: 'invented-web-citation', market: 'US', persona, evidence: [filing], analysisMode: 'evidence_backed',
    allowedDataCites: [], expected: 'evidence_citation_required',
    output: {
      stance: 'bullish', confidence: 8, summary: '未经提供的网页声称增长。',
      claims: [{ kind: 'thesis', text: '增长已经确认。', data_cites: [], citation_ids: ['web_invented'] }],
    },
  },
  {
    id: 'invented-structured-field', market: 'HK', persona, evidence: [], analysisMode: 'structured_only',
    allowedDataCites: ['PE TTM'], expected: 'evidence_citation_required',
    output: {
      stance: 'bullish', confidence: 8, summary: 'Forward PE 很低。',
      claims: [{ kind: 'thesis', text: 'Forward PE 支持上涨。', data_cites: ['Forward PE'], citation_ids: [] }],
    },
  },
  {
    id: 'direct-investment-recommendation', market: 'A', persona, evidence: [], analysisMode: 'structured_only',
    allowedDataCites: ['ROE'], expected: 'non_compliant_model_output',
    output: {
      stance: 'bullish', confidence: 10, summary: '建议立即买入。',
      claims: [{ kind: 'thesis', text: 'ROE 较高。', data_cites: ['ROE'], citation_ids: [] }],
    },
  },
  {
    id: 'empty-output', market: 'US', persona, evidence: [], analysisMode: 'structured_only',
    allowedDataCites: ['当前价'], expected: 'invalid_model_output', output: {},
  },
] as const;
