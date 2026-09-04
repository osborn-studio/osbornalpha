import type { ExternalEvidence, PerspectiveCitation } from './types';

export function resolvePerspectiveCitations(
  ids: unknown,
  evidence: ExternalEvidence[],
  limit = 6,
): PerspectiveCitation[] {
  if (!Array.isArray(ids)) return [];
  const byId = new Map(evidence.map((item) => [item.citationId, item]));
  const seen = new Set<string>();
  const citations: PerspectiveCitation[] = [];
  for (const rawId of ids) {
    const id = String(rawId);
    const item = byId.get(id);
    if (!item || seen.has(id)) continue;
    seen.add(id);
    citations.push({
      id,
      title: item.title,
      url: item.url,
      domain: item.domain,
      publishedAt: item.publishedAt,
      trustScore: item.trustScore,
    });
    if (citations.length >= limit) break;
  }
  return citations;
}

export function evidencePromptLines(evidence: ExternalEvidence[]): string[] {
  if (evidence.length === 0) return [];
  return evidence.map((item) => {
    const date = item.publishedAt?.slice(0, 10) || 'date unavailable';
    return `[${item.citationId}] ${item.title} | ${item.domain} | ${date} | ${item.snippet || 'No excerpt'}`;
  });
}
