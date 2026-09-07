import { describe, expect, it } from 'vitest';
import {
  evaluateWatchlistOperationalHealth,
  parseWatchlistOperationalHealth,
  watchlistOperationalAlertEvaluation,
} from './operational-health';

const healthy = {
  generated_at: '2026-09-04T12:00:00Z',
  research_queue: { due: 2, failed: 0, oldest_due_at: '2026-09-04T11:50:00Z' },
  manual_research_jobs: {
    queued: 0, running: 0, failed: 0, cancelled: 0,
    oldest_queued_at: null, oldest_running_at: null,
  },
  metric_queue: { due: 1, failed: 0, oldest_due_at: '2026-09-04T11:45:00Z' },
  perspective_generation_queue: {
    queued: 0, running: 0, failed: 0, oldest_queued_at: null, oldest_running_at: null,
  },
  quotes: { count: 10, latest_observed_at: '2026-09-04T11:59:00Z' },
  metrics: { count: 10, latest_observed_at: '2026-09-04T11:30:00Z' },
  alerts: {
    latest_finished_at: '2026-09-04T11:50:00Z', latest_status: 'succeeded', pending: 1,
    failed: 0, dead_letter: 0, oldest_pending_at: '2026-09-04T11:55:00Z',
  },
  citations: { sample_size: 4, average_coverage: 0.75 },
  shared_research: { artifacts: 20, links: 30 },
  cron_dispatch: {
    pending: 0, running: 1, failed: 0, dead_letter: 0,
    oldest_unsucceeded_at: '2026-09-04T12:00:00Z',
    latest_succeeded_at: '2026-09-04T11:45:00Z',
  },
};

describe('Watchlist operational health', () => {
  it('parses and accepts a current healthy snapshot', () => {
    const parsed = parseWatchlistOperationalHealth(healthy);
    expect(parsed).not.toBeNull();
    expect(evaluateWatchlistOperationalHealth(parsed!)).toMatchObject({ status: 'healthy', warnings: [] });
  });

  it('marks stalled queues and dead letters critical', () => {
    const parsed = parseWatchlistOperationalHealth({
      ...healthy,
      research_queue: { due: 101, failed: 2, oldest_due_at: '2026-09-04T04:00:00Z' },
      alerts: { ...healthy.alerts, dead_letter: 1 },
    });
    expect(evaluateWatchlistOperationalHealth(parsed!)).toMatchObject({
      status: 'critical',
      warnings: expect.arrayContaining(['research_queue_stalled', 'alert_dead_letter']),
    });
  });

  it('detects failed and stalled perspective generation workers', () => {
    const parsed = parseWatchlistOperationalHealth({
      ...healthy,
      perspective_generation_queue: {
        queued: 3, running: 1, failed: 1,
        oldest_queued_at: '2026-09-04T11:00:00Z',
        oldest_running_at: '2026-09-04T11:40:00Z',
      },
    });
    expect(evaluateWatchlistOperationalHealth(parsed!)).toMatchObject({
      status: 'critical',
      warnings: expect.arrayContaining([
        'perspective_generation_failed',
        'perspective_generation_queue_stalled',
        'perspective_generation_worker_stalled',
      ]),
    });
  });

  it('detects failed and stalled manual research workers', () => {
    const parsed = parseWatchlistOperationalHealth({
      ...healthy,
      manual_research_jobs: {
        queued: 30, running: 1, failed: 2, cancelled: 3,
        oldest_queued_at: '2026-09-04T11:00:00Z',
        oldest_running_at: '2026-09-04T11:40:00Z',
      },
    });
    expect(evaluateWatchlistOperationalHealth(parsed!)).toMatchObject({
      status: 'critical',
      warnings: expect.arrayContaining([
        'manual_research_job_failed',
        'manual_research_queue_stalled',
        'manual_research_worker_stalled',
      ]),
    });
  });

  it('maps health warnings into the shared operational alert contract', () => {
    const parsed = parseWatchlistOperationalHealth({
      ...healthy,
      research_queue: { due: 0, failed: 1, oldest_due_at: null },
    });
    const evaluation = watchlistOperationalAlertEvaluation(evaluateWatchlistOperationalHealth(parsed!));
    expect(evaluation.metrics).toMatchObject({ status: 'degraded', warnings: ['research_queue_failed'] });
    expect(evaluation.violations).toEqual([{ code: 'research_queue_failed', value: 1, threshold: 0 }]);
  });

  it('detects stalled and dead-lettered scheduler slots', () => {
    const parsed = parseWatchlistOperationalHealth({
      ...healthy,
      cron_dispatch: {
        pending: 1, running: 0, failed: 2, dead_letter: 1,
        oldest_unsucceeded_at: '2026-09-04T10:00:00Z',
        latest_succeeded_at: '2026-09-04T10:00:00Z',
      },
    });
    expect(evaluateWatchlistOperationalHealth(parsed!)).toMatchObject({
      status: 'critical',
      warnings: expect.arrayContaining([
        'cron_dispatch_failed', 'cron_dispatch_dead_letter', 'cron_dispatch_stalled',
      ]),
    });
  });

  it('rejects malformed snapshots and reports empty installations as unknown', () => {
    expect(parseWatchlistOperationalHealth({ generated_at: 'bad' })).toBeNull();
    const parsed = parseWatchlistOperationalHealth({
      ...healthy,
      research_queue: { due: 0, failed: 0, oldest_due_at: null },
      metric_queue: { due: 0, failed: 0, oldest_due_at: null },
      quotes: { count: 0, latest_observed_at: null },
      metrics: { count: 0, latest_observed_at: null },
      alerts: { latest_finished_at: null, latest_status: null, pending: 0, failed: 0, dead_letter: 0, oldest_pending_at: null },
      citations: { sample_size: 0, average_coverage: null },
      shared_research: { artifacts: 0, links: 0 },
    });
    expect(evaluateWatchlistOperationalHealth(parsed!).status).toBe('unknown');
  });
});
