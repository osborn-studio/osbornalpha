/**
 * Shared API helpers for /api/research/* routes.
 * Every route body runs behind assertEnabled(); when RESEARCH_OS_ENABLED is
 * not '1' the handler responds 501 without ever touching better-sqlite3.
 */

import { NextResponse } from 'next/server';
import { ResearchDisabled } from './db';
import { SourceValidationError } from './sources';
import { ThesisError } from './theses';

export function researchError(e: unknown): NextResponse {
  if (e instanceof ResearchDisabled) {
    return NextResponse.json({ error: 'research os is local-only' }, { status: 501 });
  }
  if (e instanceof SourceValidationError) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: e.message } },
      { status: 400 },
    );
  }
  if (e instanceof ThesisError) {
    return NextResponse.json(
      { error: { code: 'THESIS_ERROR', message: e.message } },
      { status: e.status },
    );
  }
  const message = e instanceof Error ? e.message : 'internal error';
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message } },
    { status: 500 },
  );
}

/** Wrap a route handler with the Research OS gate + uniform error mapping. */
export async function withResearch<T>(fn: () => T | Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    if (data instanceof NextResponse) return data;
    return NextResponse.json(data as unknown as Record<string, unknown>);
  } catch (e) {
    return researchError(e);
  }
}
