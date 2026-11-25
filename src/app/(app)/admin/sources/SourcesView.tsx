import { Fragment, type ReactNode } from 'react';
import type { AdminView } from '@/lib/sources/admin-view';
import { sourceByName } from '@/lib/sources/catalog';
import { Pill, STATUS_TONE, Table, Tile, type T } from '../dq/primitives';

type DisplayRow = { key:string; cells:ReactNode[] };

function Rows({ columns, rows, mobile, empty }: {
  columns:string[]; rows:DisplayRow[]; mobile:[number[],number[]]; empty:string;
}) {
  return <>
    <div className="hidden min-w-0 sm:block">
      <Table head={columns.map(label => ({ label }))} empty={empty}>
        {rows.map(({ key, cells }) => <tr key={key}>{cells.map((cell,i) =>
          <td key={columns[i]} className="px-2 py-2 align-top">{cell}</td>)}</tr>)}
      </Table>
    </div>
    <ul className="divide-y divide-border border-t border-border sm:hidden">
      {rows.map(({ key, cells }) => <li key={key} className="space-y-1.5 py-2.5 [overflow-wrap:anywhere]">
        {mobile.map((indices,line) => <div key={line} className={line
          ? 'flex flex-wrap items-center gap-1.5 text-xs text-text-dim'
          : 'flex flex-wrap items-center justify-between gap-2 text-sm font-medium'}>
          {indices.map(i => <span key={i} className="min-w-0">{cells[i]}</span>)}
        </div>)}
      </li>)}
    </ul>
  </>;
}

