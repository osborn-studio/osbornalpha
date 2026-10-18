// One place that turns store error messages into HTTP statuses for the
// /api/analyst routes. Anything not listed is a 500 so unexpected failures stay loud.

import { NextResponse } from 'next/server';

const STATUS: Record<string, number> = {
  'not authenticated': 401,
  'analyst not found': 404,
  'recommendation not found': 404,
  'analyst archived': 409,
  'analyst name taken': 409,
  'self profile cannot be archived': 409,
  'recommendation withdrawn': 409,
};

export function analystError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: msg }, { status: STATUS[msg] ?? 500 });
}
