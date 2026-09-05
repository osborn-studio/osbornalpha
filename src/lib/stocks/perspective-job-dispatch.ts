import { after } from 'next/server';
import { runPerspectiveGenerationJobById } from './perspective-job-runner';

/**
 * Start queue work after the 202 response is flushed. The durable Cron poller
 * remains the recovery path if the serverless invocation ends early.
 */
export function schedulePerspectiveGenerationWorker(jobId: string): void {
  after(async () => {
    await runPerspectiveGenerationJobById(jobId).catch(() => undefined);
  });
}
