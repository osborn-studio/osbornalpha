import { describe, expect, it, vi } from 'vitest';
import { configuredOfficialDocumentProvider, enrichOfficialEvidenceDocuments } from './official-documents';
import { normalizeEvidenceResults } from './normalize';

describe('official evidence documents', () => {
  it('rejects non-official source URLs before contacting the extractor', async () => {
    const request = vi.fn();
    const provider = configuredOfficialDocumentProvider({ endpoint: 'https://extractor.example.test/v1', fetch: request as unknown as typeof fetch })!;
    await expect(provider.load('https://example.com/filing')).rejects.toThrow('official_document_domain_rejected');
    expect(request).not.toHaveBeenCalled();
  });

  it('adds hashed paragraph citations only to allowlisted official evidence', async () => {
    const results = normalizeEvidenceResults([
      { title: 'Company filing', url: 'https://www.sec.gov/Archives/example', snippet: 'summary' },
    ], 'filing', new Date('2026-09-04T00:00:00Z'));
    const provider = {
      id: 'test-extractor',
      load: vi.fn(async (url: string) => ({
        url,
        paragraphs: ['Revenue increased by 20 percent during the fiscal year.'],
      })),
    };
    const enriched = await enrichOfficialEvidenceDocuments(results, provider, new Date('2026-09-04T01:00:00Z'));
    expect(enriched.warnings).toEqual([]);
    expect(enriched.results[0].document).toMatchObject({
      fetchedAt: '2026-09-04T01:00:00.000Z',
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      paragraphs: [{
        id: `${results[0].citationId}#p1`,
        text: 'Revenue increased by 20 percent during the fiscal year.',
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }],
    });
  });

  it('keeps search evidence usable when extraction is not configured', async () => {
    const results = normalizeEvidenceResults([
      { title: 'Exchange announcement', url: 'https://hkexnews.hk/listedco/example', snippet: 'summary' },
    ], 'filing', new Date('2026-09-04T00:00:00Z'));
    const enriched = await enrichOfficialEvidenceDocuments(results, null);
    expect(enriched.results).toEqual(results);
    expect(enriched.warnings).toEqual([]);
  });

  it('propagates caller cancellation into the configured extractor request', async () => {
    const controller = new AbortController();
    const request = vi.fn((_url: URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    }));
    const provider = configuredOfficialDocumentProvider({ endpoint: 'https://extractor.example.test/v1', fetch: request as unknown as typeof fetch })!;
    const pending = provider.load('https://www.sec.gov/Archives/example', controller.signal);
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    controller.abort(new DOMException('cancelled', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
