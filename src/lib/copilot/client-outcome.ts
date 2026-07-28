export type AiStreamOutcome =
  | { status: 'completed'; errorCode: null }
  | { status: 'failed'; errorCode: string }
  | { status: 'none'; errorCode: null };

export function classifyAiStreamOutcome(input: {
  streamStarted: boolean;
  doneReceived: boolean;
  errorCode: string | null;
}): AiStreamOutcome {
  if (input.errorCode) return { status: 'failed', errorCode: input.errorCode };
  if (!input.streamStarted) return { status: 'none', errorCode: null };
  if (!input.doneReceived) return { status: 'failed', errorCode: 'stream_incomplete' };
  return { status: 'completed', errorCode: null };
}
