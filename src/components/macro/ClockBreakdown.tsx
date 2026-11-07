import type { Regime } from "@/lib/macro/judgment-contract";
import type { ClockRow } from "./clock-model";
import { quadrantRows } from "./clock-model";
import type { MacroT } from "./use-macro-t";

export function ClockBreakdown({
  rows,
  regime,
  t,
  onEvidence,
}: {
  rows: ClockRow[];
  regime: Regime;
  t: MacroT;
  onEvidence?: (row: ClockRow) => void;
}) {
  return (
    <div className="clock-breakdown">
      <p className="clock-small">{t("judgment.widget.formula")}</p>
      {rows.length ? (
        <div
          className="clock-table-scroll"
          tabIndex={0}
          role="region"
          aria-label={`${t(`judgment.clock.${regime}`)}: ${t("judgment.widget.inspect")}`}
        >
          <table>
            <thead>
              <tr>
                {["indicator", "value", "rule", "weight", "contribution"].map(
                  (key) => (
                    <th key={key} scope="col">
                      {t(`judgment.widget.${key}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {quadrantRows(rows, regime).map((row) => (
                <tr key={`${row.seriesId}:${row.ruleId}`}>
                  <th scope="row">
                    <a href={`/macro/${encodeURIComponent(row.seriesId)}`}>
                      {row.name}
                    </a>
                    <small>{row.period ?? "—"}</small>
                  </th>
                  <td data-label={t("judgment.widget.value")}>
                    {row.value ?? (
                      <span className="clock-small">
                        {t("judgment.widget.missingValue")}
                      </span>
                    )}
                  </td>
                  <td data-label={t("judgment.widget.rule")}>{row.rule}</td>
                  <td data-label={t("judgment.widget.weight")}>{row.weight}</td>
                  <td
                    data-label={t("judgment.widget.contribution")}
                    className="clock-number"
                  >
                    {row.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="clock-small">{t("judgment.widget.empty")}</p>
      )}
      {rows.length > 0 && (
        <div className="clock-evidence-links">
          {quadrantRows(rows, regime)
            .slice(0, 3)
            .map((row) => (
              <span key={row.seriesId}>
                {onEvidence && row.value && row.period ? (
                  <button type="button" onClick={() => onEvidence(row)}>
                    {row.name} ↗ {t("judgment.widget.evidence")}
                  </button>
                ) : (
                  <a href={`/macro/${encodeURIComponent(row.seriesId)}`}>
                    {row.name} ↗ {t("judgment.widget.detail")}
                  </a>
                )}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
