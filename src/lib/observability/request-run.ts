export interface RequestRunContext {
  requestId: string;
  name: string;
  method: string;
  startedAtMs: number;
}

export function startRequestRun(
  name: string,
  method: string,
  now = Date.now(),
  requestId = crypto.randomUUID(),
): RequestRunContext {
  return { requestId, name, method, startedAtMs: now };
}

export function requestRunDuration(context: RequestRunContext, now = Date.now()): number {
  return Math.max(0, now - context.startedAtMs);
}

export function requestErrorCode(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const candidate = error.message.split(':', 1)[0]?.trim();
  return candidate && /^[a-z0-9_]+$/i.test(candidate) ? candidate : fallback;
}

export function logRequestEvent(
  level: 'info' | 'warn' | 'error',
  event: string,
  context: RequestRunContext,
  fields: Record<string, unknown> = {},
): void {
  const payload = JSON.stringify({
    event,
    request_id: context.requestId,
    request_name: context.name,
    method: context.method,
    ...fields,
  });
  if (level === 'error') console.error(payload);
  else if (level === 'warn') console.warn(payload);
  else console.info(payload);
}

export async function runRequestStep<T>(
  context: RequestRunContext,
  step: string,
  operation: () => Promise<T>,
  now: () => number = Date.now,
): Promise<T> {
  const startedAt = now();
  try {
    const value = await operation();
    logRequestEvent('info', 'request_step_complete', context, {
      step,
      duration_ms: Math.max(0, now() - startedAt),
    });
    return value;
  } catch (error) {
    logRequestEvent('error', 'request_step_failed', context, {
      step,
      duration_ms: Math.max(0, now() - startedAt),
      error_code: requestErrorCode(error, `${step}_failed`),
    });
    throw error;
  }
}
