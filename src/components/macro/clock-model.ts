import {catalogById} from '@/lib/macro/catalog';
import {RULES, RULES_VERSION} from '@/lib/macro/regime';
import type {Regime} from '@/lib/macro/judgment-contract';
import {basisFrom} from './judgment-view';
import {formatValueText} from './macro-format';

export const CLOCK_ORDER: readonly Regime[] = ['recovery','overheat','recession','stagflation'];
export interface ClockRow {
  seriesId: string; observationId: string; name: string; value: string | null; period: string | null;
  rule: string; ruleId: string; weight: number; contribution: Record<Regime, number>;
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Only immutable snapshot observations can supply values. Never substitute the latest overview. */
export function clockRowsFrom(json: unknown, snapshotId: string, locale: 'zh'|'en'): ClockRow[] {
  const basis = basisFrom(json, snapshotId);
  if (!basis || !object(json) || !object(json.snapshot)) return [];
  const manifest = Array.isArray(json.snapshot.observation_ids) ? json.snapshot.observation_ids : [];
  const observations = Array.isArray(json.observations) ? json.observations : [];
  return basis.map(c => {
    const def = catalogById(c.series_id);
    const obs = observations.find(o => object(o) && o.observation_id === c.observation_id && o.series_id === c.series_id && manifest.includes(o.observation_id));
    const valid = object(obs) && typeof obs.value_text === 'string' && obs.value_text.trim() !== '' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(obs.value_text) && Number.isFinite(Number(obs.value_text)) && typeof obs.period_end === 'string';
    const label = json.rulesVersion === RULES_VERSION ? Object.values(RULES).flat().find(r => r.id === c.rule_id)?.label[locale] : null;
    const unit = def?.unit === 'pct' || def?.unit === 'pct_yoy' ? '%' : def?.unit === 'index' ? '' : def?.unit ?? '';
    return {seriesId:c.series_id, observationId:c.observation_id, name:def?.name[locale] ?? (locale === 'zh' ? '未识别指标' : 'Unrecognized indicator'),
      value:valid ? formatValueText(obs.value_text as string) + unit : null, period:valid ? obs.period_end as string : null,
      rule:label ?? c.rule_id, ruleId:c.rule_id, weight:c.weight, contribution:c.contribution};
  });
}
export function quadrantRows(rows: ClockRow[], regime: Regime) {
  return rows.map(row => ({...row, amount:row.contribution[regime] ?? 0})).sort((a,b) => b.amount-a.amount || a.seriesId.localeCompare(b.seriesId));
}
