import type { PerspectiveCitation } from '@/lib/external-evidence/types';
import type { WatchlistAlert } from '@/lib/supabase/database.types';

export const PERSPECTIVE_CLAIM_KINDS = ['thesis', 'catalyst', 'risk', 'counterpoint'] as const;
export type PerspectiveClaimKind = typeof PERSPECTIVE_CLAIM_KINDS[number];

export interface PerspectiveClaimInvalidation {
  /** Human-readable condition proposed by the model. It never enables an alert by itself. */
  condition: string;
  alertType: WatchlistAlert['alert_type'];
  operator: WatchlistAlert['operator'];
  threshold: number | null;
  config: Record<string, unknown>;
}

export interface PerspectiveClaim {
  /** Stable within one persisted Perspective. Legacy rows may omit it. */
  id?: string;
  kind: PerspectiveClaimKind;
  text: string;
  dataCites: string[];
  citations: PerspectiveCitation[];
  invalidation?: PerspectiveClaimInvalidation;
}
