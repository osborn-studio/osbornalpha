// Pure macro provenance -> evidence-ref/1 display contract.
import type {SourceDrawerInput, DrawerText} from '../research-ui/source-drawer/types';
import type {DrawerTarget} from './SourceDrawer';
import type {MacroT} from './use-macro-t';
import {locatorText, pick, proofRows, revisionRows, type Locale, type VersionJson} from './view-model';
import {formatInstant} from './macro-format';

export function macroDrawerInput(target: DrawerTarget, version: VersionJson | null, versions: readonly VersionJson[] | null, t: MacroT, locale: Locale): SourceDrawerInput {
  const source = target.source;
  const adapter = version?.evidence?.adapter ?? source?.adapter;
  const sha = version?.evidence?.sha256 ?? null;
  const evidenceHref = sha ? `/api/macro/evidence/${sha}` : undefined;
  return {
    variant: 'ok',
    payload: {
      kind: 'macro_observation',
      identity: {id: target.observationId ?? version?.observation_id ?? target.seriesId, label: `${target.seriesId} · ${target.name}`},
      source: {publisher: source ? pick(source.publisher, locale) : t('drawer.missing'), adapter: adapter ? t(`drawer.adapters.${adapter}`) : t('drawer.missing'), url: version?.retrieval?.fetch_url ?? null, locator: locatorText(version?.locator ?? null, t), evidence_sha256: sha},
      times: {period: target.periodEnd, available_at: version ? formatInstant(version.available_at) : '', ingested_at: version?.retrieval ? formatInstant(version.retrieval.fetched_at) : null},
      transform: {code_version: version?.code_version ?? null, mapping_version: null, method_version: null},
      licence: {status: source ? t(`drawer.rightsValues.${source.rights}`) : t('drawer.missing'), note_key: source ? `macro:rights:${source.rights}` : 'macro:rights:missing'},
      attribution_key: 'macro:attribution',
      links: {module_href: `/macro/${encodeURIComponent(target.seriesId)}`},
    },
    extras: {
      title: target.name, value: target.display, period: target.periodEnd,
      relay: source ? (source.via ? pick(source.via, locale) : null) : undefined,
      evidence_href: evidenceHref, transform_label: version ? version.transform ?? t('drawer.none') : undefined,
      rows: {
        source: version?.retrieval ? proofRows(version, t).filter(row => ['host','toolVersions'].includes(row.key)).map(({key,label,value,mono}) => ({key,label,value,mono})) : [],
        times: [{key: 'basis', label: t('drawer.available'), value: t('drawer.basis')}],
      },
      revisions: versions ? revisionRows(versions, t, target.unit, target.observationId).map(row => ({period: target.periodEnd, value: row.value, available: row.available, version: `${row.version} · ${row.note}`, current: row.current})) : [],
      links: evidenceHref ? [{label: t('drawer.rawLink'), href: evidenceHref, newTab: true}] : [],
    },
  };
}
export function macroDrawerText(target: DrawerTarget, t: MacroT, locale: Locale): DrawerText {
  return key => {
    if (key === 'macro:attribution') return target.source ? pick(target.source.attribution, locale) : t('drawer.missing');
    if (key === 'macro:rights:missing') return t('drawer.missing');
    if (key.startsWith('macro:rights:')) return t(`drawer.rightsValues.${key.slice('macro:rights:'.length)}`);
    return key;
  };
}
