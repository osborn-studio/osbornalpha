import overridesJson from '../../../../data/securities/us-china-overrides.json';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { SecuritySnapshot, SecurityUniverse } from '../model';
import { fetchAShareSnapshot } from '../sources/tushare-a';
import { fetchConvertibleBondSnapshot } from '../sources/tushare-cb';
import { fetchExchangeFundSnapshot } from '../sources/tushare-funds';
import { fetchHongKongMainBoardSnapshot } from '../sources/tushare-hk';
import { fetchSp500Snapshot } from '../sources/sp500';
import {
  buildUsUniverseSnapshot,
  fetchUsUniverseCandidates,
  selectNasdaqTop500,
  selectUsChina,
  type UsChinaOverrides,
  type UsUniverseCandidate,
} from '../sources/us-universes';
import { validateSecuritySnapshot, type PreviousSecurityState, type SnapshotValidation } from './validate';
import { writeSecuritySnapshot, type SecurityWriteResult } from './writer';

export const ALL_SECURITY_SCOPES: SecurityUniverse[] = [
  'a_stock',
  'a_exchange_fund',
  'a_cb',
  'hk_main',
  'sp500',
  'nasdaq_top500',
  'us_china',
];

export interface SyncSecurityOptions {
  scopes: SecurityUniverse[];
  dryRun: boolean;
  asOf: string;
}

export interface SyncSecurityResult {
  scope: SecurityUniverse;
  status: 'success' | 'rejected' | 'failed';
  dry_run: boolean;
  validation?: SnapshotValidation;
  write?: SecurityWriteResult;
  error_code?: string;
  error_message?: string;
}

export interface SyncSecurityDependencies {
  loadSnapshot?: (scope: SecurityUniverse, asOf: string) => Promise<SecuritySnapshot>;
  loadPrevious?: (scope: SecurityUniverse) => Promise<PreviousSecurityState>;
  writeSnapshot?: (snapshot: SecuritySnapshot, validation: SnapshotValidation) => Promise<SecurityWriteResult>;
}

function createDefaultSnapshotLoader() {
  let usCandidates: Promise<UsUniverseCandidate[]> | undefined;
  return async (scope: SecurityUniverse, asOf: string): Promise<SecuritySnapshot> => {
    if (scope === 'a_stock') return fetchAShareSnapshot({ asOf });
    if (scope === 'a_exchange_fund') return fetchExchangeFundSnapshot({ asOf });
    if (scope === 'a_cb') return fetchConvertibleBondSnapshot({ asOf });
    if (scope === 'hk_main') return fetchHongKongMainBoardSnapshot({ asOf });
    if (scope === 'sp500') return fetchSp500Snapshot({});

    usCandidates ??= fetchUsUniverseCandidates(asOf);
    const candidates = await usCandidates;
    if (scope === 'nasdaq_top500') {
      return buildUsUniverseSnapshot(scope, candidates, selectNasdaqTop500(candidates, asOf), asOf);
    }
    const overrides = overridesJson as UsChinaOverrides;
    return buildUsUniverseSnapshot(scope, candidates, selectUsChina(candidates, overrides, asOf), asOf);
  };
}

async function loadPreviousState(scope: SecurityUniverse): Promise<PreviousSecurityState> {
  const client = getAdminSupabase() as any;
  const { data, error } = await client
    .from('security_universe_memberships')
    .select('ticker')
    .eq('universe', scope)
    .eq('is_active', true);
  if (error) throw Object.assign(new Error('Previous security state unavailable.'), { code: 'previous_state_failed' });
  const tickers = (data ?? []).map((row: { ticker: string }) => row.ticker);
  return { previousCount: tickers.length, previousMemberships: tickers, previousIdentityTickers: tickers };
}

function sourceErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    && /^[a-z0-9_]+$/i.test(error.code)) return error.code;
  return 'source_failed';
}

export async function syncSecurityScopes(
  options: SyncSecurityOptions,
  dependencies: SyncSecurityDependencies = {},
): Promise<SyncSecurityResult[]> {
  const loadSnapshot = dependencies.loadSnapshot ?? createDefaultSnapshotLoader();
  const loadPrevious = dependencies.loadPrevious ?? loadPreviousState;
  const writeSnapshot = dependencies.writeSnapshot ?? writeSecuritySnapshot;
  const results: SyncSecurityResult[] = [];

  for (const scope of options.scopes) {
    try {
      const [snapshot, previous] = await Promise.all([
        loadSnapshot(scope, options.asOf),
        loadPrevious(scope),
      ]);
      const validation = validateSecuritySnapshot(snapshot, previous);
      if (!validation.accepted) {
        if (!options.dryRun) await writeSnapshot(snapshot, validation);
        results.push({ scope, status: 'rejected', dry_run: options.dryRun, validation });
        continue;
      }
      if (options.dryRun) {
        results.push({ scope, status: 'success', dry_run: true, validation });
        continue;
      }
      const write = await writeSnapshot(snapshot, validation);
      results.push({
        scope,
        status: write.status,
        dry_run: false,
        validation,
        write,
        error_code: write.error_code,
      });
    } catch (error) {
      results.push({
        scope,
        status: 'failed',
        dry_run: options.dryRun,
        error_code: sourceErrorCode(error),
        error_message: 'Security source could not be synchronized.',
      });
    }
  }
  return results;
}
