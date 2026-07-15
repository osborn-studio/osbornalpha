const TUSHARE_ENDPOINT = 'https://api.tushare.pro';

export type SecuritySourceErrorCode =
  | 'source_auth'
  | 'source_authorization_required'
  | 'source_schema'
  | 'source_timeout'
  | 'source_http';

export class SecuritySourceError extends Error {
  constructor(
    public readonly code: SecuritySourceErrorCode,
    public readonly source: string,
  ) {
    super(`${source} request failed: ${code}`);
    this.name = 'SecuritySourceError';
  }
}

export interface TushareCallOptions {
  apiName: string;
  params: Record<string, string | number | boolean | null | undefined>;
  fields: readonly string[];
  token?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface TushareAdapterOptions {
  token?: string;
  asOf?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface TushareEnvelope {
  code: number;
  data: { fields: unknown; items: unknown } | null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export async function callTushare<T extends Record<string, unknown>>(
  options: TushareCallOptions,
): Promise<T[]> {
  const token = options.token ?? process.env.TUSHARE_TOKEN;
  if (!token) throw new SecuritySourceError('source_auth', 'tushare');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  let response: Response;

  try {
    response = await (options.fetchImpl ?? fetch)(TUSHARE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_name: options.apiName,
        token,
        params: options.params,
        fields: options.fields.join(','),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new SecuritySourceError(isAbortError(error) ? 'source_timeout' : 'source_http', 'tushare');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) throw new SecuritySourceError('source_http', 'tushare');

  let envelope: TushareEnvelope;
  try {
    envelope = await response.json() as TushareEnvelope;
  } catch {
    throw new SecuritySourceError('source_schema', 'tushare');
  }

  if (!envelope || typeof envelope.code !== 'number') {
    throw new SecuritySourceError('source_schema', 'tushare');
  }
  if (envelope.code !== 0) throw new SecuritySourceError('source_auth', 'tushare');
  if (envelope.data === null) return [];

  const fields = envelope.data.fields;
  const items = envelope.data.items;
  if (!Array.isArray(fields) || !fields.every((field) => typeof field === 'string') || !Array.isArray(items)) {
    throw new SecuritySourceError('source_schema', 'tushare');
  }
  if (!options.fields.every((field) => fields.includes(field))) {
    throw new SecuritySourceError('source_schema', 'tushare');
  }

  return items.map((item) => {
    if (!Array.isArray(item) || item.length !== fields.length) {
      throw new SecuritySourceError('source_schema', 'tushare');
    }
    return Object.fromEntries(fields.map((field, index) => [field, item[index]])) as T;
  });
}

export function resolveAsOf(asOf?: string): string {
  const value = asOf ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new SecuritySourceError('source_schema', 'tushare');
  }
  return value;
}

export function tushareDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const compact = String(value).replaceAll('-', '');
  if (!/^\d{8}$/.test(compact)) throw new SecuritySourceError('source_schema', 'tushare');
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

export function sourceTimestamp(asOf: string): string {
  return `${asOf}T00:00:00.000Z`;
}
