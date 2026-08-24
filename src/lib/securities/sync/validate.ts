import { createHash } from 'node:crypto';
import type { SecuritySnapshot } from '../model';
import { SECURITY_SCOPE_THRESHOLDS } from './thresholds';

export interface SnapshotValidationError {
  code: string;
  message: string;
  count?: number;
}

export interface SnapshotValidation {
  accepted: boolean;
  errors: SnapshotValidationError[];
  checksum: string;
  counts: { fetched: number; securities: number; aliases: number; memberships: number };
}

export interface PreviousSecurityState {
  previousCount?: number;
  previousMemberships?: string[];
  previousIdentityTickers?: string[];
}

function stableSnapshot(snapshot: SecuritySnapshot): string {
  return JSON.stringify({
    source: snapshot.source,
    scope: snapshot.scope,
    asOf: snapshot.asOf,
    securities: [...snapshot.securities].sort((a, b) => a.ticker.localeCompare(b.ticker)),
    aliases: [...snapshot.aliases].sort((a, b) => (
      a.alias.localeCompare(b.alias)
      || a.ticker.localeCompare(b.ticker)
      || a.alias_type.localeCompare(b.alias_type)
    )),
    memberships: [...snapshot.memberships].sort((a, b) => (
      a.universe.localeCompare(b.universe) || a.ticker.localeCompare(b.ticker)
    )),
  });
}

function removedRatio(previous: string[], current: Set<string>): { removed: number; ratio: number } {
  const uniquePrevious = new Set(previous);
  const removed = [...uniquePrevious].filter((ticker) => !current.has(ticker)).length;
  return { removed, ratio: uniquePrevious.size ? removed / uniquePrevious.size : 0 };
}

export function validateSecuritySnapshot(
  snapshot: SecuritySnapshot,
  previous: PreviousSecurityState = {},
): SnapshotValidation {
  const errors: SnapshotValidationError[] = [];
  const thresholds = SECURITY_SCOPE_THRESHOLDS[snapshot.scope];
  const activeMemberships = snapshot.memberships.filter((row) => row.is_active && row.universe === snapshot.scope);
  const currentMemberships = new Set(activeMemberships.map((row) => row.ticker));
  const currentIdentities = new Set(snapshot.securities.filter((row) => row.is_active).map((row) => row.ticker));

  if (activeMemberships.length < thresholds.minimum) {
    errors.push({ code: 'below_minimum', message: 'Snapshot is below the approved minimum.', count: activeMemberships.length });
  }
  if (thresholds.maximum !== undefined && activeMemberships.length > thresholds.maximum) {
    errors.push({ code: snapshot.scope === 'nasdaq_top500' ? 'top500_count' : 'above_maximum', message: 'Snapshot exceeds the approved maximum.', count: activeMemberships.length });
  }
  if (snapshot.scope === 'nasdaq_top500' && activeMemberships.length !== 500) {
    errors.push({ code: 'top500_count', message: 'NASDAQ Top 500 must contain exactly 500 active members.', count: activeMemberships.length });
  }
  if (previous.previousCount && activeMemberships.length < previous.previousCount * thresholds.relativeMinimum) {
    errors.push({ code: 'relative_count_drop', message: 'Snapshot count dropped beyond the approved relative threshold.', count: activeMemberships.length });
  }

  if (previous.previousMemberships?.length) {
    const churn = removedRatio(previous.previousMemberships, currentMemberships);
    if (churn.ratio > thresholds.maximumMembershipChurn) {
      errors.push({ code: 'membership_churn', message: 'Membership turnover exceeds the approved threshold.', count: churn.removed });
    }
  }
  if (previous.previousIdentityTickers?.length) {
    const deactivation = removedRatio(previous.previousIdentityTickers, currentIdentities);
    if (deactivation.ratio > thresholds.maximumIdentityDeactivation) {
      errors.push({ code: 'identity_deactivation', message: 'Identity deactivation exceeds the approved threshold.', count: deactivation.removed });
    }
  }

  const seenTickers = new Set<string>();
  for (const security of snapshot.securities) {
    if (seenTickers.has(security.ticker)) {
      errors.push({ code: 'duplicate_ticker', message: 'Snapshot contains duplicate canonical tickers.' });
      break;
    }
    seenTickers.add(security.ticker);
    if (!security.ticker || !security.symbol || !security.name || !security.exchange
      || !security.asset_type || !security.instrument_form || !security.currency
      || !security.list_status || !security.source || !security.source_updated_at) {
      errors.push({ code: 'missing_required_field', message: 'A security identity is missing required fields.' });
      break;
    }
  }

  if (snapshot.memberships.some((row) => row.universe !== snapshot.scope || !seenTickers.has(row.ticker))) {
    errors.push({ code: 'invalid_membership', message: 'Membership references the wrong scope or a missing security.' });
  }

  const primaryAliases = new Map<string, string>();
  for (const alias of snapshot.aliases) {
    if (!seenTickers.has(alias.ticker)) {
      errors.push({ code: 'invalid_alias', message: 'Alias references a missing security.' });
      break;
    }
    if (alias.alias_type !== 'symbol' && alias.alias_type !== 'vendor') continue;
    const key = `${alias.source}\u0000${alias.alias_type}\u0000${alias.alias.toLocaleLowerCase()}`;
    const ticker = primaryAliases.get(key);
    if (ticker && ticker !== alias.ticker) {
      errors.push({ code: 'conflicting_primary_alias', message: 'A primary source alias maps to multiple securities.' });
      break;
    }
    primaryAliases.set(key, alias.ticker);
  }

  const checksum = createHash('sha256').update(stableSnapshot(snapshot)).digest('hex');
  return {
    accepted: errors.length === 0,
    errors,
    checksum,
    counts: {
      fetched: snapshot.securities.length,
      securities: snapshot.securities.length,
      aliases: snapshot.aliases.length,
      memberships: snapshot.memberships.length,
    },
  };
}
