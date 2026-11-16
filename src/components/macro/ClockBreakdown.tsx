import type { Regime } from "@/lib/macro/judgment-contract";
import type { WeightedRow } from "./clock-weighted";
import { CLOCK_ORDER, quadrantRows } from "./clock-model";
import type { MacroT } from "./use-macro-t";

export function ClockBreakdown({ rows, regime, t, onEvidence }: {
  rows: WeightedRow[]; regime: Regime; t: MacroT; onEvidence?: (row: WeightedRow) => void;
}) {
  const w = (key: string) => t(`judgment.widget.${key}`);
  const ordered = quadrantRows(rows.filter(r => r.state === "matched"), regime)
    .concat(rows.filter(r => r.state === "not_matched" || r.state === "no_data").map(r => ({ ...r, amount: 0 })))
    .concat(rows.filter(r => r.state === "missing" || r.state === "restricted").map(r => ({ ...r, amount: 0 })));
  return <div className="clock-breakdown">
    <p className="clock-small">{w("formula")}</p>
    <div className="clock-table-scroll" tabIndex={0} role="region" aria-label={`${t(`judgment.clock.${regime}`)}: ${w("inspect")}`}>
      <table>
        <thead><tr>{["indicator", "value", "comparison", "rule", "support", "weight", "contribution", "evidence"].map(key => <th key={key} scope="col">{w(key)}</th>)}</tr></thead>
        <tbody>{ordered.map(row => <tr key={row.seriesId} className={row.state === "matched" ? undefined : "clock-row-dim"}>
          <th scope="row"><a href={`/macro/${encodeURIComponent(row.seriesId)}`}>{row.name}</a><small>{row.latest?.period ?? "—"}</small>{row.state !== "matched" && <small>{w(`states.${row.state}`)} · {w("denominatorNote")}</small>}{row.reason && <small>{row.reason}</small>}</th>
          <td data-label={w("value")} className="clock-number">{row.latest?.value ?? "—"}</td>
          <td data-label={w("comparison")}>{row.comparisons.length ? row.comparisons.map((c, i) => <span className="clock-comparison" key={`${c.role}:${i}`}>{w(c.role)} · {c.period} · <span className="clock-number">{c.value}</span></span>) : "—"}</td>
          <td data-label={w("rule")}>{row.rule ?? "—"}</td>
          <td data-label={w("support")}>{row.support ? CLOCK_ORDER.map(q => <span className="clock-support" key={q}>{t(`judgment.clock.${q}`)} <span className="clock-number">{row.support?.[q]}</span></span>) : "—"}</td>
          <td data-label={w("weight")} className="clock-number">{row.weight}</td>
          <td data-label={w("contribution")} className="clock-number">{row.contribution?.[regime] ?? "—"}</td>
          <td data-label={w("evidence")}>{row.latest && onEvidence ? <button type="button" className="clock-text-button" onClick={() => onEvidence(row)}>{w("evidence")} ↗</button> : "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}
