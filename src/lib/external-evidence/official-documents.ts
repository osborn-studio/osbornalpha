import { createHash } from 'node:crypto';
import { isOfficialEvidenceDomain } from './normalize';
import { canonicalizeEvidenceUrl } from './url';
import type { EvidenceDocument, EvidenceDocumentProvider, ExternalEvidence } from './types';

const PROVIDER_ID = 'official-document-http';
const MAX_DOCUMENTS = 3;
const MAX_PARAGRAPHS = 80;
const MAX_PARAGRAPH_LENGTH = 2_000;

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function endpoint(value: string | null | undefined): URL | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function paragraphText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_PARAGRAPH_LENGTH);
  return text.length >= 20 ? text : null;
}

export function configuredOfficialDocumentProvider(
  options: { endpoint?: string | null; token?: string | null; fetch?: typeof fetch } = {},
): EvidenceDocumentProvider | null {
  const url = endpoint(options.endpoint === undefined ? process.env.OFFICIAL_DOCUMENT_API_URL : options.endpoint);
  if (!url) return null;
  const token = options.token === undefined ? process.env.OFFICIAL_DOCUMENT_API_TOKEN?.trim() : options.token?.trim();
  return {
    id: PROVIDER_ID,
    async load(sourceUrl, signal) {
      const canonical = canonicalizeEvidenceUrl(sourceUrl);
      if (!canonical || !isOfficialEvidenceDomain(new URL(canonical).hostname.replace(/^www\./, ''))) {
        throw new Error('official_document_domain_rejected');
      }
      const response = await (options.fetch ?? fetch)(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ url: canonical }),
        signal: signal ? AbortSignal.any([AbortSignal.timeout(10_000), signal]) : AbortSignal.timeout(10_000),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`official_document_http_${response.status}`);
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('official_document_invalid_response');
      const payload = body as Record<string, unknown>;
      const responseUrl = typeof payload.url === 'string' ? canonicalizeEvidenceUrl(payload.url) : null;
      if (responseUrl !== canonical || !Array.isArray(payload.paragraphs) || payload.paragraphs.length > MAX_PARAGRAPHS) {
        throw new Error('official_document_invalid_response');
      }
      const paragraphs = payload.paragraphs.map(paragraphText);
      if (paragraphs.some((paragraph) => paragraph === null) || paragraphs.length === 0) {
        throw new Error('official_document_invalid_response');
      }
      return { url: canonical, paragraphs: paragraphs as string[] };
    },
  };
}

function documentFrom(citationId: string, value: Awaited<ReturnType<EvidenceDocumentProvider['load']>>, fetchedAt: Date): EvidenceDocument {
  const paragraphs = value.paragraphs.map((text, index) => ({
    id: `${citationId}#p${index + 1}`,
    text,
    contentHash: hash(text),
  }));
  return {
    url: value.url,
    contentHash: hash(paragraphs.map((paragraph) => paragraph.text).join('\n\n')),
    fetchedAt: fetchedAt.toISOString(),
    paragraphs,
  };
}

export async function enrichOfficialEvidenceDocuments(
  results: ExternalEvidence[],
  provider: EvidenceDocumentProvider | null,
  fetchedAt = new Date(),
): Promise<{ results: ExternalEvidence[]; warnings: string[] }> {
  const eligible = results.filter((item) => (
    (item.sourceType === 'filing' || item.sourceType === 'company') && isOfficialEvidenceDomain(item.domain)
  )).slice(0, MAX_DOCUMENTS);
  if (eligible.length === 0) return { results, warnings: [] };
  if (!provider) return { results, warnings: [] };
  const loaded = await Promise.allSettled(eligible.map(async (item) => ({
    citationId: item.citationId,
    document: documentFrom(item.citationId, await provider.load(item.url), fetchedAt),
  })));
  const documents = new Map(loaded.flatMap((result) => result.status === 'fulfilled'
    ? [[result.value.citationId, result.value.document] as const]
    : []));
  const failures = loaded.filter((result) => result.status === 'rejected').length;
  return {
    results: results.map((item) => documents.has(item.citationId) ? { ...item, document: documents.get(item.citationId) } : item),
    warnings: failures > 0 ? [`official_document_fetch_failed:${failures}`] : [],
  };
}
