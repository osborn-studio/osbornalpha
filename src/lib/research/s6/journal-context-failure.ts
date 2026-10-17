// A failed journal-context request leaves the evaluation panel in a retryable journal error state:
// the retry control renders and computation resumes after the next successful load, instead of
// staying disabled until the panel is remounted.
export const JOURNAL_CONTEXT_UNAVAILABLE = 'journal_context_unavailable';

export function journalContextFailure(code: unknown, messages: Record<string, string>): { journalError: string; notice: string } {
  const key = typeof code === 'string' && code ? code : 'internal_error';
  return { journalError: JOURNAL_CONTEXT_UNAVAILABLE, notice: messages[key] || `未完成：${key}` };
}
