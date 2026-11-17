vi.mock('next-intl',()=>({useTranslations:()=> (key:string)=>key,useLocale:()=> 'en'}));
import { afterEach, describe, expect, it, vi } from "vitest";
import * as storage from "@/lib/macro/clock-view";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RULES_VERSION } from "@/lib/macro/regime";
import { weightedClockFrom } from "./clock-weighted";
import { quadrantRows } from "./clock-model";
import { ClockBreakdown } from "./ClockBreakdown";

const scores = { recovery: 18.5, overheat: 21, stagflation: 8.5, recession: 4 };
const total = 52;
const obs = (series_id: string, period_end: string, value_text: string) => ({
  observation_id: `${series_id}:${period_end}`, series_id, period_end, value_text, version: 1,
});
const observations = [
  obs("US_CPI_YOY", "2026-06-30", "2.1"), obs("US_CPI_YOY", "2026-09-30", "2.5"),
  obs("US_DFF", "2026-09-30", "4"),
  obs("US_DGS10", "2026-06-30", "3.5"), obs("US_DGS10", "2026-08-31", "3.7"), obs("US_DGS10", "2026-09-30", "3.8"),
  obs("US_UNRATE", "2026-06-30", "4.1"), obs("US_UNRATE", "2026-09-30", "3.9"),
  obs("US_DTWEXBGS", "2026-09-30", "100"),
];
const contribution = (series_id: string, rule_id: string, weight: number, support: Record<string, number>, points: Record<string, number>) => ({
  series_id, rule_id, weight, support, contribution: points,
  observation_id: observations.filter(o => o.series_id === series_id).at(-1)!.observation_id,
});
const dto = {
  snapshot: { snapshot_id: "bound", region: "US", observation_ids: observations.map(o => o.observation_id) },
  observations, rulesVersion: RULES_VERSION, uncoveredWeight: 35,
  contributions: [
    contribution("US_CPI_YOY", "infl.2to3", 15, { recovery: .4, overheat: .3, stagflation: .1, recession: .1 }, { recovery: 6, overheat: 4.5, stagflation: 1.5, recession: 1.5 }),
    contribution("US_DFF", "policy.2_5to4_5", 25, { recovery: .3, overheat: .2, stagflation: .1, recession: .1 }, { recovery: 7.5, overheat: 5, stagflation: 2.5, recession: 2.5 }),
    contribution("US_DGS10", "bond.d3m.ge25bp", 15, { overheat: .5, stagflation: .3 }, { recovery: 0, overheat: 7.5, stagflation: 4.5, recession: 0 }),
    contribution("US_UNRATE", "labor.d3m.le-0_1", 10, { recovery: .5, overheat: .4 }, { recovery: 5, overheat: 4, stagflation: 0, recession: 0 }),
  ],
  regime: { scores, norm: Object.fromEntries(Object.entries(scores).map(([k,v]) => [k, Math.round(v/total*1e6)/1e6])), coverage: .65,
    primary_state: "overheat", secondary_state: "recovery", margin_pp: Math.round(2.5/total*100*1e6)/1e6,
    growth_axis: .9, inflation_axis: -.1 },
};

describe("weighted clock", () => {
  afterEach(() => vi.restoreAllMocks());
  it.each([
    {}, { ...dto.regime, coverage: Infinity }, { ...dto.regime, margin_pp: NaN },
    { ...dto.regime, scores: {} }, { ...dto.regime, norm: { ...scores, recovery: NaN } },
    { ...dto.regime, primary_state: "unknown" }, { ...dto.regime, secondary_state: "unknown" },
    { ...dto.regime, growth_axis: undefined }, { ...dto.regime, inflation_axis: Infinity },
  ])("rejects a malformed regime before reconciliation: %j", regime => {
    expect(weightedClockFrom({ ...dto, regime }, "bound", "en")).toMatchObject({ status: "unavailable", rows: [] });
  });
  it.each([
    {}, { ...dto.contributions[0], series_id: 1 }, { ...dto.contributions[0], observation_id: null },
    { ...dto.contributions[0], rule_id: null }, { ...dto.contributions[0], weight: Infinity },
    { ...dto.contributions[0], contribution: {} },
    { ...dto.contributions[0], contribution: { ...scores, recovery: NaN } },
  ])("rejects any malformed contribution without silently dropping it: %j", malformed => {
    expect(weightedClockFrom({ ...dto, contributions: [...dto.contributions, malformed] }, "bound", "en"))
      .toMatchObject({ status: "unavailable", rows: [] });
  });
  it("returns unavailable if reconciliation throws", () => {
    vi.spyOn(storage, "reconcileStorage").mockImplementationOnce(() => { throw new Error("malformed storage"); });
    expect(weightedClockFrom(dto, "bound", "en")).toMatchObject({ status: "unavailable", rows: [] });
  });
  it("renders the empty message instead of an empty table", () => {
    const html = renderToStaticMarkup(createElement(ClockBreakdown, { rows: [], regime: "recovery", t: key => key }));
    expect(html).toContain("judgment.widget.empty");
    expect(html).not.toContain("<table");
  });
  it("projects every weighted series and comparison roles from the frozen observations", () => {
    const view = weightedClockFrom(dto, "bound", "en");
    expect(view.status).toBe("ok");
    expect(view.rows.map(r => [r.seriesId, r.state])).toEqual([
      ["US_DFF", "matched"], ["US_DGS10", "matched"], ["US_DTWEXBGS", "not_matched"],
      ["US_CPI_YOY", "matched"], ["US_UNRATE", "matched"], ["US_PPI_FD_YOY", "no_data"],
      ["US_ISM_PMI", "missing"], ["US_VIX", "restricted"],
    ]);
    expect(view.rows.find(r => r.seriesId === "US_CPI_YOY")?.comparisons.map(c => c.role)).toEqual(["prev", "prev3m"]);
    expect(view.rows.find(r => r.seriesId === "US_DGS10")?.comparisons.map(c => c.role)).toEqual(["prev", "prev3m"]);
    expect(view.rows.find(r => r.seriesId === "US_DGS10")?.support).toEqual({ recovery: 0, overheat: .5, stagflation: .3, recession: 0 });
    expect(view.rows.find(r => r.seriesId === "US_ISM_PMI")?.latest).toBeNull();
    expect(quadrantRows(view.rows, "overheat").filter(r => r.amount > 0).slice(0, 3).map(r => r.seriesId))
      .toEqual(["US_DGS10", "US_DFF", "US_CPI_YOY"]);
    expect(view.insufficientCoverage).toBe(false);
  });
  it("hides all rows on stored-score tampering", () => {
    const bad = structuredClone(dto);
    bad.contributions[0].contribution.recovery = 7;
    expect(weightedClockFrom(bad, "bound", "zh")).toMatchObject({ status: "reconcile_failed", rows: [], diagnostics: ["invariant_2"] });
  });
  it("offers frozen evidence for every row with a latest observation", () => {
    const rows = weightedClockFrom(dto, "bound", "en").rows;
    const html = renderToStaticMarkup(createElement(ClockBreakdown, {
      rows, regime: "overheat", t: key => key, onEvidence: () => {},
    }));
    expect(html.match(/judgment.widget.evidence ↗<\/button>/g)).toHaveLength(5);
    expect(html).toContain("judgment.widget.denominatorNote");
  });
  it("marks insufficient coverage and rejects a different snapshot", () => {
    expect(weightedClockFrom({ ...dto, regime: null }, "bound", "en").insufficientCoverage).toBe(true);
    expect(weightedClockFrom(dto, "other", "en")).toMatchObject({ status: "unavailable", rows: [] });
  });
});
