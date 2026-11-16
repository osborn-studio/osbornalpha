/** Synthetic local-only fixtures. No payload is evidence of a live provider read. */
import { CATALOG_VERSION, catalogById, sha256HexSync } from '../../src/lib/macro/catalog';
import type { DrawerTarget } from '../../src/components/macro/SourceDrawer';
import type { ProvenanceJson, SeriesJson, SourceJson, VersionJson, VersionsJson } from '../../src/components/macro/view-model';
import type { Envelope } from '../../src/lib/macro/views';
import type { Bilingual, EvidenceObject, MacroSeriesDef, Retrieval } from '../../src/lib/macro/types';
import type { CycleTableView, ObsRef, PlaybookView, PolicyResponseView, Region, TransmissionResponse } from '../../src/lib/macro/strategy/contract';
import type { ReviewDetailResponse, ReviewIndexResponse } from '../../src/lib/macro/strategy/route-helpers';

export const FIXTURE_ORIGIN = 'http://127.0.0.1:3147';
export const FIXTURE_NOTICE = 'SYNTHETIC LOCAL FIXTURE ONLY';
export const periodEnd = '2026-09-30';
export const asOf = '2026-11-01T00:00:00Z';
export const ids = {
  old: '11111111-1111-4111-8111-111111111111',
  new: '22222222-2222-4222-8222-222222222222',
  inputCurrent: '33333333-3333-4333-8333-333333333333',
  inputPrevious: '44444444-4444-4444-8444-444444444444',
  inputNew: '55555555-5555-4555-8555-555555555555',
  snapshotUS: '66666666-6666-4666-8666-666666666666',
  snapshotCN: '77777777-7777-4777-8777-777777777777',
  manifest: '88888888-8888-4888-8888-888888888888',
  review: '99999999-9999-4999-8999-999999999999',
  historyFrom: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  historyTo: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  baseline: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
} as const;
const bilingual = (text: string): Bilingual => ({ en: text, zh: text });
const bodies = {
  current: `${FIXTURE_NOTICE}\nDATE,CPIAUCSL\n2026-09-30,307.5\n`,
  previous: `${FIXTURE_NOTICE}\nDATE,CPIAUCSL\n2025-09-30,300\n`,
  newer: `${FIXTURE_NOTICE}\nDATE,CPIAUCSL\n2026-09-30,308.25\n`,
};
export const hashes = Object.fromEntries(Object.entries(bodies).map(([key, body]) => [key, sha256HexSync(body)])) as Record<keyof typeof bodies, string>;
export const evidenceBodies: Record<string, string> = Object.fromEntries(Object.entries(bodies).map(([key, body]) => [hashes[key as keyof typeof bodies], body]));
export const source: SourceJson = {
  publisher: bilingual('Synthetic Bureau of Local Fixtures'), via: bilingual('Synthetic fixture archive'),
  fetch_host: '127.0.0.1', adapter: 'fred_csv', rights: 'public_domain', attribution: bilingual(FIXTURE_NOTICE),
};
function rawInput(id: string, value: string, version: number, key: keyof typeof bodies, available: string): ProvenanceJson {
  return {
    observation_id: id, series_id: 'US_CPI_INDEX', version, value_text: value,
    available_at: available, availability_basis: 'first_seen',
    retrieval: {
      retrieval_id: `a${id.slice(1)}`, fetch_url: `${FIXTURE_ORIGIN}/__fixture/source/${key}.csv`, fetch_host: '127.0.0.1',
      http_status: 200, fetched_at: available, tool_versions: { parser: `synthetic-${key}/1`, fetcher: 'local-fixture/1' },
    },
    evidence: { sha256: hashes[key], adapter: 'fred_csv', content_type: 'text/csv', byte_length: new TextEncoder().encode(bodies[key]).length },
    locator: { kind: 'csv_row', line: 3, column: 1 }, transform: null, derived_from: null, code_version: `synthetic-${key}-code/1`,
  };
}
export const rawInputs = {
  current: rawInput(ids.inputCurrent, '307.5', 1, 'current', '2026-10-15T12:00:00Z'),
  previous: rawInput(ids.inputPrevious, '300', 1, 'previous', '2025-10-15T12:00:00Z'),
  newer: rawInput(ids.inputNew, '308.25', 2, 'newer', '2026-10-20T12:00:00Z'),
};
export const derivedInputs = [rawInputs.current, rawInputs.previous];
function derived(id: string, value: string, version: number, inputs: ProvenanceJson[]): VersionJson {
  return {
    observation_id: id, series_id: 'US_CPI_YOY', version, value_text: value,
    available_at: inputs.map(i => i.available_at).sort().at(-1)!, availability_basis: 'first_seen',
    retrieval: null, evidence: null, locator: null, transform: 'yoy_from_index@1',
    derived_from: inputs.map(i => i.observation_id), code_version: `synthetic-derived-code/${version}`, inputs,
  };
}
export const versions: VersionsJson = {
  series_id: 'US_CPI_YOY', read_series_id: 'US_CPI_YOY', period_end: periodEnd,
  versions: [derived(ids.new, '2.75', 2, [rawInputs.newer, rawInputs.previous]), derived(ids.old, '2.5', 1, derivedInputs)],
};
export const drawerTarget: DrawerTarget = {
  seriesId: 'US_CPI_YOY', observationId: ids.old, name: 'Synthetic CPI, year over year',
  periodEnd, display: '2.5%', unit: 'pct', source,
};
export const rawVersions: VersionsJson = {
  series_id: 'US_CPI_INDEX', read_series_id: 'US_CPI_INDEX', period_end: periodEnd,
  versions: [{ ...rawInputs.newer, inputs: [] }, { ...rawInputs.current, inputs: [] }],
};
export const rawDrawerTarget: DrawerTarget = {
  seriesId: 'US_CPI_INDEX', observationId: ids.inputCurrent, name: 'Synthetic CPI index', periodEnd,
  display: '307.5', unit: 'index_1982_84_100', source,
};
function definition(id: string): MacroSeriesDef {
  const def = catalogById(id);
  if (!def) throw new Error(`Unknown fixture catalog id: ${id}`);
  return { ...def, source: { publisher: source.publisher, via: source.via!, fetchHost: source.fetch_host,
    adapter: source.adapter, rights: source.rights, attribution: source.attribution, seriesKey: 'SYNTHETIC' } };
}
function observation(p: ProvenanceJson, end: string) {
  return { observation_id: p.observation_id, period_end: end, value_text: p.value_text, version: p.version,
    available_at: p.available_at, availability_basis: p.availability_basis, retrieval_id: p.retrieval?.retrieval_id ?? null,
    evidence_sha256: p.evidence?.sha256 ?? null, locator: p.locator, transform: p.transform, code_version: p.code_version, derived_from: p.derived_from };
}
export type DetailFixture = SeriesJson & { catalogVersion: string; provenance: Record<string, unknown> };
export const detail: DetailFixture = {
  def: definition('US_CPI_YOY'), catalogVersion: CATALOG_VERSION, seriesRead: 'US_CPI_YOY', transform: 'raw',
  observations: [
    { ...observation(versions.versions[1], '2026-08-31'), observation_id: '11111111-aaaa-4111-8111-111111111111', value_text: '2.4' },
    observation(versions.versions[1], periodEnd),
  ],
  provenance: { publisher: source.publisher, via: source.via, fetch_host: source.fetch_host, adapter: source.adapter,
    rights: source.rights, attribution: source.attribution, series_key: 'SYNTHETIC', transform: 'yoy_from_index@1',
    derived_from_series: 'US_CPI_INDEX', ancestors: [observation(rawInputs.previous, '2025-09-30'), observation(rawInputs.current, periodEnd)] },
  cycles: [], insufficient: [], events: [], calendar: [], assetsByCycle: [], eventsVersion: 'synthetic-events/1', cyclesVersion: 'synthetic-cycles/1',
};
const envelope: Envelope = {
  snapshotId: ids.snapshotUS, asOf, catalogVersion: CATALOG_VERSION, methodologyVersion: 'synthetic-method/1',
  collection: [{ dataset: 'macro.fred', status: 'fresh', lastOkAt: asOf, lastAttemptAt: asOf }],
  indicators: [{ observation_id: ids.old, series_id: 'US_CPI_YOY', name: definition('US_CPI_YOY').name,
    value_text: '2.5', unit: 'pct', change: { kind: 'pp', value_text: '0.1' }, period_end: periodEnd,
    available_at: rawInputs.current.available_at, availability_basis: 'first_seen', timeliness: 'current', presence: 'present', status: 'A',
    publisher: source.publisher, via: source.via, retrieval_id: rawInputs.current.retrieval!.retrieval_id,
    evidence: derivedInputs.map(i => ({ retrieval_id: i.retrieval!.retrieval_id, sha256: i.evidence!.sha256 })), sparkline: ['2.3', '2.4', '2.5'] }],
  changes: { counts: { new_release: 1, revised: 0, late: 0, missing: 0 }, items: [{ series_id: 'US_CPI_YOY', kind: 'new_release', period_end: periodEnd }] },
  catalogCounts: { verified: 1, missing: 0, restricted: 0 },
};
export const overview = { catalogVersion: CATALOG_VERSION, regions: { US: envelope, CN: { ...envelope, snapshotId: ids.snapshotCN, indicators: [] } } };
const ref = (id: string, end: string, value: string, seriesId = 'US_CPI_YOY'): ObsRef => ({ observation_id: id, series_id: seriesId, period_end: end,
  value_text: value, version: 1, available_at: id === ids.old ? rawInputs.current.available_at : `${end}T12:00:00Z`, source: { kind: 'history', as_of: asOf } });
