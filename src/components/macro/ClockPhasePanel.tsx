"use client";
import { useId, useRef } from "react";
import type { Regime } from "@/lib/macro/judgment-contract";
import type { MacroT } from "./use-macro-t";
import { quadrantRows, type ClockRow } from "./clock-model";
import { ClockBreakdown } from "./ClockBreakdown";

export function ClockPhasePanel({
  regime,
  index,
  current,
  expanded,
  rows,
  t,
  locale,
  metadataLoading,
  onToggle,
  onClose,
  onEvidence,
}: {
  regime: Regime;
  index: number;
  current: boolean;
  expanded: boolean;
  rows: ClockRow[];
  t: MacroT;
  locale: "zh" | "en";
  metadataLoading: boolean;
  onToggle: () => void;
  onClose: () => void;
  onEvidence?: (row: ClockRow) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const w = (key: string) => t(`judgment.widget.${key}`);
  const ranked = quadrantRows(rows, regime);
  const drivers = ranked.filter((r) => r.amount > 0).slice(0, 2);
  const close = () => {
    onClose();
    trigger.current?.focus();
  };
  return (
    <article
      data-phase={regime}
      data-current={current || undefined}
      className="clock-panel"
      onKeyDown={(e) => {
        if (expanded && e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
    >
      {current && (
        <span className="clock-current-badge">
          ● {t("judgment.clock.current")}
        </span>
      )}
      <div className="clock-phase-heading">
        <span className="clock-phase-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div>
          <h3>
            {t(`judgment.clock.${regime}`)}{" "}
            <small lang={locale === "en" ? "zh" : "en"}>
              {w(`${regime}.alternate`)}
            </small>
          </h3>
          <p>{t(`judgment.clock.${regime}Axes`)}</p>
        </div>
        <span className="clock-total">
          <strong>
            {rows.length ? ranked.reduce((sum, r) => sum + r.amount, 0) : "—"}
          </strong>
          <small>{w("total")}</small>
        </span>
      </div>
      <p className="clock-meaning">{w(`${regime}.meaning`)}</p>
      <p className="clock-signal">{w(`${regime}.signal`)}</p>
      <div className="clock-drivers">
        <p className="clock-eyebrow">{w("drivers")}</p>
        {drivers.length ? (
          drivers.map((row) => (
            <div className="clock-driver" key={row.seriesId}>
              <a href={`/macro/${encodeURIComponent(row.seriesId)}`}>
                {row.name}
              </a>
              <span>{row.value ?? w("missingValue")}</span>
              <strong>+{row.amount}</strong>
            </div>
          ))
        ) : (
          <p className="clock-small">
            {metadataLoading
              ? w("loading")
              : rows.length
                ? w("noDrivers")
                : w("empty")}
          </p>
        )}
      </div>
      <button
        ref={(el) => {
          trigger.current = el;
        }}
        type="button"
        aria-label={`${t(`judgment.clock.${regime}`)}: ${expanded ? w("close") : w("inspect")}`}
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => onToggle()}
        className="clock-inspect"
      >
        {expanded ? w("close") : w("inspect")}{" "}
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      <div id={id} hidden={!expanded}>
        {expanded && (
          <>
            <ClockBreakdown
              rows={rows}
              regime={regime}
              t={t}
              onEvidence={onEvidence}
            />
            <p className="clock-small">{w("inspectionNote")}</p>
          </>
        )}
      </div>
    </article>
  );
}
