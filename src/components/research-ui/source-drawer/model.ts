/**
 * Pure display model for "Drawer" / "M-Drawer" in the unified research canvas (2026-11-17).
 * Builds six fixed sections: identity, source, times, transform, licence and links.
 * Supports ok/revised and identity-only withheld/retracted variants; fetching stays in the module.
 */
import type {ResearchState} from '../states';
import {DRAWER_SECTIONS, type DrawerSectionId, type DrawerText, type SourceDrawerInput} from './types';

export interface SectionRow {key: string; label: string; value: string | null; mono: boolean; href?: string; newTab?: boolean; state?: ResearchState; copy?: boolean}
export interface SectionModel {id: DrawerSectionId; no: 1|2|3|4|5|6; rows: SectionRow[]}
export type Labels = (key: string, values?: Record<string, string | number>) => string;
export function drawerSections(input: SourceDrawerInput, labels: Labels, text: DrawerText): SectionModel[] {
  const row = (key: string, value: string | null, mono = false, extra: Partial<SectionRow> = {}): SectionRow => ({key, label: labels(`fields.${key}`), value: value === '' ? null : value, mono, ...extra});
  if (input.variant === 'withheld' || input.variant === 'retracted') {
    return [{id: 'identity', no: 1, rows: [row('object', input.identity.label), row('evidenceId', input.identity.id, true),
      ...(input.variant === 'withheld' ? [row('reason', input.reason.text)] : [row('category', input.retraction.category), row('retractedAt', input.retraction.at, true)])]}];
  }
  const p = input.payload, e = input.extras;
  const moduleLabel = labels(`links.module.${p.kind}`);
  const rows: Record<DrawerSectionId, SectionRow[]> = {
    identity: [row('object', p.identity.label), row('evidenceId', p.identity.id, true), ...(e?.as_of !== undefined ? [row('asOf', e.as_of, true)] : [])],
    source: [row('publisher', p.source.publisher), ...(e?.relay !== undefined ? [row('relay', e.relay ?? labels('noRelay'))] : []),
      row('adapter', p.source.adapter), row('url', p.source.url, true, {href: p.source.url ?? undefined}), row('locator', p.source.locator, true), row('sha256', p.source.evidence_sha256, true, {href: e?.evidence_href, copy: true})],
    times: [row('period', p.times.period, true), row('availableAt', p.times.available_at, true), row('ingestedAt', p.times.ingested_at, true)],
    transform: [...(e?.transform_label !== undefined ? [row('transform', e.transform_label)] : []), row('methodVersion', p.transform.method_version, true), row('mappingVersion', p.transform.mapping_version, true), row('codeVersion', p.transform.code_version, true)],
    licence: [row('status', p.licence.status), row('note', text(p.licence.note_key)), row('attribution', text(p.attribution_key))],
    links: [{key: 'module', label: moduleLabel, value: moduleLabel, mono: false, href: p.links.module_href}, ...(e?.links ?? []).map((link, i) => ({key: `link-${i}`, label: link.label, value: link.label, mono: false, href: link.href, newTab: link.newTab}))],
  };
  return DRAWER_SECTIONS.map((id, i) => ({id, no: (i + 1) as SectionModel['no'], rows: [...rows[id], ...(e?.rows?.[id] ?? []).map(r => ({...r, mono: r.mono ?? false}))]}));
}
export function drawerHeader(input: SourceDrawerInput): {title: string; value: string | null; period: string | null; mark: 'fact' | 'judgment'; states: ResearchState[]} {
  if (input.variant === 'withheld' || input.variant === 'retracted') return {title: input.identity.label, value: null, period: null, mark: input.kind === 'judgment' ? 'judgment' : 'fact', states: [input.variant]};
  const e = input.extras;
  return {title: e?.title ?? input.payload.identity.label, value: e?.value ?? null, period: e?.period ?? input.payload.times.period, mark: e?.mark ?? (input.payload.kind === 'judgment' ? 'judgment' : 'fact'), states: [...new Set<ResearchState>([...(e?.states ?? []), ...(input.variant === 'revised' ? ['revised' as const] : [])])]};
}
export function drawerRevised(input: SourceDrawerInput) {
  return input.variant === 'revised' ? input.revised : null;
}
