import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth/site-password';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST() {
  const resp = NextResponse.json({ ok: true });
  resp.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return resp;
}

export async function GET() {
  // Allow GET for convenient /api/auth/logout?return=/ link
  const resp = NextResponse.redirect(new URL('/unlock', 'https://stock-monitor-nu.vercel.app').toString());
  resp.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return resp;
}
