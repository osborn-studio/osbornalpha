"use client";
import { useEffect, useState } from "react";
import { clockRowsFrom, type ClockRow } from "./clock-model";
import { catalogById } from "@/lib/macro/catalog";
import { SourceDrawer, type DrawerTarget } from "./SourceDrawer";
import {
  basisFrom,
  clockFrom,
  clockMetadataFrom,
  parseJudgments,
  type ClockMetadata,
  type ClockView,
  type JudgmentCard,
} from "./judgment-view";
import { MacroRegimeClock } from "./MacroRegimeClock";
import { useMacroT, type MacroT } from "./use-macro-t";
import { type Locale } from "./view-model";

type SlotState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ok"; cards: JudgmentCard[] };

type BasisState =
  | { rows: ClockRow[]; metadata: ClockMetadata | null; date?: string }
  | null
  | "error";

/** One request supplies both the adjacent limitations and the expandable evidence table. */
function BoundClock({
  clock,
  reason,
  t,
  locale,
  region,
  loading,
  onRefresh,
}: {
  clock: ClockView;
  reason: string | null;
  t: MacroT;
  locale: Locale;
  region: "US" | "CN";
  loading: boolean;
  onRefresh: () => void;
}) {
  const snapshotId = clock.card?.input_snapshot_id;
  const [rows, setRows] = useState<BasisState>(null);
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);
  useEffect(() => {
    if (!snapshotId) return;
    let cancelled = false;
    fetch(`/api/macro/snapshots/${encodeURIComponent(snapshotId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((j) => {
        const basis = basisFrom(j, snapshotId);
        if (!cancelled)
          setRows(
            basis === null
              ? "error"
              : {
                  rows: clockRowsFrom(j, snapshotId, locale),
                  metadata: clockMetadataFrom(j, snapshotId),
                  date:
                    typeof j.snapshot?.as_of === "string"
                      ? j.snapshot.as_of
                      : undefined,
                },
          );
      })
      .catch(() => {
        if (!cancelled) setRows("error");
      });
    return () => {
      cancelled = true;
    };
  }, [snapshotId, locale]);
  const evidence = (row: ClockRow) => {
    if (row.period && row.value)
      setDrawer({
        seriesId: row.seriesId,
        observationId: row.observationId,
        name: row.name,
        periodEnd: row.period,
        display: row.value,
        unit: catalogById(row.seriesId)?.unit ?? "",
        source: (() => {
          const source = catalogById(row.seriesId)?.source;
          return source
            ? {
                ...source,
                fetch_host: source.fetchHost,
                via: source.via ?? null,
              }
            : null;
        })(),
      });
  };
  return (
    <>
      <MacroRegimeClock
        selected={clock.selected}
        reason={reason}
        metadata={rows && rows !== "error" ? rows.metadata : null}
        metadataLoading={!!snapshotId && rows === null}
        t={t}
        region={region}
        locale={locale}
        date={rows && rows !== "error" ? rows.date : undefined}
        rows={rows && rows !== "error" ? rows.rows : []}
        card={clock.card}
        loading={loading}
        onRefresh={onRefresh}
        onEvidence={evidence}
      />
      <SourceDrawer
        target={drawer}
        onClose={() => setDrawer(null)}
        t={t}
        locale={locale}
      />
    </>
  );
}

export function MacroJudgmentSlot({
  region,
  snapshotId,
}: {
  region: "US" | "CN";
  snapshotId?: string | null;
}) {
  const { t, locale } = useMacroT();
  const open = true;
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!open) return;
    const refresh = () => setNonce((n) => n + 1);
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [open]);
  const [state, setState] = useState<SlotState>({ status: "idle" });
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ status: "loading" });
    fetch(
      `/api/judgments?subject_type=macro_region&subject_key=${region}&types=macro_regime&view=latest&include_abstained=1`,
      { cache: "no-store" },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((j) => {
        if (cancelled) return;
        const parsed = parseJudgments(j);
        setState(
          parsed.ok
            ? { status: "ok", cards: parsed.cards }
            : { status: "unavailable" },
        );
      })
      .catch(() => {
        if (!cancelled) setState({ status: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [open, region, nonce]);
  const clock = clockFrom(
    state.status === "ok" ? state.cards : [],
    region,
    snapshotId,
  );
  const reason =
    state.status === "loading" || state.status === "idle"
      ? t("judgment.loading")
      : state.status === "unavailable"
        ? t("judgment.unavailable")
        : clock.reason
          ? t(`judgment.clock.reasons.${clock.reason}`) +
            (clock.card?.abstain_reason ? `: ${clock.card.abstain_reason}` : "")
          : null;
  return (
    <div>
      {state.status === "unavailable" && (
        <div role="status" className="mb-3 text-xs text-text-dim">
          {t("judgment.unavailable")} · {t("judgment.unavailableNote")}
        </div>
      )}
      <BoundClock
        key={`${clock.card?.judgment_id}:${clock.card?.input_snapshot_id}`}
        clock={clock}
        reason={reason}
        t={t}
        locale={locale}
        region={region}
        loading={state.status === "idle" || state.status === "loading"}
        onRefresh={() => setNonce((n) => n + 1)}
      />
    </div>
  );
}
