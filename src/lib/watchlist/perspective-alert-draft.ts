import type { WatchlistAlertOrigin, WatchlistAlertWithOrigin } from '@/lib/supabase/database.types';
import type { WatchlistServerClient } from './server-repository';

export interface PerspectiveAlertDraftCommand {
  itemId: string;
  perspectiveId: string;
  claimId: string;
  cooldownMinutes: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLAIM_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export function parsePerspectiveAlertDraft(value: unknown): PerspectiveAlertDraftCommand | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const cooldownMinutes = input.cooldownMinutes ?? 1440;
  if (typeof input.itemId !== 'string' || !UUID.test(input.itemId)
    || typeof input.perspectiveId !== 'string' || !UUID.test(input.perspectiveId)
    || typeof input.claimId !== 'string' || !CLAIM_ID.test(input.claimId)
    || !Number.isSafeInteger(cooldownMinutes) || Number(cooldownMinutes) < 1 || Number(cooldownMinutes) > 10080) {
    return null;
  }
  return {
    itemId: input.itemId,
    perspectiveId: input.perspectiveId,
    claimId: input.claimId,
    cooldownMinutes: Number(cooldownMinutes),
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function createPerspectiveAlertDraft(
  client: WatchlistServerClient,
  command: PerspectiveAlertDraftCommand,
): Promise<{ alert: WatchlistAlertWithOrigin | null; error: { code?: string; message: string } | null }> {
  const repository = client as unknown as {
    rpc(name: 'create_watchlist_alert_draft_from_claim', args: {
      p_item_id: string;
      p_perspective_id: string;
      p_claim_id: string;
      p_cooldown_minutes: number;
    }): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
  };
  const { data, error } = await repository.rpc('create_watchlist_alert_draft_from_claim', {
    p_item_id: command.itemId,
    p_perspective_id: command.perspectiveId,
    p_claim_id: command.claimId,
    p_cooldown_minutes: command.cooldownMinutes,
  });
  if (error) return { alert: null, error };
  const payload = record(data);
  const alert = record(payload?.alert);
  const origin = record(payload?.origin);
  if (!alert || typeof alert.id !== 'string' || alert.enabled !== false
    || !origin || origin.alert_id !== alert.id) {
    return { alert: null, error: { message: 'invalid_claim_alert_draft_response' } };
  }
  return {
    alert: {
      ...alert,
      origin: origin as unknown as WatchlistAlertOrigin,
    } as unknown as WatchlistAlertWithOrigin,
    error: null,
  };
}
