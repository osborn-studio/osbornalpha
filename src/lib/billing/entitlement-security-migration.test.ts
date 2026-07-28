import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('profile entitlement security migration', () => {
  const migration = readFileSync(join(
    process.cwd(),
    'supabase/migrations/20260728150000_profile_entitlement_security.sql',
  ), 'utf8').toLowerCase();
  const quotaSource = readFileSync(join(process.cwd(), 'src/lib/billing/quota.ts'), 'utf8');
  const databaseTypes = readFileSync(
    join(process.cwd(), 'src/lib/supabase/database.types.ts'),
    'utf8',
  );
  const stripeSource = readFileSync(join(process.cwd(), 'src/lib/billing/stripe.ts'), 'utf8');
  const adminAuthSource = readFileSync(join(process.cwd(), 'src/lib/admin/auth.ts'), 'utf8');
  const manualSendSource = readFileSync(
    join(process.cwd(), 'src/app/api/brief/send/route.ts'),
    'utf8',
  );

  it('guards every billing and entitlement field with a before-update trigger', () => {
    expect(migration).toContain('create or replace function public.protect_profile_entitlements()');
    expect(migration).toContain("auth.role() = 'authenticated'");
    for (const field of [
      'role',
      'plan',
      'plan_expires_at',
      'stripe_customer_id',
      'usage',
    ]) {
      expect(migration).toContain(`new.${field} is distinct from old.${field}`);
    }
    expect(migration).toContain('before update on public.profiles');
    expect(migration).toContain('profile entitlement fields are backend-managed');
  });

  it('limits authenticated column grants while preserving display-name updates', () => {
    expect(migration).toContain('revoke update on table public.profiles from authenticated');
    expect(migration).toContain('grant update (display_name) on public.profiles to authenticated');
    expect(migration).toContain('grant update on table public.profiles to service_role');
  });

  it('drops the obsolete aggregate bypass and removes all source wrappers and types', () => {
    expect(migration).toContain('drop function if exists public.record_usage_event(');
    expect(quotaSource).not.toContain('export async function recordUsage(');
    expect(quotaSource).not.toContain('export async function recordUsageForUser(');
    expect(quotaSource).not.toContain("'record_usage_event'");
    expect(databaseTypes).not.toContain('record_usage_event:');
  });

  it('persists Stripe billing identifiers through the trusted backend client', () => {
    expect(stripeSource).toContain("import { getAdminSupabase } from '@/lib/supabase/admin'");
    expect(stripeSource).toMatch(
      /getAdminSupabase\(\)[\s\S]+from\('profiles'\)[\s\S]+stripe_customer_id/,
    );
  });

  it('keeps quota, admin, and manual-send decisions on protected profile state', () => {
    expect(quotaSource).toContain(".select('plan, role, plan_expires_at')");
    expect(adminAuthSource).toContain(".select('role')");
    expect(adminAuthSource).toContain("profile?.role !== 'admin'");
    expect(manualSendSource).toContain("await checkQuota('brief_preview')");
  });
});
