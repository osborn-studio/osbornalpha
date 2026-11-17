/** Synthetic acceptance DTOs; no credentials, network, or real observations.
 * npx tsx scripts/preview/make-clock-fixture.ts <outDir>
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CATALOG_VERSION, catalogById, indicatorsOf } from "../../src/lib/macro/catalog";
import { REGIMES } from "../../src/lib/macro/judgment-contract";
import { classifyRegime, METHODOLOGY_VERSION, RULES_VERSION, regionWeights } from "../../src/lib/macro/regime";
import type { RegimeInput } from "../../src/lib/macro/regime";
import type { ObservationRow, Region, SnapshotRecord } from "../../src/lib/macro/types";
import { clockFrom, clockMetadataFrom, parseJudgments } from "../../src/components/macro/judgment-view";
import { weightedClockFrom } from "../../src/components/macro/clock-weighted";

const FIXTURE = "synthetic acceptance sample — not real data";
const AS_OF = "2026-10-31T23:59:59.000Z";
const SNAPSHOT_IDS = {
  US: "00000000-0000-4000-8000-000000000001",
  CN: "00000000-0000-4000-8000-000000000002",
} as const;

// Values are invented, in latest / previous month / three months earlier order.
// Stable FX stays inside the ±2% rules' gap. Omitted PPI/GDP exercise no_data.
const VALUES: Record<Region, Record<string, readonly [string, string, string]>> = {
  US: {
    US_DFF: ["4.75", "5.00", "5.25"],
    US_DGS10: ["4.10", "4.20", "4.50"],
    US_DTWEXBGS: ["120.5", "120.2", "120.0"],
    US_CPI_YOY: ["2.6", "2.8", "3.1"],
    US_UNRATE: ["4.4", "4.2", "4.0"],
  },
  CN: {
    CN_CPI_YOY: ["0.8", "0.6", "0.4"],
    CN_PPI_YOY: ["-1.5", "-1.8", "-2.0"],
    CN_PMI_MFG: ["50.8", "50.3", "49.8"],
    CN_M2_YOY: ["8.5", "8.3", "8.1"],
    CN_EXPORT_YOY: ["5.8", "5.3", "5.1"],
    CN_CGB_10Y: ["1.8", "1.9", "2.1"],
    CN_USDCNY_CP: ["712.0", "711.0", "710.0"],
  },
};

/** Deterministic UUID with version/variant bits, namespaced to synthetic samples. */
function uuid(key: string): string {
  const hex = createHash("sha256").update(`macro-clock-synthetic:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function fixture(region: Region) {
  const input: RegimeInput = { region, series: {} };
  // Same public fields as publicObservation + code_version in snapshots/[id].
  const observations: (Pick<ObservationRow,
    "observation_id" | "series_id" | "period_end" | "value_text" | "version" |
    "available_at" | "availability_basis" | "retrieval_id" | "locator" |
    "derived_from" | "transform" | "code_version">)[] = [];
  for (const id of Object.keys(regionWeights(region))) {
    if (catalogById(id)?.status !== "active") continue;
    const values = VALUES[region][id];
    if (!values) continue;
    const points = ["2026-09-30", "2026-08-31", "2026-06-30"].map((period, i) => ({
      observation_id: uuid(`${id}:${period}`),
      series_id: id,
      period_end: period,
      value_text: values[i],
      version: 1,
      available_at: AS_OF,
      availability_basis: "first_seen" as const,
      retrieval_id: uuid(`synthetic-retrieval:${id}:${period}`),
      locator: { kind: "json_pointer" as const, pointer: `/synthetic/${id}/${period}` },
      derived_from: null,
      transform: null,
      code_version: "synthetic-acceptance-fixture/1",
    }));
    observations.push(...points);
    input.series[id] = { latest: points[0], prev: points[1], prev3m: points[2] };
  }
  const result = classifyRegime(input);
  const { regime } = result;
  assert(regime && regime.coverage >= 0.6, `${region}: insufficient synthetic coverage`);
  const indicators = indicatorsOf(region);
  const snapshot: SnapshotRecord = {
    snapshot_id: SNAPSHOT_IDS[region], region, as_of: AS_OF, created_at: AS_OF,
    status: "active", revision: 1, failure_reason: null,
    methodology_version: METHODOLOGY_VERSION, catalog_version: CATALOG_VERSION,
    observation_ids: observations.map(o => o.observation_id), history_ids: [],
    catalog_counts: {
      verified: indicators.filter(d => d.status === "active").length,
      missing: indicators.filter(d => d.status === "missing").length,
      restricted: indicators.filter(d => d.status === "restricted").length,
    },
  };
  const dto = {
    _fixture: FIXTURE, ...result, rulesVersion: RULES_VERSION,
    catalogVersion: CATALOG_VERSION, snapshot, observations,
  };
  const cards = { cards: [{
    judgment_id: uuid(`judgment:${region}`), judgment_type: "macro_regime",
    kind: "categorical", subject: { type: "macro_region", key: region },
    retrospective: false, lifecycle: "open", calibration: "insufficient", as_of: AS_OF,
    methodology: {
      id: "macro_regime", version: "v2",
      title: { zh: "合成验收样本 · 非真实数据", en: FIXTURE },
      href: "/methodologies/macro_regime/v2",
    },
    inputs: [{ kind: "macro_snapshot", ref: { snapshot_id: snapshot.snapshot_id } }],
    display: {
      headline: { zh: "合成验收样本 · 非真实数据", en: FIXTURE },
      value: regime.primary_state, percent: null,
    },
  }] };
  const parsed = parseJudgments(cards);
  assert(parsed.ok, `${region}: malformed card envelope`);
  assert.equal(clockFrom(parsed.cards, region, snapshot.snapshot_id).selected, regime.primary_state);
  assert(clockMetadataFrom(dto, snapshot.snapshot_id), `${region}: invalid metadata`);
  const weighted = weightedClockFrom(dto, snapshot.snapshot_id, "zh");
  assert.equal(weighted.status, "ok", `${region}: ${weighted.diagnostics.join(", ")}`);
  assert(weighted.rows.some(r => r.state === "not_matched"), `${region}: needs unmatched series`);
  assert(weighted.rows.some(r => r.state === "no_data"), `${region}: needs absent active series`);
  console.log(`${region}: coverage=${regime.coverage}, primary=${regime.primary_state}, weightedClockFrom=${weighted.status}`);
  for (const quadrant of REGIMES) {
    const total = result.contributions.reduce((sum, c) => sum + c.contribution[quadrant], 0);
    assert(Math.abs(total - regime.scores[quadrant]) <= 1e-6, `${region}: ${quadrant} score mismatch`);
    console.log(`${region} ${quadrant}: Σ contributions=${total} vs regime.scores=${regime.scores[quadrant]}`);
  }
  return { dto, cards };
}

async function main() {
  const outDir = process.argv[2];
  assert(outDir, "Usage: npx tsx scripts/preview/make-clock-fixture.ts <outDir>");
  const samples = (["US", "CN"] as const).map(region => ({ region, ...fixture(region) }));
  await mkdir(resolve(outDir), { recursive: true });
  for (const { region, dto, cards } of samples) {
    for (const [kind, data] of [["snapshot", dto], ["card", cards]] as const) {
      const path = resolve(outDir, `osbornalpha-${region.toLowerCase()}-${kind}.json`);
      await writeFile(path, JSON.stringify(data, null, 2) + "\n");
      console.log(`Wrote ${path}`);
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
