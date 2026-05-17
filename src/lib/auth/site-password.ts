/**
 * Site-level password gate using HMAC-signed cookie.
 *
 * Zero deps. Works in Next.js edge runtime (Web Crypto only).
 *
 * Env vars:
 *   SITE_PASSWORD     — the shared password (empty = gate disabled)
 *   SITE_AUTH_SECRET  — HMAC signing key (random 32+ char string)
 *
 * Cookie name: sm_auth
 * Format:      "<base64-hmac>:<base64-payload>"
 * Payload:     JSON { exp: number (ms since epoch) }
 * TTL:         30 days
 */

export const COOKIE_NAME = 'sm_auth';
export const COOKIE_TTL_DAYS = 30;
const TTL_MS = COOKIE_TTL_DAYS * 24 * 60 * 60 * 1000;

export function isSitePasswordEnabled(): boolean {
  const pw = process.env.SITE_PASSWORD;
  return typeof pw === 'string' && pw.length > 0;
}

function getSecret(): string {
  return process.env.SITE_AUTH_SECRET || process.env.SITE_PASSWORD || 'dev-only-secret';
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  // Convert ArrayBuffer to base64
  let str = '';
  const bytes = new Uint8Array(sig);
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}

function b64url(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromB64url(s: string): string {
  let normalized = s.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  try { return decodeURIComponent(escape(atob(normalized))); } catch { return ''; }
}

export async function issueCookieValue(): Promise<string> {
  const payload = JSON.stringify({ exp: Date.now() + TTL_MS, v: 1 });
  const payloadB64 = b64url(payload);
  const sig = await hmacSha256(payloadB64, getSecret());
  return `${sig}:${payloadB64}`;
}

export async function verifyCookieValue(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const parts = value.split(':');
  if (parts.length !== 2) return false;
  const [sig, payloadB64] = parts;
  if (!sig || !payloadB64) return false;

  // Constant-time-ish compare via recomputed HMAC
  const expected = await hmacSha256(payloadB64, getSecret());
  if (expected !== sig) return false;

  const payloadStr = fromB64url(payloadB64);
  if (!payloadStr) return false;
  try {
    const { exp } = JSON.parse(payloadStr);
    return typeof exp === 'number' && Date.now() < exp;
  } catch {
    return false;
  }
}

export function checkPassword(input: string): boolean {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return false;
  // Constant-time compare via lengths + per-byte XOR
  if (input.length !== pw.length) return false;
  let mismatch = 0;
  for (let i = 0; i < pw.length; i++) {
    mismatch |= pw.charCodeAt(i) ^ input.charCodeAt(i);
  }
  return mismatch === 0;
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: TTL_MS / 1000,  // seconds
};
