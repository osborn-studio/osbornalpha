/* eslint-disable @next/next/no-html-link-for-pages -- Standalone esbuild preview has no Next router. */
/** Local-only preview, bundled by scripts/preview/macro-clock.ts; never mounted by Next. */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MacroRegimeClock } from "./MacroRegimeClock";
import { clockFrom, clockMetadataFrom, parseJudgments } from "./judgment-view";
import { clockRowsFrom } from "./clock-model";
import en from "../../../messages/en/macro.json";
import zh from "../../../messages/zh/macro.json";
import "../../app/globals.css";
import "./clock-preview.css";
function Preview() {
  const search = new URLSearchParams(location.search);
  const region = search.get("region") === "CN" ? "CN" : "US";
  const locale = search.get("locale") === "en" ? "en" : "zh";
  const mode = search.get("mode");
  const [data, setData] = useState<{
    snapshot: Record<string, unknown>;
    cards: unknown;
  } | null>(null);
  useEffect(() => {
    fetch(`/fixtures/${region}`)
      .then((r) => r.json())
      .then(setData);
  }, [region]);
  const t = (key: string, values?: Record<string, string | number>) => {
    const template = key
      .split(".")
      .reduce<unknown>(
        (v, k) => (v as Record<string, unknown>)?.[k],
        locale === "en" ? en : zh,
      );
    return typeof template === "string"
      ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(values?.[k]))
      : key;
  };
  const snapshot = data?.snapshot;
  const snap = snapshot?.snapshot as
    | { snapshot_id: string; as_of: string }
    | undefined;
  const parsed = parseJudgments(data?.cards);
  const cards = mode === "missing" ? [] : parsed.ok ? parsed.cards : [];
  if (mode === "abstained" && cards[0])
    cards[0] = { ...cards[0], lifecycle: "abstained" };
  const clock = clockFrom(
    cards,
    region,
    mode === "stale" ? "different" : snap?.snapshot_id,
  );
  const reason = clock.reason
    ? t(`judgment.clock.reasons.${clock.reason}`)
    : null;
  return (
    <main className="clock-preview-shell">
      <header className="preview-header">
        <span>
          OSBORN<span className="preview-gold">ALPHA</span>
        </span>
        <nav aria-label="Preview controls">
          {(["US", "CN"] as const).map((r) => (
            <a key={r} href={`?region=${r}&locale=${locale}`}>
              {t(`region.${r}`)}
            </a>
          ))}
          <a href={`?region=${region}&locale=${locale === "en" ? "zh" : "en"}`}>
            {locale === "en" ? "中文" : "EN"}
          </a>
          <button
            onClick={() =>
              document.documentElement.classList.toggle("theme-light")
            }
          >
            ◐ Theme
          </button>
        </nav>
      </header>
      <div className="preview-layout">
        <aside>
          <p>{locale === "en" ? "MACRO RESEARCH" : "宏观研究"}</p>
          <a href="#investment-clock">{t("judgment.widget.title")}</a>
          <a href="/macro?tab=indicators">{t("tabs.indicators")}</a>
          <a href="/macro?tab=correlation">{t("tabs.correlation")}</a>
          <a href="/macro/transmission">{t("tabs.transmission")}</a>
          <a href="/macro/history">{t("tabs.history")}</a>
        </aside>
        <div className="preview-content">
          <h1>{t("page.title")}</h1>
          <p className="preview-caption">
            {locale === "en"
              ? "Local component preview · captured DTOs · no production connection"
              : "本地组件预览 · 已采集 DTO · 无生产连接"}
          </p>
          <MacroRegimeClock
            key={`${region}:${mode}`}
            region={region}
            locale={locale}
            date={snap?.as_of}
            selected={clock.selected}
            reason={reason}
            card={clock.card}
            rows={
              mode === "empty"
                ? []
                : snap
                  ? clockRowsFrom(snapshot, snap.snapshot_id, locale)
                  : []
            }
            metadata={
              snap ? clockMetadataFrom(snapshot, snap.snapshot_id) : null
            }
            metadataLoading={!data}
            loading={!data || mode === "loading"}
            t={t}
          />
        </div>
      </div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
