import { sendEmail, type SendEmailResult } from '@/lib/data/sources/resend';

type Environment = Record<string, string | undefined>;

export interface WatchlistDeliveryCanaryResult {
  ok: boolean;
  status: string;
  attempts: number;
}

interface DeliveryCanaryDependencies {
  send?: (options: Parameters<typeof sendEmail>[0]) => Promise<SendEmailResult>;
  loadStatus?: (messageId: string, apiKey: string) => Promise<string>;
  wait?: (milliseconds: number) => Promise<void>;
}

const FAILED_EVENTS = new Set(['bounced', 'complained', 'failed', 'canceled']);

function required(environment: Environment, name: string, code: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`watchlist_delivery_canary_${code}_missing`);
  return value;
}

function safeReleaseId(value: string | undefined): string {
  const normalized = value?.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return normalized || new Date().toISOString().slice(0, 10);
}

async function loadResendStatus(messageId: string, apiKey: string): Promise<string> {
  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(messageId)}`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`watchlist_delivery_canary_status_${response.status}`);
  const body = await response.json().catch(() => null) as { last_event?: unknown } | null;
  if (typeof body?.last_event !== 'string' || !body.last_event) {
    throw new Error('watchlist_delivery_canary_status_invalid');
  }
  return body.last_event.toLowerCase();
}

function retryableStatusError(error: unknown): boolean {
  if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) return true;
  if (!(error instanceof Error)) return false;
  const status = error.message.match(/^watchlist_delivery_canary_status_(\d{3})$/)?.[1];
  if (status) {
    const value = Number(status);
    return value === 429 || value >= 500;
  }
  return /fetch|network|socket|timeout|econn|enotfound|dns/i.test(error.message);
}

export async function runWatchlistDeliveryCanary(
  environment: Environment = process.env,
  dependencies: DeliveryCanaryDependencies = {},
): Promise<WatchlistDeliveryCanaryResult> {
  const apiKey = required(environment, 'RESEND_API_KEY', 'api_key');
  const recipient = required(environment, 'WATCHLIST_DELIVERY_CANARY_EMAIL', 'recipient');
  const from = required(environment, 'WATCHLIST_DELIVERY_CANARY_FROM', 'sender');
  const releaseId = safeReleaseId(environment.WATCHLIST_RELEASE_ID);
  const send = dependencies.send ?? sendEmail;
  const loadStatus = dependencies.loadStatus ?? loadResendStatus;
  const wait = dependencies.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const sent = await send({
    to: recipient,
    from,
    subject: '[osbornALPHA][Canary] Watchlist notification delivery',
    text: `Watchlist delivery canary for release ${releaseId}.`,
    html: `<p>Watchlist delivery canary for release <code>${releaseId}</code>.</p>`,
    idempotencyKey: `watchlist-delivery-canary-${releaseId}`,
  });
  if (!sent.ok || !sent.id) {
    throw new Error(`watchlist_delivery_canary_send_failed:${sent.status ?? 'unknown'}`);
  }

  for (let attempt = 1; attempt <= 12; attempt += 1) {
    let status: string;
    try {
      status = await loadStatus(sent.id, apiKey);
    } catch (error) {
      if (!retryableStatusError(error) || attempt === 12) throw error;
      await wait(5_000);
      continue;
    }
    if (status === 'delivered') return { ok: true, status, attempts: attempt };
    if (FAILED_EVENTS.has(status)) throw new Error(`watchlist_delivery_canary_${status}`);
    if (attempt < 12) await wait(5_000);
  }
  throw new Error('watchlist_delivery_canary_timeout');
}
