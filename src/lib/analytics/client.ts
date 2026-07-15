'use client';

import { sanitizeEventMetadata } from './sanitize';
import { createAnalyticsId } from './id';

const SESSION_KEY = 'osbornalpha:session-id';
const ANONYMOUS_KEY = 'osbornalpha:anonymous-id';

let memorySessionId: string | null = null;
let memoryAnonymousId: string | null = null;

function newId(): string {
  return createAnalyticsId();
}

function sessionId(): string {
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = newId();
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    memorySessionId ||= newId();
    return memorySessionId;
  }
}

function anonymousId(): string {
  try {
    let id = window.localStorage.getItem(ANONYMOUS_KEY);
    if (!id) {
      id = newId();
      window.localStorage.setItem(ANONYMOUS_KEY, id);
    }
    return id;
  } catch {
    memoryAnonymousId ||= newId();
    return memoryAnonymousId;
  }
}

export function trackEvent(event_name: string, metadata: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  const payload = {
    event_name,
    path: window.location.pathname,
    session_id: sessionId(),
    anonymous_id: anonymousId(),
    metadata: sanitizeEventMetadata(metadata),
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
