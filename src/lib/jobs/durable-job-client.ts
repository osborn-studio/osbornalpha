export interface DurableJobView {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
}

interface VisibilityDocument {
  visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface DurableJobPollingDependencies<T extends DurableJobView> {
  fetchJob: (id: string, signal: AbortSignal) => Promise<T>;
  delay?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  waitUntilVisible?: (signal: AbortSignal) => Promise<void>;
  maxActivePollMs?: number;
}

const ACTIVE_STATUSES = new Set<DurableJobView['status']>(['queued', 'running']);

export function durableJobPollDelay(attempt: number): number {
  return Math.min(10_000, Math.round(1_000 * (1.6 ** Math.max(0, Math.floor(attempt)))));
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('cancelled', 'AbortError');
}

export function abortableJobDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds);
    function done() {
      signal.removeEventListener('abort', cancelled);
      resolve();
    }
    function cancelled() {
      clearTimeout(timer);
      reject(abortError(signal));
    }
    signal.addEventListener('abort', cancelled, { once: true });
  });
}

export function waitUntilPageVisible(
  signal: AbortSignal,
  page: VisibilityDocument | undefined = typeof document === 'undefined' ? undefined : document,
): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  if (!page || page.visibilityState !== 'hidden') return Promise.resolve();
  return new Promise((resolve, reject) => {
    function cleanup() {
      page!.removeEventListener('visibilitychange', changed);
      signal.removeEventListener('abort', cancelled);
    }
    function changed() {
      if (page!.visibilityState === 'hidden') return;
      cleanup();
      resolve();
    }
    function cancelled() {
      cleanup();
      reject(abortError(signal));
    }
    page.addEventListener('visibilitychange', changed);
    signal.addEventListener('abort', cancelled, { once: true });
  });
}

export async function waitForDurableJob<T extends DurableJobView>(
  initial: T,
  signal: AbortSignal,
  onProgress: (job: T) => void,
  dependencies: DurableJobPollingDependencies<T>,
): Promise<T> {
  const delay = dependencies.delay ?? abortableJobDelay;
  const waitUntilVisible = dependencies.waitUntilVisible ?? ((currentSignal) => waitUntilPageVisible(currentSignal));
  const maxActivePollMs = dependencies.maxActivePollMs ?? 20 * 60_000;
  let job = initial;
  let attempt = 0;
  let activeWaitMs = 0;
  while (ACTIVE_STATUSES.has(job.status)) {
    await waitUntilVisible(signal);
    if (attempt > 0) {
      const waitMs = durableJobPollDelay(attempt - 1);
      if (activeWaitMs + waitMs > maxActivePollMs) throw new Error('durable_job_timeout');
      await delay(waitMs, signal);
      activeWaitMs += waitMs;
      await waitUntilVisible(signal);
    }
    job = await dependencies.fetchJob(job.id, signal);
    onProgress(job);
    attempt += 1;
  }
  return job;
}