export function SourcesView({ view, t, locale }: { view:AdminView; t:T; locale:'en'|'zh' }) {
  const dash = t('dash');
  const mono = (value:ReactNode) => <span className="font-mono tabular-nums">{value}</span>;
  const name = (id:string) => sourceByName(id)?.name[locale] ?? (t.has(id) ? t(id) : id);
  const status = (key:string) => <Pill value={t('status.' + key)} tone={({
    unreadable:STATUS_TONE.error, unverified:STATUS_TONE.stale, pending:STATUS_TONE.stale,
    on:'text-text', confirmed:'text-text',
  })[key] ?? STATUS_TONE[key]} />;
  const config = (on:boolean) => <Pill value={t(on ? 'cfg_on' : 'cfg_off')} tone={on ? 'text-text' : 'text-text-muted'} />;
  const time = (at:string|null) => at === 'unreadable' ? status(at) : mono(at ?? dash);
  const section = (id:string, content:ReactNode) => <section aria-labelledby={'sources-' + id}
    className="min-w-0 space-y-3 rounded-md border border-border bg-bg-elevated p-3 sm:p-4">
    <h2 id={'sources-' + id} className="text-lg font-semibold">{t(id + '.title')} {subtitle(id + '.subtitle')}</h2>
    <p className="text-xs text-text-dim">{t(id + '.description')}</p>
    {content}
  </section>;
  const subtitle = (key:string) => locale === 'zh' && <span className="hidden text-sm font-normal text-text-muted sm:inline">{t(key)}</span>;
  const table = (id:string, columns:string[], rows:DisplayRow[], mobile:[number[],number[]]) =>
    <Rows columns={columns.map(c => t(id + '.columns.' + c))} rows={rows} mobile={mobile} empty={dash} />;

  const live = view.live.map(({domain,markets,sources}) => {
    const order = <div className="flex flex-wrap items-center gap-1">
      {sources.map((id,i) => {
        const source = sourceByName(id);
        const optional = source?.id === 'datagateway' || source?.id === 'eodhd';
        return <Fragment key={id}>
          {i > 0 && <span aria-hidden="true" className="text-text-muted">→</span>}
          <Pill value={`${i === 0 ? t('first') : i+1} ${source?.name[locale] ?? id}${optional ? '*' : ''}`}
            tone={!source ? 'text-warn' : i === 0 ? 'text-text' : 'text-text-dim'} />
        </Fragment>;
      })}
      {!sources.length && dash}
      {sources.length === 1 && (domain === 'back' || (domain === 'daily' && markets.includes('JP'))) &&
        <span className="text-xs text-text-muted">{t(domain === 'back' ? 'only_verified' : 'sole')}</span>}
    </div>;
    return { key:domain + markets.join(), cells:[t('route.' + domain), mono(markets.join(' · ')), order, t('health_na')] };
  });
  const datasets = view.datasets.map(d => ({
    key:d.dataset, cells:[mono(d.dataset), d.sources.map(name).join(' · ') || dash, mono(d.producer),
      t('cadence.' + d.cadence), status(d.freshness), time(d.lastSuccess),
      (d.licences.length ? d.licences : ['na']).map(s => <Fragment key={s}>{status(s)} </Fragment>)],
  }));
  const frozen = view.frozen.map(r => ({ key:r.key, cells:[mono(r.kind), name(r.origin), status(r.status), mono(r.methods.join(' · ') || dash)] }));
  const licences = [
    ...view.industryRows.map(r => ({ group:'industry_dataset_licenses', ...r })),
    ...view.frozen.map(r => ({ group:'methodologies_licenses_json', ...r })),
    ...view.macro.map(r => ({ group:'macro_catalog_rights', ...r, at:null,
      key:t('series', { rights:r.key === 'third_party' ? t(r.key) : r.key, n:r.count }) })),
  ].map(r => ({ key:r.group + r.key, cells:[t('place.' + r.group), mono(r.key), status(r.status), time(r.status === 'unreadable' ? 'unreadable' : r.at)] }));
  const catalogue = view.catalogue.map(s => ({
    key:s.id, cells:[<strong key="name">{s.name[locale]}</strong>, s.domains.map(d => t('domains.' + d)).join(' · '),
      s.credentials.length ? s.credentials.map(c => <div key={c.name}>{mono(c.name)} {config(c.configured)}</div>) : dash,
      mono(s.pacing === null ? t('none') : t('ms',{ n:s.pacing })), s.place === 'none' ? dash : t('place.' + s.place)],
  }));

  return <div data-density="data" className="mx-auto w-full min-w-0 max-w-7xl space-y-4">
    <header className="space-y-2">
      <p className="text-xs text-text-muted">{t('crumb')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{t('title')} {subtitle('subtitle')}</h1>
        <Pill value={t('admin')} /><Pill value={t('ro')} />
      </div>
      <p className="max-w-4xl text-sm text-text-dim">{t('lead')}</p>
    </header>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {Object.entries(view.tiles).map(([id,value]) => <Tile key={id} label={t('tiles.' + id + '.label')} value={mono(value ?? dash)}
        note={<span className="hidden sm:inline">{t('tiles.' + id + '.note')}</span>} />)}
    </div>
    {view.partial && <aside role="status" className="rounded border border-border p-3 text-sm text-warn">
      <strong>{t('st_err_t')}</strong>{view.freshnessFailed && <p>{t('st_err_b')}</p>}
    </aside>}
    {section('a', <>
      {table('a',['domain','market','order','health'],live,[[0,1],[2]])}
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-dim"><span>* {t('cond')}</span>
        {Object.entries(view.configured).map(([key,on]) => <span key={key}>{t(key)} {config(on)}</span>)}
      </div>
      <p className="rounded border border-border bg-bg-card p-2 text-xs text-text-dim">{t('health_note')}</p>
    </>)}
    {section('b', <>
      {view.hasBatches === false && <p className="text-sm text-text-dim">{t('st_empty')}</p>}
      {table('b',['dataset','source','producer','cadence','freshness','lastSuccess','licence'],datasets,[[0,4],[1,3,5,6]])}
    </>)}
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      {section('c',table('c',['kind','source','licence','method'],frozen,[[0,2],[1,3]]))}
      {section('l',table('l',['place','key','status','at'],licences,[[0,2],[1]]))}
    </div>
    {section('d',table('d',['source','capabilities','credential','pacing','place'],catalogue,[[0,3],[1,2]]))}
  </div>;
}
