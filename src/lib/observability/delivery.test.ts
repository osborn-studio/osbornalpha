import { describe, expect, it } from 'vitest';
import { formatOperationalAlert, parseAlertRecipients } from './delivery';

describe('operational alert delivery', () => {
  it('parses and deduplicates comma-separated recipients', () => {
    expect(parseAlertRecipients(' first@example.com,second@example.com first@example.com ')).toEqual([
      'first@example.com',
      'second@example.com',
    ]);
  });

  it('formats stable metrics and error-code counts without raw provider errors', () => {
    const message = formatOperationalAlert({
      checkName: 'ai_daily',
      window: { from: '2026-07-19T16:00:00.000Z', to: '2026-07-20T16:00:00.000Z' },
      metrics: {
        terminal_runs: 10,
        failure_rate: 0.2,
        failures_by_error_code: { provider_timeout: 2 },
      },
      violations: [{ code: 'ai_failure_rate_high', value: 0.2, threshold: 0.1 }],
    });

    expect(message.subject).toContain('AI daily');
    expect(message.text).toContain('provider_timeout: 2');
    expect(message.text).toContain('ai_failure_rate_high');
    expect(message.html).not.toContain('<script');
  });
});
