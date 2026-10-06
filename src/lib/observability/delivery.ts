import { sendEmail } from '@/lib/data/sources/resend';
import { isTelegramConfigured, sendTelegram } from '@/lib/data/sources/telegram';
import type { AlertViolation, AlertWindow } from './evaluators';

interface AlertMessageInput {
  checkName: 'ai_daily' | 'quote_15m' | 'auth_email_daily';
  window: AlertWindow;
  metrics: Record<string, unknown>;
  violations: AlertViolation[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function flattenMetrics(metrics: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(metrics)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, unknown>);
      lines.push(`${key}:`);
      for (const [childKey, childValue] of entries) lines.push(`  ${childKey}: ${String(childValue)}`);
    } else {
      lines.push(`${key}: ${String(value ?? 'null')}`);
    }
  }
  return lines;
}

export function parseAlertRecipients(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/[\s,;]+/).map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

export function formatOperationalAlert(input: AlertMessageInput) {
  const label = input.checkName === 'ai_daily'
    ? 'AI daily'
    : input.checkName === 'quote_15m'
      ? 'Quote 15m'
      : 'Auth email daily';
  const violationLines = input.violations.map((item) => (
    `${item.code}: value=${item.value}, threshold=${item.threshold}`
  ));
  const text = [
    `osbornALPHA ${label} alert`,
    `window: ${input.window.from} -> ${input.window.to}`,
    '',
    'violations:',
    ...violationLines.map((line) => `- ${line}`),
    '',
    'metrics:',
    ...flattenMetrics(input.metrics),
  ].join('\n');
  return {
    subject: `[osbornALPHA][ALERT] ${label}`,
    text,
    html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
  };
}

export async function dispatchOperationalAlert(input: AlertMessageInput) {
  const message = formatOperationalAlert(input);
  const recipients = parseAlertRecipients(process.env.ALERT_EMAIL_TO || process.env.EMAIL_TO);
  const channels: Record<string, Record<string, unknown>> = {};

  if (process.env.RESEND_API_KEY && recipients.length > 0) {
    try {
      const result = await sendEmail({
        to: recipients,
        from: process.env.ALERT_EMAIL_FROM || process.env.EMAIL_FROM,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      channels.email = result.ok
        ? { ok: true, status: result.status ?? 200 }
        : { ok: false, status: result.status ?? null, error_code: 'email_delivery_failed' };
    } catch {
      channels.email = { ok: false, error_code: 'email_delivery_threw' };
    }
  } else {
    channels.email = { ok: false, skipped: 'not_configured' };
  }

  if (isTelegramConfigured()) {
    try {
      const result = await sendTelegram(message.text, { parseMode: 'none', autoSplit: true });
      channels.telegram = result.ok
        ? { ok: true, chunks_sent: result.chunks_sent }
        : { ok: false, error_code: 'telegram_delivery_failed', chunks_sent: result.chunks_sent };
    } catch {
      channels.telegram = { ok: false, error_code: 'telegram_delivery_threw' };
    }
  } else {
    channels.telegram = { ok: false, skipped: 'not_configured' };
  }

  return channels;
}