export const history: CycleTableView = {
  version: 'macro-cycle-table/1', episodes_version: 'macro-policy-episodes/1', boundary: 'month_end', manifest_id: ids.manifest, cutoff: asOf,
  episodes: [{ index: 0, direction: 'cut', start: '2024-09-18', end: '2025-12-10', events: 3, upper_from: '5.5', upper_to: '4',
    cumulative_bp: '-150', left_censored: false, ongoing: false, gap_after: false }],
  columns: [{ id: 'synthetic_asset', label: bilingual('Synthetic local asset'), change_kind: 'pct', daily_series: null, monthly_series: 'SYNTHETIC_LOCAL_ASSET', restricted: false }],
  cells: { '0': { synthetic_asset: { status: 'ok', from: ref(ids.historyFrom, '2024-09-30', '100', 'SYNTHETIC_LOCAL_ASSET'), to: ref(ids.historyTo, '2025-12-31', '112.5', 'SYNTHETIC_LOCAL_ASSET'),
    change_raw: 12.5, change_text: '112.5/100', change_kind: 'pct' } } }, gaps: [],
};
const playbooks: PlaybookView[] = ['recovery', 'overheat', 'stagflation', 'recession'].map(regime => ({
  regime: regime as PlaybookView['regime'], title: bilingual(`Synthetic ${regime} playbook`), triggers: [],
  mechanism: [bilingual('Synthetic mechanism assumption')], implications: { favored: [bilingual('Synthetic local assets')], disfavored: [] },
  watch: [{ series_id: 'US_CPI_YOY', name: definition('US_CPI_YOY').name }],
}));
function transmissionFor(region: Region): TransmissionResponse {
  return { judgment_status: 'disabled', playbooks, transmission: {
    version: 'macro-transmission/1', region, manifest_id: ids.manifest, cutoff: asOf,
    snapshots: { US: ids.snapshotUS, CN: ids.snapshotCN }, catalog_version: CATALOG_VERSION,
    stages: (['economy', 'policy', 'liquidity', 'rates', 'risk', 'assets'] as const).map(stage => ({
      stage, label: bilingual(`Synthetic ${stage}`), edge: stage === 'assets' ? null : { text: bilingual('Synthetic transmission assumption'), kind: 'assumption' },
      nodes: [{ id: `${region}_${stage}`, state: 'observed', label: bilingual(`Synthetic ${region} ${stage} node`), value_text: stage === 'economy' ? '2.5' : '1',
        unit: 'pct', period_end: periodEnd, inputs: [ref(ids.old, periodEnd, '2.5')], reason: null }],
    })),
  } };
}
export const transmission = { US: transmissionFor('US'), CN: transmissionFor('CN') };
export const policyResponse: PolicyResponseView = {
  version: 'macro-policy-response/1', window: 3, manifest_id: ids.manifest, cutoff: asOf,
  dims: [{ id: 'synthetic_response', label: bilingual('Synthetic local response'), unit: 'bp', kind: 'series', series: 'US_CPI_YOY', coverage: { from: '2024-01-01', to: periodEnd } }],
  rows: (['hike', 'cut', 'qe_qt'] as const).map(direction => ({ direction, cells: { synthetic_response: { status: 'insufficient', unit: 'bp', events: [] } } })),
  sentences: [bilingual('Synthetic historical response; local fixture only.')],
};
export const reviewIndex: Record<Region, ReviewIndexResponse> = Object.fromEntries((['US', 'CN'] as const).map(region => [region, { items: [{ region, month: '2026-10',
  status: region === 'US' ? 'ok' : 'insufficient', generation: 1, result_id: ids.review, updated_at: asOf }] }])) as Record<Region, ReviewIndexResponse>;
