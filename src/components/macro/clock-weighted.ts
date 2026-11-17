import { catalogById } from "@/lib/macro/catalog";
import { reconcileStorage } from "@/lib/macro/clock-view";
import type { Regime } from "@/lib/macro/judgment-contract";
import { RULES, RULES_VERSION, regionWeights } from "@/lib/macro/regime";
import { shiftMonthEnd } from "@/lib/macro/periods";
import type { ObservationRow, RegimeRecord, Region } from "@/lib/macro/types";
import { basisFrom } from "./judgment-view";
import { formatValueText } from "./macro-format";

const REGIMES: Regime[] = ["recovery", "overheat", "stagflation", "recession"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isRegime = (v: unknown): v is Regime => REGIMES.some(r => r === v);
const regimeNumbers = (v: unknown): v is Record<Regime, number> => isObject(v) && REGIMES.every(r => finite(v[r]));
const validRegime = (v: unknown): boolean => v === null || (isObject(v) &&
  finite(v.coverage) && finite(v.margin_pp) && regimeNumbers(v.scores) && regimeNumbers(v.norm) &&
  isRegime(v.primary_state) && (v.secondary_state === null || isRegime(v.secondary_state)) &&
  (v.growth_axis === null || finite(v.growth_axis)) && (v.inflation_axis === null || finite(v.inflation_axis)));
const zero = (): Record<Regime, number> => ({ recovery: 0, overheat: 0, stagflation: 0, recession: 0 });
const valueWithUnit = (value: string, unit: string) => formatValueText(value) + (unit === "pct" || unit === "pct_yoy" ? "%" : unit === "index" ? "" : unit);

export interface WeightedRow {
  seriesId: string;
  name: string;
  unit: string;
  weight: number;
  state: "matched" | "not_matched" | "no_data" | "missing" | "restricted";
  latest: { observationId: string; period: string; value: string } | null;
  comparisons: { role: "prev" | "prev3m"; period: string; value: string }[];
  rule: string | null;
  ruleId: string | null;
  support: Record<Regime, number> | null;
  contribution: Record<Regime, number> | null;
  reason: string | null;
}
export interface WeightedClock {
  status: "ok" | "reconcile_failed" | "unavailable";
  rows: WeightedRow[];
  insufficientCoverage: boolean;
  diagnostics: string[];
}
const unavailable = (insufficientCoverage = false): WeightedClock => ({ status: "unavailable", rows: [], insufficientCoverage, diagnostics: [] });

/** Project the exact stored decomposition only after its score and coverage invariants pass. */
export function weightedClockFrom(json: unknown, snapshotId: string, locale: "zh" | "en"): WeightedClock {
  if (!isObject(json) || !validRegime(json.regime)) return unavailable();
  // Validate the raw array before basisFrom can filter malformed entries out.
  const rawContributions = [json.contributions, isObject(json.regime) ? json.regime.contributions : undefined,
    isObject(json.snapshot) ? json.snapshot.contributions : undefined].find(Array.isArray);
  if (!Array.isArray(rawContributions) || !rawContributions.every(c => isObject(c) &&
    typeof c.series_id === "string" && typeof c.observation_id === "string" && typeof c.rule_id === "string" &&
    finite(c.weight) && regimeNumbers(c.contribution))) return unavailable();
  const basis = basisFrom(json, snapshotId);
  if (!basis || !isObject(json) || !isObject(json.snapshot) || !Array.isArray(json.observations)) return unavailable();
  const region = json.snapshot.region;
  if (region !== "US" && region !== "CN") return unavailable();
  const insufficientCoverage = json.regime === null || (isObject(json.regime) && typeof json.regime.coverage === "number" && json.regime.coverage < .6);
  if (typeof json.rulesVersion !== "string" || !finite(json.uncoveredWeight)) return unavailable(insufficientCoverage);
  const manifest = new Set(Array.isArray(json.snapshot.observation_ids) ? json.snapshot.observation_ids : []);
  const observations: ObservationRow[] = [];
  for (const raw of json.observations) {
    if (!isObject(raw) || typeof raw.observation_id !== "string" || typeof raw.series_id !== "string" ||
        typeof raw.period_end !== "string" || typeof raw.value_text !== "string" || typeof raw.version !== "number" ||
        !manifest.has(raw.observation_id)) return unavailable(insufficientCoverage);
    // Reconciliation reads these frozen fields; the public DTO omits storage-only fields.
    observations.push({
      observation_id: raw.observation_id,
      series_id: raw.series_id,
      period_end: raw.period_end,
      value_text: raw.value_text,
      version: raw.version,
    } as ObservationRow);
  }
  const rec: RegimeRecord = {
    snapshot_id: snapshotId, region: region as Region,
    regime: json.regime as RegimeRecord["regime"], contributions: basis,
    rules_version: json.rulesVersion, uncovered_weight: json.uncoveredWeight,
  };
  let result: ReturnType<typeof reconcileStorage>;
  try {
    result = reconcileStorage({ region, observations, rec, snapshotCatalogVersion: typeof json.catalogVersion === "string" ? json.catalogVersion : undefined });
  } catch {
    return unavailable(insufficientCoverage);
  }
  if (!result.ok) return { status: "reconcile_failed", rows: [], insufficientCoverage, diagnostics: result.diagnostics.map(d => d.code) };
  const contributions = new Map(basis.map(c => [c.series_id, c]));
  const bySeries = new Map<string, ObservationRow[]>();
  for (const o of observations) bySeries.set(o.series_id, [...(bySeries.get(o.series_id) ?? []), o]);
  const rows = Object.entries(regionWeights(region)).map(([seriesId, weight]): WeightedRow => {
    const def = catalogById(seriesId)!;
    const c = contributions.get(seriesId);
    const all = (bySeries.get(seriesId) ?? []).sort((a, b) => a.period_end.localeCompare(b.period_end) || a.version - b.version);
    const state: WeightedRow["state"] = def.status === "missing" ? "missing" : def.status === "restricted" ? "restricted" : c ? "matched" : all.length ? "not_matched" : "no_data";
    const hidden = state === "missing" || state === "restricted";
    const latest = hidden ? undefined : all.at(-1);
    const earlier = latest ? all.filter(o => o.period_end < latest.period_end) : [];
    const prev = earlier.at(-1);
    const prev3m = latest ? earlier.find(o => o.period_end === shiftMonthEnd(latest.period_end, -3)) : undefined;
    const comparisons: WeightedRow["comparisons"] = [];
    if (prev) comparisons.push({ role: "prev", period: prev.period_end, value: valueWithUnit(prev.value_text, def.unit) });
    if (prev3m) comparisons.push({ role: "prev3m", period: prev3m.period_end, value: valueWithUnit(prev3m.value_text, def.unit) });
    const rule = c && json.rulesVersion === RULES_VERSION && def.type ? RULES[def.type].find(r => r.id === c.rule_id) : undefined;
    const support = c ? { ...zero(), ...c.support } : null;
    return {
      seriesId, name: def.name[locale], unit: def.unit, weight, state,
      latest: latest ? { observationId: latest.observation_id, period: latest.period_end, value: valueWithUnit(latest.value_text, def.unit) } : null,
      comparisons, rule: c ? rule?.label[locale] ?? c.rule_id : null, ruleId: c?.rule_id ?? null,
      support, contribution: c?.contribution ?? null, reason: def.reason?.[locale] ?? null,
    };
  });
  return { status: "ok", rows, insufficientCoverage, diagnostics: [] };
}
