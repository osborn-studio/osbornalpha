import { describe, expect, it, vi } from 'vitest';
import {
  completeAiRun,
  createAiRun,
  failAiRun,
  stableAiErrorCode,
} from './runs';

function makeRunDb() {
  const single = vi.fn().mockResolvedValue({ data: { id: 'run-1' }, error: null });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn((_row: Record<string, unknown>) => ({ select }));
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn((_row: Record<string, unknown>) => ({ eq }));
  return {
    client: { from: vi.fn(() => ({ insert, update })) } as any,
    insert,
    update,
    eq,
  };
}

describe('ai run lifecycle', () => {
  it('creates a running row with a capped and redacted question', async () => {
    const db = makeRunDb();
    const question = `api_key=should-not-survive ${'x'.repeat(3000)}`;

    const id = await createAiRun(db.client, {
      userId: 'user-1',
      ticker: 'AAPL',
      methodId: 'john-cameron-5step',
      question,
    });

    expect(id).toBe('run-1');
    const inserted = db.insert.mock.calls[0][0] as Record<string, any>;
    expect(inserted).toMatchObject({
      user_id: 'user-1',
      ticker: 'AAPL',
      method_id: 'john-cameron-5step',
      status: 'running',
    });
    expect(inserted.question).not.toContain('should-not-survive');
    expect(inserted.question.length).toBeLessThanOrEqual(2000);
  });

  it('completes with sanitized visible text and bounded duration', async () => {
    const db = makeRunDb();

    await completeAiRun(db.client, 'run-1', {
      contentMd: '工具 search — {"source":"raw"}\n可见结论',
      verdict: { rating: 'hold', api_key: 'hidden' },
      durationMs: 1200.4,
    });

    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed',
      content_md: '可见结论',
      verdict: { rating: 'hold' },
      duration_ms: 1200,
      error_code: null,
    }));
    expect(db.eq).toHaveBeenCalledWith('id', 'run-1');
  });

  it('records stable failure codes and safe partial content', async () => {
    const db = makeRunDb();

    await failAiRun(db.client, 'run-1', {
      errorCode: 'provider_timeout',
      partialContent: '部分结果',
      durationMs: 500,
    });

    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      error_code: 'provider_timeout',
      content_md: '部分结果',
      duration_ms: 500,
    }));
  });

  it('maps provider failures without storing raw messages', () => {
    expect(stableAiErrorCode(new Error('connect timeout to upstream'))).toBe('provider_timeout');
    expect(stableAiErrorCode(new Error('quota exhausted'))).toBe('quota_exhausted');
    expect(stableAiErrorCode(new Error('socket stream aborted'))).toBe('stream_error');
    expect(stableAiErrorCode(new Error('sensitive provider detail'))).toBe('provider_error');
  });
});
