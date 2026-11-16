import { describe, expect, it } from "vitest";
import { clockRowsFrom, quadrantRows } from "./clock-model";
import { RULES_VERSION } from "@/lib/macro/regime";
const contribution = {
  series_id: "CN_CPI_YOY",
  observation_id: "obs",
  rule_id: "infl.lt1",
  weight: 10,
  contribution: { recovery: 1, overheat: 0, stagflation: 0, recession: 7 },
};
const dto = {
  snapshot: { snapshot_id: "bound", observation_ids: ["obs"] },
  rulesVersion: RULES_VERSION,
  contributions: [contribution],
  observations: [
    {
      series_id: "CN_CPI_YOY",
      observation_id: "obs",
      value_text: "0.8",
      period_end: "2026-09-30",
    },
  ],
};
describe("clock presentation evidence", () => {
  it("joins by exact snapshot, manifest, observation and series", () => {
    expect(clockRowsFrom(dto, "bound", "en")[0]).toMatchObject({
      name: "China CPI, year over year",
      value: "0.8%",
      period: "2026-09-30",
    });
    expect(clockRowsFrom(dto, "other", "en")).toEqual([]);
    expect(
      clockRowsFrom(
        {
          ...dto,
          observations: [{ ...dto.observations[0], observation_id: "newer" }],
        },
        "bound",
        "en",
      )[0].value,
    ).toBeNull();
    expect(
      clockRowsFrom(
        { ...dto, snapshot: { ...dto.snapshot, observation_ids: [] } },
        "bound",
        "en",
      )[0].value,
    ).toBeNull();
  });
  it("retains zero contributions in each quadrant, ranks real drivers and never normalizes", () => {
    const rows = clockRowsFrom(dto, "bound", "en");
    expect(quadrantRows(rows, "recession")[0].amount).toBe(7);
    expect(quadrantRows(rows, "overheat")[0].amount).toBe(0);
    expect(quadrantRows(rows, "recovery")[0].amount).toBe(1);
  });
  it("does not attach current rule explanations to a different rules version", () => {
    expect(
      clockRowsFrom({ ...dto, rulesVersion: "future" }, "bound", "en")[0].rule,
    ).toBe("infl.lt1");
  });
  it("shows absent observations honestly while retaining published contributions", () => {
    expect(
      clockRowsFrom({ ...dto, observations: undefined }, "bound", "zh")[0],
    ).toMatchObject({ value: null, weight: 10 });
  });
  it("rejects a different series and malformed numeric values without losing contributions", () => {
    for (const obs of [
      { ...dto.observations[0], series_id: "US_CPI_YOY" },
      { ...dto.observations[0], value_text: "0x10" },
      { ...dto.observations[0], value_text: "" },
    ]) {
      expect(
        clockRowsFrom({ ...dto, observations: [obs] }, "bound", "en")[0],
      ).toMatchObject({ value: null, weight: 10 });
    }
  });
});
