import { describe, it, expect } from 'vitest';
import { classifyLlmError, httpClass, type LlmFailure } from './errors';

describe('llm/errors httpClass', () => {
  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [402, 'quota'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [500, 'server_error'],
    [502, 'server_error'],
    [400, 'bad_request'],
    [422, 'bad_request'],
  ] as const)('maps HTTP %s to %s', (status, cls) => {
    expect(httpClass(status)).toBe(cls);
  });
});

describe('llm/errors classifyLlmError', () => {
  it('extracts the status from the adapter "llm <status>: <upstream text>" prefix and drops the text', () => {
    const f = classifyLlmError(new Error('llm 401: {"error":{"message":"Incorrect API key provided: sk-abc"}}'));
    expect(f).toEqual({ class: 'auth', status: 401 });
    expect(JSON.stringify(f)).not.toContain('sk-abc');
  });

  it('classifies 402 as quota and 404 as not_found', () => {
    expect(classifyLlmError(new Error('llm 402: insufficient balance'))).toEqual({ class: 'quota', status: 402 });
    expect(classifyLlmError(new Error('llm 404: model not found'))).toEqual({ class: 'not_found', status: 404 });
  });

  it('classifies an aborted fetch as timeout', () => {
    const e = new Error('The operation was aborted');
    e.name = 'AbortError';
    expect(classifyLlmError(e)).toEqual({ class: 'timeout' });
    expect(classifyLlmError(new DOMException('aborted', 'AbortError'))).toEqual({ class: 'timeout' });
  });

  it('classifies an adapter response-shape error as invalid_output', () => {
    const e = new Error('llm invalid_output');
    e.name = 'LlmResponseShapeError';
    expect(classifyLlmError(e)).toEqual({ class: 'invalid_output' });
  });

  it('classifies a fetch TypeError (DNS, TLS, refused) as network', () => {
    expect(classifyLlmError(new TypeError('fetch failed'))).toEqual({ class: 'network' });
  });

  it('classifies everything else as unknown without carrying the message', () => {
    const f: LlmFailure = classifyLlmError(new Error('provider empty response (finish_reason=length) secret-text'));
    expect(f).toEqual({ class: 'unknown' });
    expect(classifyLlmError('a string')).toEqual({ class: 'unknown' });
    expect(classifyLlmError(null)).toEqual({ class: 'unknown' });
  });
});
