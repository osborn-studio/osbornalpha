import { NextResponse } from 'next/server';
import { checkPassword, issueCookieValue, COOKIE_NAME, COOKIE_OPTIONS, isSitePasswordEnabled } from '@/lib/auth/site-password';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // If gate is off, just succeed silently (anyone can "log in")
  if (!isSitePasswordEnabled()) {
    return NextResponse.json({ ok: true, gate_disabled: true });
  }

  let password = '';
  try {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const body = await req.json();
      password = String(body?.password || '');
    } else {
      const form = await req.formData();
      password = String(form.get('password') || '');
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid request body' }, { status: 400 });
  }

  if (!password) {
    return NextResponse.json({ ok: false, error: 'password required' }, { status: 400 });
  }

  // Small delay to slow brute force (edge-runtime supports setTimeout)
  await new Promise((resolve) => setTimeout(resolve, 400));

  if (!checkPassword(password)) {
    return NextResponse.json({ ok: false, error: '密码错误' }, { status: 401 });
  }

  const cookieValue = await issueCookieValue();
  const resp = NextResponse.json({ ok: true });
  resp.cookies.set(COOKIE_NAME, cookieValue, COOKIE_OPTIONS);
  return resp;
}
