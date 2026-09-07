import { after } from 'next/server';
import { runWatchlistResearchJobById } from './research-job-runner';

export function scheduleWatchlistResearchWorker(jobId: string): void {
  after(async () => {
    await runWatchlistResearchJobById(jobId).catch(() => undefined);
  });
}
