import type { EvidenceQuery, EvidenceSearchProvider, RawEvidenceResult } from '../types';
import { asJsonRecord, asText, fetchSearchJson } from './http';

interface OpenAIWebSearchOptions {
  model?: string;
  endpoint?: string;
}

const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/responses';

function finiteIndex(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function citationRecord(value: unknown): Record<string, unknown> | null {
  const annotation = asJsonRecord(value);
  if (!annotation) return null;
  if (annotation.type === 'url_citation') return annotation;
  return asJsonRecord(annotation.url_citation);
}

function excerpt(text: string, citation: Record<string, unknown>): string {
  const start = finiteIndex(citation.start_index);
  const end = finiteIndex(citation.end_index);
  if (start !== null && end !== null && end > start && start < text.length) {
    return text.slice(start, Math.min(end, text.length)).trim();
  }
  return text.trim().slice(0, 800);
}

function sourceResult(
  source: Record<string, unknown>,
  snippet: string,
): RawEvidenceResult | null {
  const url = asText(source.url);
  if (!url) return null;
  let fallbackTitle: string;
  try {
    fallbackTitle = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  return {
    title: asText(source.title)?.trim() || fallbackTitle,
    url,
    snippet,
    publishedAt: asText(source.published_at) ?? asText(source.published_date),
  };
}

const SCOPE_GUIDANCE: Record<EvidenceQuery['scope'], string> = {
  news: 'Prefer recent reporting from reputable newsrooms and the company itself.',
  filing: 'Prefer primary exchange, regulator, and company investor-relations filings.',
  broker: 'Prefer dated analyst or broker research that identifies the publishing institution.',
  company: 'Prefer primary company results, guidance, presentations, and investor-relations material.',
  industry: 'Prefer reputable industry data, trade publications, and clearly attributed research.',
  macro: 'Prefer central banks, statistical agencies, regulators, and reputable macro research.',
};

export function buildOpenAIWebSearchInput(query: EvidenceQuery): string {
  return [
    query.query,
    SCOPE_GUIDANCE[query.scope],
    `Only use sources published or materially updated within the last ${query.freshnessDays} days when a date is available.`,
    'Return source-backed facts; do not invent publication dates or source metadata.',
  ].join('\n');
}

export function parseOpenAIWebSearchResults(value: unknown, limit: number): RawEvidenceResult[] {
  const response = asJsonRecord(value);
  const output = Array.isArray(response?.output) ? response.output : [];
  const results: RawEvidenceResult[] = [];
  const seen = new Set<string>();

  function add(source: Record<string, unknown>, snippet: string) {
    if (results.length >= limit) return;
    const candidate = sourceResult(source, snippet);
    if (!candidate || seen.has(candidate.url)) return;
    seen.add(candidate.url);
    results.push(candidate);
  }

  for (const itemValue of output) {
    const item = asJsonRecord(itemValue);
    if (!item || item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const contentValue of item.content) {
      const content = asJsonRecord(contentValue);
      const text = asText(content?.text) ?? '';
      const annotations = Array.isArray(content?.annotations) ? content.annotations : [];
      for (const annotationValue of annotations) {
        const citation = citationRecord(annotationValue);
        if (citation) add(citation, excerpt(text, citation));
      }
    }
  }

  // The complete source list fills gaps when the model did not cite every URL.
  for (const itemValue of output) {
    const item = asJsonRecord(itemValue);
    if (!item || item.type !== 'web_search_call') continue;
    const action = asJsonRecord(item.action);
    const sources = Array.isArray(action?.sources) ? action.sources : [];
    for (const sourceValue of sources) {
      const source = asJsonRecord(sourceValue);
      if (source) add(source, '');
    }
  }
  return results;
}

export function createOpenAIWebSearchProvider(
  apiKey: string,
  options: OpenAIWebSearchOptions = {},
): EvidenceSearchProvider {
  const model = options.model?.trim() || DEFAULT_MODEL;
  const endpoint = options.endpoint?.trim() || DEFAULT_ENDPOINT;
  return {
    id: 'openai',
    async search(query: EvidenceQuery, signal?: AbortSignal): Promise<RawEvidenceResult[]> {
      const data = await fetchSearchJson(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          tools: [{ type: 'web_search', search_context_size: 'low' }],
          tool_choice: 'required',
          include: ['web_search_call.action.sources'],
          input: buildOpenAIWebSearchInput(query),
          max_output_tokens: 800,
        }),
        signal,
      });
      return parseOpenAIWebSearchResults(data, query.limit);
    },
  };
}