export const reviewDetail: ReviewDetailResponse = {
  result: { result_id: ids.review, region: 'US', month: '2026-10', status: 'ok', manifest_id: ids.manifest, manifest_hash: 'd'.repeat(64),
    facts: { region: 'US', month: '2026-10', cutoff: asOf, baseline_cutoff: '2026-10-01T00:00:00Z', snapshot_id: ids.snapshotUS,
      baseline_snapshot_id: ids.baseline, baseline_missing: false,
      releases: [{ fact_id: 'rel:US_CPI_YOY', kind: 'release', template: 'release', series_id: 'US_CPI_YOY', period_end: periodEnd,
        source_inputs: ['review:US_CPI_YOY:latest', 'baseline:US_CPI_YOY:latest'],
        slots: { series: 'US_CPI_YOY', period: periodEnd, value: { value_text: '2.5', unit: 'pct' },
          prev_period: '2026-08-31', prev_value: { value_text: '2.4', unit: 'pct' } } }],
      revisions: [], timeliness: [], policy_events: [], episode_changes: [], asset_moves: [],
      coverage: [{ fact_id: 'cov:catalog', kind: 'coverage', template: 'coverage', source_inputs: [],
        slots: { verified: { value_text: '1', unit: 'count' }, missing: { value_text: '0', unit: 'count' }, restricted: { value_text: '0', unit: 'count' } } }]  },
    method_version: 'macro-review/1', code_version: 'synthetic-review-code/1', created_at: asOf },
  manifest_id: ids.manifest, generation: 1, names: [{ id: 'US_CPI_YOY', name: definition('US_CPI_YOY').name }], judgment_status: 'disabled',
};
export interface EvidenceFixture { catalogVersion: string; evidence: EvidenceObject; retrievals: Retrieval[]; download: { url: string; expiresIn: number } }
export const evidence: Record<string, EvidenceFixture> = Object.fromEntries(Object.values(rawInputs).map(input => {
  const sha = input.evidence!.sha256;
  return [sha, { catalogVersion: CATALOG_VERSION,
    evidence: { ...input.evidence!, object_path: `${input.evidence!.adapter}/${sha}.csv`, created_at: input.available_at },
    retrievals: [{ ...input.retrieval!, sha256: sha, batch_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
    download: { url: `/__fixture/evidence/${sha}`, expiresIn: 60 },
  }];
}));
export type MacroScenario = 'valid' | 'missing-input' | 'versions-error' | 'raw';
export interface MacroFixture {
  drawerTarget: DrawerTarget; versions: VersionsJson; versionsStatus: number;
  detail: DetailFixture; overview: typeof overview; history: CycleTableView; transmission: typeof transmission;
  policyResponse: PolicyResponseView; reviewIndex: typeof reviewIndex; reviewDetail: ReviewDetailResponse;
  evidence: typeof evidence; evidenceBodies: typeof evidenceBodies;
}
const valid: MacroFixture = { drawerTarget, versions, versionsStatus: 200, detail, overview, history, transmission, policyResponse, reviewIndex, reviewDetail, evidence, evidenceBodies };
export const fixtures: Record<MacroScenario, MacroFixture> = {
  valid,
  'missing-input': { ...valid, versions: { ...versions, versions: versions.versions.map(v => ({ ...v,
    inputs: v.inputs.map(i => i.observation_id === ids.inputPrevious ? { observation_id: ids.inputPrevious, missing: true as const } : i) })) } },
  'versions-error': { ...valid, versionsStatus: 503 },
  raw: { ...valid, drawerTarget: rawDrawerTarget, versions: rawVersions,
    detail: { ...detail, def: definition('US_CPI_INDEX'), seriesRead: 'US_CPI_INDEX',
      observations: [observation(rawInputs.previous, '2025-09-30'), observation(rawInputs.current, periodEnd)] } },
};
export function resolveFixture(name: string = 'valid'): MacroFixture {
  if (!Object.hasOwn(fixtures, name)) throw new Error(`Unknown macro fixture scenario: ${name}`);
  // Each caller receives a detached payload, so tests cannot leak mutations into another scenario.
  return structuredClone(fixtures[name as MacroScenario]);
}
