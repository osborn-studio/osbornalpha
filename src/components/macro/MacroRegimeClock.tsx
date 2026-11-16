"use client";
import { useState } from "react";
import type { ClockMetadata, JudgmentCard } from "./judgment-view";
import type { Regime } from "@/lib/macro/judgment-contract";
import type { MacroT } from "./use-macro-t";
import { CLOCK_ORDER, type ClockRow } from "./clock-model";
import { ClockFramework } from "./ClockFramework";
import { ClockPhasePanel } from "./ClockPhasePanel";
import "./investment-clock.css";

export interface MacroRegimeClockProps {
  selected: Regime | null;
  reason: string | null;
  metadata: ClockMetadata | null;
  metadataLoading: boolean;
  t: MacroT;
  region?: "US" | "CN";
  locale?: "zh" | "en";
  date?: string;
  rows?: ClockRow[];
  card?: JudgmentCard | null;
  loading?: boolean;
  onRefresh?: () => void;
  onEvidence?: (row: ClockRow) => void;
}
/** Current classification is supplied by clockFrom. Inspection is independent local UI state. */
export function MacroRegimeClock({
  selected,
  reason,
  metadata,
  metadataLoading,
  t,
  region = "US",
  locale = "zh",
  date,
  rows = [],
  card,
  loading = false,
  onRefresh,
  onEvidence,
}: MacroRegimeClockProps) {
  const [inspected, setInspected] = useState<Regime | null>(null);
  const w = (key: string, values?: Record<string, string | number>) =>
    t(`judgment.widget.${key}`, values);
  if (loading)
    return (
      <section
        className="investment-clock clock-skeleton"
        aria-busy="true"
        aria-label={w("loading")}
      >
        <div className="clock-skeleton-heading" />
        <div className="clock-grid">
          {CLOCK_ORDER.map((r) => (
            <div key={r} className="clock-skeleton-panel" />
          ))}
        </div>
      </section>
    );
  return (
    <section
      id="investment-clock"
      aria-label={w("title")}
      className="investment-clock"
    >
      <header className="clock-header">
        <div>
          <p className="clock-eyebrow">{w("eyebrow")}</p>
          <h2>{w("title")}</h2>
          <p className="clock-small">
            {date
              ? w("snapshot", { region: t(`region.${region}`), date })
              : w("noSnapshot")}
          </p>
        </div>
        <div className="clock-header-actions">
          <span className="clock-current-label" role="status">
            {selected
              ? `${t("judgment.clock.current")} · ${t(`judgment.clock.${selected}`)}`
              : w("unknown")}
          </span>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="clock-text-button"
            >
              ↻ {w("refresh")}
            </button>
          )}
        </div>
      </header>
      <div className="clock-context">
        <details className="clock-coverage">
          <summary>
            {metadata
              ? w("coverage", { value: Math.round(metadata.coverage * 100) })
              : t(
                  metadataLoading
                    ? "judgment.clock.metadataLoading"
                    : "judgment.clock.metadataUnavailable",
                )}{" "}
            <span aria-hidden="true">⌄</span>
          </summary>
          <p>{w("coverageNote")}</p>
          {metadata && (
            <p>
              {t("judgment.clock.uncovered", {
                value: metadata.uncoveredWeight,
              })}
            </p>
          )}
        </details>
        <div className="clock-limitations" role="status">
          {reason && <span>{reason}</span>}
          {metadata &&
            (metadata.growth_axis === null ||
              metadata.inflation_axis === null) && (
              <span>
                {t("judgment.clock.missingAxis", {
                  axes: [
                    metadata.growth_axis === null
                      ? t("judgment.clock.growth")
                      : "",
                    metadata.inflation_axis === null
                      ? t("judgment.clock.inflation")
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" / "),
                })}
              </span>
            )}
          {metadata?.margin_pp === 0 && (
            <span>
              {t("judgment.clock.tie", {
                primary: t(`judgment.clock.${metadata.primary_state}`),
                secondary: metadata.secondary_state
                  ? t(`judgment.clock.${metadata.secondary_state}`)
                  : t("judgment.clock.secondaryUnavailable"),
              })}
            </span>
          )}
        </div>
      </div>
      <div className="clock-grid-wrap">
        <div className="clock-grid">
          {CLOCK_ORDER.map((regime, index) => (
            <ClockPhasePanel
              key={regime}
              regime={regime}
              index={index}
              current={selected === regime}
              expanded={inspected === regime}
              rows={rows}
              t={t}
              locale={locale}
              metadataLoading={metadataLoading}
              onToggle={() =>
                setInspected(inspected === regime ? null : regime)
              }
              onClose={() => setInspected(null)}
              onEvidence={onEvidence}
            />
          ))}
        </div>
        <div
          className="clock-cycle"
          role="img"
          aria-label={`${w("cycle")}: ${CLOCK_ORDER.map((r) => t(`judgment.clock.${r}`)).join(" → ")}`}
        >
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <path d="M16 18 A22 22 0 0 1 50 21 M48 14 L51 22 L43 22 M48 46 A22 22 0 0 1 14 43 M16 50 L13 42 L21 42" />
          </svg>
          <span>{w("cycle")}</span>
        </div>
      </div>
      <ClockFramework t={t} card={card} />
    </section>
  );
}
