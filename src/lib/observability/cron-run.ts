export interface CronRunContext {
  runId: string;
  name: string;
  startedAtMs: number;
}

export function startCronRun(name: string, now = Date.now()): CronRunContext {
  return { runId: crypto.randomUUID(), name, startedAtMs: now };
}

export function cronRunDuration(context: CronRunContext, now = Date.now()): number {
  return Math.max(0, now - context.startedAtMs);
}

export function cronErrorCode(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const code = error.message.split(':', 1)[0]?.trim();
  return code || fallback;
}

export function logCronEvent(
  level: 'info' | 'error',
  event: string,
  context: CronRunContext,
  fields: Record<string, unknown> = {},
): void {
  const payload = JSON.stringify({
    event,
    cron_run_id: context.runId,
    cron_name: context.name,
    ...fields,
  });
  if (level === 'error') console.error(payload);
  else console.info(payload);
}
