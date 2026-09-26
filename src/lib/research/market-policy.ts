import policy from '../../../docs/handoffs/alpha-s4/market-policy.json';
import policyV2 from '../../../docs/handoffs/alpha-s6/market-policy-v2.json';
import calendar from '../../../docs/handoffs/alpha-s4/calendar.json';
import { digest } from './ingest/pa-v1/json.js';

function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const MARKET_POLICY = freeze(policy);
export const MARKET_POLICY_HASH = digest(policy);
/** market-policy/2.0 (E3a/E3b): listing MIC identity, SPY/ARCX benchmark, same XNYS session calendar and rules. */
export const MARKET_POLICY_V2 = freeze(policyV2);
export const MARKET_POLICY_V2_HASH = digest(policyV2);
export const CALENDAR_HASH = digest(calendar);
export type MarketPolicyVersion = 'market-policy/1.0' | 'market-policy/2.0';
export const OBSERVATION_CONTRACT_V2 = 'alpha-observation-contract/2.0';
if (policyV2.schema_version !== 'market-policy/2.0' || policyV2.calendar_version !== calendar.version || policyV2.calendar_mic !== 'XNYS' ||
    policyV2.benchmark.ticker !== 'SPY' || policyV2.benchmark.listing_mic !== 'ARCX' || !policyV2.target_listing_mics.includes('XNYS') ||
    digest(policyV2.windows_trading_sessions) !== digest(policy.windows_trading_sessions) || policyV2.max_wait_trading_sessions !== policy.max_wait_trading_sessions ||
    policyV2.start_rule !== policy.start_rule || policyV2.return_method !== policy.return_method) throw new Error('invalid_market_policy_v2');

export class MarketPolicyError extends Error {
  readonly code: 'invalid_schema' | 'data_insufficient';
  constructor(readonly reason: string) {
    super(reason);
    this.code = reason === 'invalid_timestamp' ? 'invalid_schema' : 'data_insufficient';
  }
}

export function timestamp(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value)) ||
      new Date(match[1]).toISOString().slice(0, 10) !== match[1] ||
      Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59 ||
      Number(match[5] ?? 0) > 23 || Number(match[6] ?? 0) > 59) {
    throw new MarketPolicyError('invalid_timestamp');
  }
  return Date.parse(value);
}

const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
if(calendar.version!==policy.calendar_version || calendar.range.length!==2 || !calendar.range.every(validDate) ||
 calendar.range[0]>=calendar.range[1] || !calendar.sessions.length ||
 calendar.sessions.some(s=>!validDate(s.date)||s.date<calendar.range[0]||s.date>calendar.range[1]||typeof s.full!=='boolean'||!s.open.startsWith(s.date)||!s.close.startsWith(s.date))) throw new Error('invalid_frozen_calendar');
const localTime = (value: string) => new Intl.DateTimeFormat('en-GB', {
  timeZone: policy.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(value));
for (let i = 0; i < calendar.sessions.length; i++) {
  const s = calendar.sessions[i];
  if (timestamp(s.open) >= timestamp(s.close) || (i > 0 && timestamp(calendar.sessions[i - 1].close) >= timestamp(s.open)) ||
      localTime(s.open) !== policy.regular_open ||
      localTime(s.close) !== (s.full ? policy.regular_close : '13:00')) throw new Error('invalid_frozen_calendar');
}
freeze(calendar);

/** Pure rule planning: no prices, networking or assumed valid market closes. */
export function planObservationSessions(frozenAt: string, eligibilityAt: string, version: MarketPolicyVersion = 'market-policy/1.0') {
  const cutoff = Math.max(timestamp(frozenAt), timestamp(eligibilityAt));
  if (cutoff < Date.parse(calendar.range[0]) || cutoff >= Date.parse(calendar.range[1]) + 86400000) {
    throw new MarketPolicyError('rule_unsupported');
  }
  const eligible = calendar.sessions.filter(s => Date.parse(s.open) > cutoff);
  const first = eligible.findIndex(s => s.full);
  if (first < 0) throw new MarketPolicyError('rule_unsupported');
  const candidates = eligible.slice(first, first + policy.max_wait_trading_sessions);
  if (candidates.length !== policy.max_wait_trading_sessions) throw new MarketPolicyError('rule_unsupported');
  const full = candidates.filter(s => s.full);
  // Registration must support all frozen windows, even if a valid start occurs last.
  observationWindowEnds(full.at(-1)!.close);
  return { intendedStart: full[0], fallbackCandidates: full.slice(1), waitExpiresAt: candidates.at(-1)!.close,
    marketPolicyHash: version === 'market-policy/2.0' ? MARKET_POLICY_V2_HASH : MARKET_POLICY_HASH, calendarHash: CALENDAR_HASH };
}

export function observationWindowEnds(actualStartAt: string) {
  const instant = timestamp(actualStartAt);
  const start = calendar.sessions.findIndex(s => Date.parse(s.close) === instant && s.full);
  if (start < 0) throw new MarketPolicyError('rule_unsupported');
  return policy.windows_trading_sessions.map(n => {
    const end = calendar.sessions[start + n];
    if (!end) throw new MarketPolicyError('rule_unsupported');
    return { tradingSessions: n, endsAt: end.close };
  });
}
