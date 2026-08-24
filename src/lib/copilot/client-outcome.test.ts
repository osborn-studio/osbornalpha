import { describe, expect, it } from 'vitest';
import { classifyAiStreamOutcome } from './client-outcome';

describe('classifyAiStreamOutcome', () => {
  it('does not report an abruptly closed stream as completed', () => {
    expect(classifyAiStreamOutcome({ streamStarted: true, doneReceived: false, errorCode: null }))
      .toEqual({ status: 'failed', errorCode: 'stream_incomplete' });
  });

  it('reports completion only after the terminal done event', () => {
    expect(classifyAiStreamOutcome({ streamStarted: true, doneReceived: true, errorCode: null }))
      .toEqual({ status: 'completed', errorCode: null });
  });

  it('keeps a provider failure even when done follows it', () => {
    expect(classifyAiStreamOutcome({ streamStarted: true, doneReceived: true, errorCode: 'provider_timeout' }))
      .toEqual({ status: 'failed', errorCode: 'provider_timeout' });
  });
});
