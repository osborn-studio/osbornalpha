'use client';

const ANON_KEY = 'osbornalpha:anonymous-id:v1';
const SESSION_KEY = 'osbornalpha:session-id:v1';

type EventProperties = Record<string, string | number | boolean | null | undefined>;

function makeId(prefix: string) {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function getStoredId(key: string, prefix: string, storage: Storage) {
  let value = storage.getItem(key);
  if (!value) {
    value = makeId(prefix);
    storage.setItem(key, value);
  }
  return value;
}

export function trackEvent(eventName: string, properties: EventProperties = {}) {
  if (typeof window === 'undefined') return;

  try {
    const payload = {
      event_name: eventName,
      anonymous_id: getStoredId(ANON_KEY, 'anon', window.localStorage),
      session_id: getStoredId(SESSION_KEY, 'sess', window.sessionStorage),
      path: `${window.location.pathname}${window.location.search}`,
      referrer: document.referrer || null,
      properties,
    };

    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
      return;
    }

    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch {
    // Telemetry must never break product flows.
  }
}
