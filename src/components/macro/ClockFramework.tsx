import type { JudgmentCard } from "./judgment-view";
import type { MacroT } from "./use-macro-t";
import { CLOCK_ORDER } from "./clock-model";
export function ClockFramework({
  t,
  card,
  auditOnly = false,
}: {
  t: MacroT;
  card?: JudgmentCard | null;
  auditOnly?: boolean;
}) {
  const w = (key: string) => t(`judgment.widget.${key}`);
  return (
    <footer className="clock-footer">
      {!auditOnly && <div>
        <h3>{w("framework")}</h3>
        <p className="clock-small">{w("frameworkNote")}</p>
      </div>}
      {!auditOnly && <div className="clock-scenarios">
        {CLOCK_ORDER.map((r) => (
          <div key={r}>
            <h4>
              {t(`judgment.clock.${r}`)} · {w("signals")}
            </h4>
            <p>{w(`${r}.watch`)}</p>
          </div>
        ))}
      </div>}
      <div className="clock-audit-row">
        <a href={card?.methodology.href ?? "/macro?tab=methodology"}>
          {w("method")} ↗
        </a>
        {card && (
          <details>
            <summary>{w("audit")}</summary>
            <dl>
              <dt>{t("judgment.snapshot")}</dt>
              <dd>{card.input_snapshot_id ?? "—"}</dd>
              <dt>{t("judgment.asOf")}</dt>
              <dd>{card.as_of}</dd>
              <dt>{t("judgment.lifecycle")}</dt>
              <dd>{t(`judgment.lifecycles.${card.lifecycle}`)}</dd>
              <dt>{t("judgment.calibration")}</dt>
              <dd>{card.calibration}</dd>
              <dt>ID</dt>
              <dd>{card.judgment_id}</dd>
            </dl>
          </details>
        )}
        {!auditOnly && <span className="clock-small">{w("raw")} ≠ %</span>}
      </div>
    </footer>
  );
}
