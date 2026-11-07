// MacroKeyRows — key indicator rows shared by the Today glance and the /intel card (spec §3.5, canvas TodayGlance2):
// status dot · name · period | value | neutral change. Missing reads 缺失.
import type { MacroT } from './use-macro-t';
import { statusKey, type glanceRows } from './view-model';

export function MacroKeyRows({ groups, t }: { groups: ReturnType<typeof glanceRows>; t: MacroT }) {
  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <div key={g.region}>
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-text-dim">
            <span>{t(`region.${g.region}`)}</span>
            <span className="font-mono normal-case">
              {g.asOf ? t('glance.snapshot', { date: g.asOf }) : t('header.noSnapshot')} · {t(`collection.${g.overall}`)}
            </span>
          </div>
          {g.rows.map((r) => {
            const dot = r.muted ? 'border border-text-dim' : r.timeliness === 'late' ? 'bg-warn' : 'bg-accent';
            return (
              <div key={r.seriesId} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-2 py-0.5 text-[11px]">
                <span className="truncate text-text-dim">
                  <span aria-hidden="true" className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
                  <span className="sr-only">{t('glance.statusLabel', { status: t(statusKey(r)) })}</span>
                  {r.name} <span className="font-mono">{r.period}</span>
                </span>
                <span className="font-mono tabular-nums">{r.muted ? t('glance.missing') : `${r.value}${r.unit}`}</span>
                <span className="font-mono tabular-nums text-text-dim">{r.change ? `${r.change.arrow} ${r.change.text}` : '—'}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
