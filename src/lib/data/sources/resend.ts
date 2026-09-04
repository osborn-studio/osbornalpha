/**
 * Resend email API client (REST).
 *
 * Setup:
 *   1. Sign up at https://resend.com (free tier: 100 emails/day, 3,000/month)
 *   2. Get API key from https://resend.com/api-keys
 *   3. Set Vercel env vars:
 *        vercel env add RESEND_API_KEY production    # re_xxxxxxxxxxxxx
 *        vercel env add EMAIL_FROM production         # 'Sentinel <noreply@yourdomain.com>'
 *        vercel env add EMAIL_TO production           # 'you@example.com'
 *
 *   For quick testing without domain verification, use Resend's sandbox sender:
 *        EMAIL_FROM = 'onboarding@resend.dev'
 *        EMAIL_TO   = (must be the email you signed up with)
 *
 *   For production, add+verify your domain at https://resend.com/domains
 */

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Sentinel <onboarding@resend.dev>';

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_TO);
}

export interface SendEmailOpts {
  to?: string | string[];        // override env
  from?: string;                  // override env
  subject: string;
  html: string;
  text?: string;                  // plain-text fallback (recommended)
  replyTo?: string;
  timeoutMs?: number;
  idempotencyKey?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;        // Resend message id on success
  error?: string;
  status?: number;
}

export async function sendEmail(opts: SendEmailOpts): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }

  const to = opts.to || process.env.EMAIL_TO;
  if (!to) return { ok: false, error: 'EMAIL_TO not configured and no `to` provided' };

  const from = opts.from || process.env.EMAIL_FROM || DEFAULT_FROM;

  const body: any = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject: opts.subject,
    html: opts.html,
  };
  if (opts.text) body.text = opts.text;
  if (opts.replyTo) body.reply_to = opts.replyTo;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);

  let resp: Response;
  try {
    resp = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    return { ok: false, error: e?.message || 'network error' };
  }
  clearTimeout(timer);

  if (!resp.ok) {
    let errText = '';
    try { errText = await resp.text(); } catch {}
    return { ok: false, status: resp.status, error: errText.slice(0, 300) || `HTTP ${resp.status}` };
  }

  const json = await resp.json().catch(() => ({}));
  return { ok: true, id: json.id, status: resp.status };
}
