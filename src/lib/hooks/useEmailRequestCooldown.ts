'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  EMAIL_REQUEST_COOLDOWN_MS,
  emailCooldownStorageKey,
  remainingEmailCooldownSeconds,
  type AuthEmailAction,
} from '@/lib/auth/email-cooldown';

export function useEmailRequestCooldown(action: AuthEmailAction) {
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const storageKey = emailCooldownStorageKey(action);

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(storageKey) ?? 0);
      if (Number.isFinite(stored) && stored > Date.now()) setCooldownUntil(stored);
    } catch {
      // Browser privacy settings can disable storage; the server still rate-limits.
    }
  }, [storageKey]);

  useEffect(() => {
    if (!cooldownUntil) {
      setRemainingSeconds(0);
      return;
    }
    const update = () => {
      const remaining = remainingEmailCooldownSeconds(cooldownUntil);
      setRemainingSeconds(remaining);
      if (remaining === 0) {
        setCooldownUntil(0);
        try { window.localStorage.removeItem(storageKey); } catch { /* storage unavailable */ }
      }
    };
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil, storageKey]);

  const startCooldown = useCallback(() => {
    const until = Date.now() + EMAIL_REQUEST_COOLDOWN_MS;
    setCooldownUntil(until);
    setRemainingSeconds(remainingEmailCooldownSeconds(until));
    try { window.localStorage.setItem(storageKey, String(until)); } catch { /* storage unavailable */ }
  }, [storageKey]);

  return {
    active: remainingSeconds > 0,
    remainingSeconds,
    startCooldown,
  };
}
