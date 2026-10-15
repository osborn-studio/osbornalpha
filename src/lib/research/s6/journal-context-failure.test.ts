import { describe, expect, it } from 'vitest';
import { JOURNAL_CONTEXT_UNAVAILABLE, journalContextFailure } from './journal-context-failure';

// A failed journal-context request must leave the panel in a retryable journal error state, so the
// retry control renders and computation can resume once connectivity recovers (Codex P2, 2026-10-15).
describe('journalContextFailure', () => {
  const messages = { network_unavailable: '网络不可用。', not_authenticated: '请重新登录。' };
  it('maps any context failure to a retryable journal error', () => {
    expect(journalContextFailure('network_unavailable', messages).journalError).toBe(JOURNAL_CONTEXT_UNAVAILABLE);
    expect(journalContextFailure('invalid_response', messages).journalError).toBe(JOURNAL_CONTEXT_UNAVAILABLE);
  });
  it('keeps the specific notice when one is known, else a generic one naming the code', () => {
    expect(journalContextFailure('network_unavailable', messages).notice).toBe('网络不可用。');
    expect(journalContextFailure('weird_code', messages).notice).toBe('未完成：weird_code');
  });
  it('never clears the error for a non-string code', () => {
    expect(journalContextFailure(undefined, messages)).toEqual({ journalError: JOURNAL_CONTEXT_UNAVAILABLE, notice: '未完成：internal_error' });
  });
});
