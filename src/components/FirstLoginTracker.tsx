'use client';

import { useEffect } from 'react';
import { trackEvent } from '@/lib/analytics/client';

const SESSION_KEY = 'osbornalpha:first-login-milestone-sent';

export function FirstLoginTracker() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SESSION_KEY)) return;
      window.sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      // The database uniqueness constraint remains the source of truth.
    }
    trackEvent('first_login_succeeded', { source: 'authenticated_shell' });
  }, []);
  return null;
}
