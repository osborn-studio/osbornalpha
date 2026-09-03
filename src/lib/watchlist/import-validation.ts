const VALIDATION_BATCH_SIZE = 100;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class ImportValidationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ImportValidationError';
  }
}

/**
 * Keeps the validation endpoint bounded while allowing spreadsheet imports to
 * contain more than one request-sized batch.
 */
export async function validateImportedTickerBatches(
  tickers: string[],
  request: FetchLike = fetch,
): Promise<{ accepted: string[]; rejected: string[] }> {
  const accepted: string[] = [];
  const rejected: string[] = [];

  for (let index = 0; index < tickers.length; index += VALIDATION_BATCH_SIZE) {
    const response = await request('/api/securities/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers: tickers.slice(index, index + VALIDATION_BATCH_SIZE) }),
    });
    const data = await response.json().catch(() => ({})) as {
      accepted?: unknown;
      rejected?: unknown;
      error?: unknown;
    };
    if (!response.ok) {
      throw new ImportValidationError(typeof data.error === 'string' ? data.error : 'validation_failed');
    }
    if (!Array.isArray(data.accepted) || !Array.isArray(data.rejected)
      || data.accepted.some((ticker) => typeof ticker !== 'string')
      || data.rejected.some((ticker) => typeof ticker !== 'string')) {
      throw new ImportValidationError('validation_failed');
    }
    accepted.push(...data.accepted as string[]);
    rejected.push(...data.rejected as string[]);
  }

  return { accepted, rejected };
}
