import {describe, it, expect} from 'vitest';
import type {MembershipRow, MarkRow} from './types';
import type {IssuerSecurityInput} from '../entities/types';
type Window = Pick<IssuerSecurityInput, 'issuer_id' | 'ticker' | 'share_class' | 'is_primary' | 'valid_from' | 'valid_to'>;
import {prepareValuationMembers, diagnoseAlignedValuationSeries} from './valuation-preparation';

const date = '2026-10-30';
const member = (id: string, patch = {}): MembershipRow => ({membership_id: id, issuer_id: id, scheme: 'sw2021', version: '2021', code: '801780', level: 1, valid_from: '2021-01-01', valid_to: null, available_date: '2021-01-01', valid_to_available_date: null, source: 'test', source_membership_id: null, batch_id: 'b', status: 'ok', superseded_by: null, provenance: {availability: 'effective_date_assumed'}, ...patch});
const security = (id: string, patch: Partial<Window> = {}): Window => ({issuer_id: id, ticker: id + '.SH', share_class: 'A', is_primary: true, valid_from: '2021-01-01', valid_to: null, ...patch});
const mark = (id: string, patch = {}): MarkRow => ({observation_id: id, ticker: id + '.SH', trade_date: date, fetch_event_id: 'e', observed_at: '2026-11-01T00:00:00Z', close: '10', total_share: '100', free_share: null, market_cap: '1000', source: 'test', upstream: 'sse', raw_hash: 'a'.repeat(64), locator: {}, batch_id: 'b', status: 'ok', supersedes: null, ...patch});

describe('valuation preparation, without formulas or publication', () => {
 it('uses membership known at D and half-open primary A windows, retains current observation metadata even when observed after D', () => {
  const plan = prepareValuationMembers({code: '801780', tradeDate: date, memberships: [member('a'), member('future', {available_date: '2026-10-31'}), member('ended', {valid_to: date, valid_to_available_date: date})], securities: [security('a'), security('a', {ticker: 'a.HK', share_class: 'H'})], marks: [mark('a')]});
  expect(plan.historyClass).toBe('reconstruction');
  expect(plan.members).toHaveLength(1);
  expect(plan.members[0]).toMatchObject({issuer_id: 'a', status: 'ready', mark: {observation_id: 'a', observed_at: '2026-11-01T00:00:00Z'}});
  expect(plan.factsAsOf).toBe(date);
 });
 it('selects a security on its first day, excludes its end day and freezes the selected mark', () => {
  const observed = mark('a');
  const plan = prepareValuationMembers({code: '801780', tradeDate: date, memberships: [member('a')], securities: [security('a', {ticker: 'old.SH', valid_to: date}), security('a', {valid_from: date}), security('a', {ticker: 'future.SH', valid_from: '2026-10-31'})], marks: [observed, mark('a', {ticker: 'old.SH'})]});
  expect(plan.members[0].status).toBe('ready');
  observed.close = '99';
  const ready = plan.members[0];
  if (ready.status !== 'ready') throw new Error('expected_ready');
  expect(ready.mark.close).toBe('10');
 });
 it('keeps members with excluded roles and refuses ambiguous current observations', () => {
  const plan = prepareValuationMembers({code: '801780', tradeDate: date, memberships: [member('a'), member('b'), member('c')], securities: [security('b'), security('b', {ticker: 'b2.SH'}), security('c')], marks: [mark('c', {status: 'quarantined'})]});
  expect(plan.members.map(r => r.status)).toEqual(['ambiguous_primary', 'ambiguous_primary', 'no_mark']);
  expect(() => prepareValuationMembers({code: '801780', tradeDate: date, memberships: [member('a')], securities: [security('a')], marks: [mark('a'), mark('a', {observation_id: 'other'})]})).toThrow('ambiguous_current_mark');
 });
 it('rejects invalid mark arithmetic instead of silently changing observed inputs', () => {
  expect(() => prepareValuationMembers({code: '801780', tradeDate: date, memberships: [member('a')], securities: [security('a')], marks: [mark('a', {market_cap: '999'})]})).toThrow('invalid_current_mark');
 });
 it('diagnoses only one aligned current series; superseded observations never supply a value', () => {
  const q = {runId: 'run', code: '801780', metric: 'pe_ttm' as const, officialMetric: 'pe' as const, expectedDates: [date]};
  const cell = {run_id: 'run', scheme: 'sw2021' as const, version: '2021' as const, code: q.code, metric: q.metric, trade_date: date, status: 'ok' as const, value: '10'};
  const official = {scheme: 'sw2021' as const, version: '2021' as const, code: q.code, metric: 'pe' as const, trade_date: date, value: '10', observation_id: 'o', observed_at: '2026-11-01T00:00:00Z', status: 'ok' as const};
  expect(diagnoseAlignedValuationSeries(q, [cell], [official]).counts.within).toBe(1);
  expect(diagnoseAlignedValuationSeries(q, [cell], [{...official, status: 'superseded'}]).counts.no_official).toBe(1);
  for (const patch of [{code: '801120'}, {metric: 'pb' as const}, {trade_date: '2026-10-29'}, {run_id: 'other'}]) expect(() => diagnoseAlignedValuationSeries(q, [{...cell, ...patch}], [official])).toThrow('computed_key');
  expect(() => diagnoseAlignedValuationSeries(q, [cell], [official, {...official, observation_id: 'other'}])).toThrow('ambiguous_current_official');
  expect(() => diagnoseAlignedValuationSeries(q, [cell], [{...official, code: '801120'}])).toThrow('official_key');
  expect(() => diagnoseAlignedValuationSeries(q, [{...cell, status: 'missing', value: '10'}], [official])).toThrow('computed_value');
 });
});
