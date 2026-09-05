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
    const baseId = id.split('#')[0];
    const item = byId.get(baseId);
    const paragraph = item?.document?.paragraphs.find((candidate) => candidate.id === id);
    if (!item || seen.has(id) || (id !== baseId && !paragraph)) continue;
    seen.add(id);
    citations.push({
      id,
      title: item.title,
      url: item.url,
      domain: item.domain,
      publishedAt: item.publishedAt,
      trustScore: item.trustScore,
      qualityScore: item.qualityScore,
      qualityFlags: item.qualityFlags,
      corroborationCount: item.corroborationCount,
      ...(paragraph ? {
        paragraphId: paragraph.id,
        excerpt: paragraph.text,
        contentHash: paragraph.contentHash,
      } : {}),
    });
    if (citations.length >= limit) break;
  }
  return citations;
}

export function evidencePromptLines(evidence: ExternalEvidence[]): string[] {
  if (evidence.length === 0) return [];
  return evidence.flatMap((item) => {
    const date = item.publishedAt?.slice(0, 10) || 'date unavailable';
    const corroboration = item.corroboratingSources?.length
      ? ` | corroborated by ${item.corroboratingSources.map((source) => source.domain).join(', ')}`
      : '';
    if (item.document?.paragraphs.length) {
      return item.document.paragraphs.slice(0, 3).map((paragraph) => (
        `[${paragraph.id}] ${item.title} | ${item.domain} | ${date}${corroboration} | ${paragraph.text}`
      ));
    }
    return [`[${item.citationId}] ${item.title} | ${item.domain} | ${date}${corroboration} | ${item.snippet || 'No excerpt'}`];
  });
}
