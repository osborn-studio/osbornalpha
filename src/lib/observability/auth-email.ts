import { createHmac } from 'node:crypto';
import type { AlertViolation } from './evaluators';

export type AuthEmailCategory = 'signup' | 'recovery';
export type EmailDeliveryState = 'pending' | 'delayed' | 'delivered' | 'failed';

export interface ProbeTarget {
  email: string;
  domain: string;
}

export interface ProbeResultSample {
  domain: string;
  signup_delivery: EmailDeliveryState;
  recovery_delivery: EmailDeliveryState;
}

export function beijingDate(now: Date): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function parseProbeTargets(raw: string | undefined): ProbeTarget[] {
  if (!raw) return [];
  const targets = new Map<string, ProbeTarget>();
  for (const value of raw.split(/[\s,;]+/)) {
    const email = value.trim().toLowerCase();
    const match = /^[^\s@]+@([a-z0-9.-]+\.[a-z]{2,})$/i.exec(email);
    if (!match) continue;
    targets.set(email, { email, domain: match[1].toLowerCase() });
    if (targets.size >= 5) break;
  }
  return [...targets.values()];
}

export function hashProbeRecipient(email: string, secret: string): string {
  return createHmac('sha256', secret).update(email.trim().toLowerCase()).digest('hex');
}

export function classifyAuthEmailSubject(subject: string): AuthEmailCategory | null {
  if (/(confirm|verify).*(signup|email)|signup.*(confirm|verify)|确认.*(注册|邮箱)|验证.*邮箱/i.test(subject)) {
    return 'signup';
  }
  if (/(reset|recover).*(password|account)|password.*(reset|recover)|重置.*密码|找回.*密码/i.test(subject)) {
    return 'recovery';
  }
  return null;
}

export function emailDeliveryStatus(eventType: string): EmailDeliveryState | null {
  if (eventType === 'email.delivered') return 'delivered';
  if (eventType === 'email.delivery_delayed') return 'delayed';
  if (['email.bounced', 'email.failed', 'email.complained', 'email.suppressed'].includes(eventType)) return 'failed';
  if (['email.sent', 'email.queued', 'email.scheduled'].includes(eventType)) return 'pending';
  return null;
}

export function mergeDeliveryState(
  current: { status: EmailDeliveryState; at: string | null },
  incoming: { status: EmailDeliveryState; at: string },
) {
  if (current.at && new Date(incoming.at).getTime() < new Date(current.at).getTime()) return current;
  return incoming;
}

export function evaluateAuthEmailProbes(
  rows: ProbeResultSample[],
  expectedTargets: number,
  bootstrap = false,
) {
  const signupDelivered = rows.filter((row) => row.signup_delivery === 'delivered').length;
  const recoveryDelivered = rows.filter((row) => row.recovery_delivery === 'delivered').length;
  if (bootstrap && rows.length === 0) {
    return {
      metrics: {
        expected_targets: expectedTargets,
        observed_targets: 0,
        signup_delivered: 0,
        recovery_delivered: 0,
        failed_or_missing: 0,
        bootstrap: true,
      },
      violations: [],
    };
  }
  const signupMissing = Math.max(0, expectedTargets - signupDelivered);
  const recoveryMissing = Math.max(0, expectedTargets - recoveryDelivered);
  const violations: AlertViolation[] = [];
  if (rows.length < expectedTargets) {
    violations.push({ code: 'auth_probe_targets_missing', value: rows.length, threshold: expectedTargets });
  }
  if (signupMissing > 0) {
    violations.push({ code: 'auth_signup_probe_failed', value: signupMissing, threshold: 0 });
  }
  if (recoveryMissing > 0) {
    violations.push({ code: 'auth_recovery_probe_failed', value: recoveryMissing, threshold: 0 });
  }
  return {
    metrics: {
      expected_targets: expectedTargets,
      observed_targets: rows.length,
      signup_delivered: signupDelivered,
      recovery_delivered: recoveryDelivered,
      failed_or_missing: signupMissing + recoveryMissing,
    },
    violations,
  };
}
