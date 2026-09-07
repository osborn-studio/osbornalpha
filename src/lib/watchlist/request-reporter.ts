import { NextResponse, type NextResponse as NextResponseType } from 'next/server';
import {
  logRequestEvent,
  requestErrorCode,
  requestRunDuration,
  runRequestStep,
  startRequestRun,
  type RequestRunContext,
} from '@/lib/observability/request-run';
import { watchlistApiError } from './api-error';

interface ReporterOptions {
  status?: number;
  fields?: Record<string, unknown>;
  headers?: HeadersInit;
}

export interface WatchlistRequestReporter {
  readonly context: RequestRunContext;
  step<T>(name: string, operation: () => Promise<T>): Promise<T>;
  json<T>(body: T, options?: ReporterOptions): NextResponseType<T>;
  response(body: BodyInit | null, init?: ResponseInit, fields?: Record<string, unknown>): NextResponseType;
  reject(
    code: string,
    status: number,
    options?: Parameters<typeof watchlistApiError>[2] & { fields?: Record<string, unknown> },
  ): NextResponseType;
  fail(
    error: unknown,
    publicCode: string,
    status?: number,
    options?: Parameters<typeof watchlistApiError>[2] & { fields?: Record<string, unknown> },
  ): NextResponseType;
}

export function createWatchlistRequestReporter(
  name: string,
  request: Pick<Request, 'method'>,
  requestId?: string,
): WatchlistRequestReporter {
  const context = startRequestRun(name, request.method, Date.now(), requestId);
  const complete = (
    level: 'info' | 'warn' | 'error',
    event: 'request_complete' | 'request_failed',
    status: number,
    fields: Record<string, unknown> = {},
  ) => logRequestEvent(level, event, context, {
    status,
    duration_ms: requestRunDuration(context),
    ...fields,
  });
  return {
    context,
    step: (step, operation) => runRequestStep(context, step, operation),
    json: (body, options = {}) => {
      const status = options.status ?? 200;
      complete(status >= 400 ? 'warn' : 'info', 'request_complete', status, options.fields);
      const headers = new Headers(options.headers);
      headers.set('x-request-id', context.requestId);
      return NextResponse.json(body, { status, headers });
    },
    response: (body, init = {}, fields = {}) => {
      const status = init.status ?? 200;
      complete(status >= 400 ? 'warn' : 'info', 'request_complete', status, fields);
      const headers = new Headers(init.headers);
      headers.set('x-request-id', context.requestId);
      return new NextResponse(body, { ...init, status, headers });
    },
    reject: (code, status, options = {}) => {
      complete('warn', 'request_complete', status, { error_code: code, ...options.fields });
      const { fields: _fields, ...apiOptions } = options;
      return watchlistApiError(code, status, { ...apiOptions, requestId: context.requestId });
    },
    fail: (error, publicCode, status = 503, options = {}) => {
      complete('error', 'request_failed', status, {
        error_code: requestErrorCode(error, publicCode),
        ...options.fields,
      });
      const { fields: _fields, ...apiOptions } = options;
      return watchlistApiError(publicCode, status, { ...apiOptions, requestId: context.requestId });
    },
  };
}
