import type { PerspectiveCitation } from '@/lib/external-evidence/types';

export const PERSPECTIVE_CLAIM_KINDS = ['thesis', 'catalyst', 'risk', 'counterpoint'] as const;
export type PerspectiveClaimKind = typeof PERSPECTIVE_CLAIM_KINDS[number];

export interface PerspectiveClaim {
  kind: PerspectiveClaimKind;
  text: string;
  dataCites: string[];
  citations: PerspectiveCitation[];
}
