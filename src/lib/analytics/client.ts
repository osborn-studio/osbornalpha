'use client';

const SESSION_KEY = 'osbornalpha:session-id';

function sessionId(): string {
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

export function trackEvent(event_name: string, metadata: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  const payload = {
    event_name,
    path: window.location.pathname,
    session_id: sessionId(),
    metadata,
  };

  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/events', blob)) return;
    }
  } catch {
    // fall back to fetch
  }

  fetch('/api/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}
