import type { EvidenceQuery, EvidenceScope, NormalizedEvidenceSearchRequest } from './types';

const SCOPE_TERMS: Record<EvidenceScope, { en: string; zh: string }> = {
  news: { en: 'latest news earnings product regulation', zh: '最新 新闻 业绩 产品 监管' },
  filing: { en: 'official filing announcement investor relations', zh: '官方 公告 交易所 投资者关系' },
  broker: { en: 'analyst research report rating target price', zh: '券商 研报 评级 目标价' },
  company: { en: 'company results guidance investor relations', zh: '公司 业绩 指引 投资者关系' },
  industry: { en: 'industry supply chain competition market outlook', zh: '行业 供应链 竞争 市场 展望' },
  macro: { en: 'macro interest rates policy regulation exposure', zh: '宏观 利率 政策 监管 影响' },
};

function prefersChinese(market?: string): boolean {
  return ['A', 'HK', 'TW'].includes((market || '').toUpperCase());
}

export function buildEvidenceQueries(request: NormalizedEvidenceSearchRequest): EvidenceQuery[] {
  if (request.query) {
    return [{
      query: request.query,
      scope: request.scopes[0],
      freshnessDays: request.freshnessDays,
      limit: request.limit,
    }];
  }

  const subject = [request.name, request.ticker].filter(Boolean).join(' ');
  const perQueryLimit = Math.min(5, Math.max(2, Math.ceil(request.limit / request.scopes.length)));
  return request.scopes.slice(0, 4).map((scope) => ({
    query: `${subject} ${prefersChinese(request.market) ? SCOPE_TERMS[scope].zh : SCOPE_TERMS[scope].en}`,
    scope,
    freshnessDays: request.freshnessDays,
    limit: perQueryLimit,
  }));
}
