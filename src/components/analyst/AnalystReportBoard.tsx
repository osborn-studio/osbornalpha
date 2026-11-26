'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui';
import type { AnalystReport, ReportRecommendation } from '@/lib/analyst/report-types';
import { toBeijingDateTimeInput } from '@/lib/analyst/recommendation-time';
import { currencyCodeOfMarket } from '@/lib/utils';
import { reportAnalysis, reportMarkdown, reportNumber, reportRate, reportTime, selectReport } from '@/lib/analyst/report-view';
import s from './analyst-report-board.module.css';

const pageSize = 12;
type Ledger = 'recommendations' | 'trades';
type BoardProps = { data: AnalystReport; refresh?: () => void; refreshing?: boolean; backLink?: ReactNode };

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className={s.metric}><dt>{label}</dt><dd>{value}</dd><span>{detail}</span></div>;
}

function Table({ headers, children, caption }: { headers: string[]; children: ReactNode; caption: string }) {
  return <div className={s.tableWrap} tabIndex={0} role="region" aria-label={caption}>
    <table><caption className="sr-only">{caption}</caption><thead><tr>{headers.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{children}</tbody></table>
  </div>;
}

function Coverage({ label, count, total }: { label: string; count: number; total: number }) {
  return <div className={s.coverage}><div><span>{label}</span><span className={s.number}>{count} / {total}</span></div>
    <div className={s.track} aria-hidden="true"><i style={{ width: (total ? 100 * count / total : 0) + '%' }} /></div></div>;
}

export function AnalystReportBoard({ data, refresh, refreshing = false, backLink }: BoardProps) {
  const t = useTranslations('analyst');
  const locale = useLocale();
  const [selection, setSelection] = useState('');
  const [ledger, setLedger] = useState<Ledger>('recommendations');
  const [page, setPage] = useState(1);
  const [reportOpen, setReportOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const analystId = data.analysts.some(a => a.id === selection) ? selection : '';
  const view = useMemo(() => selectReport(data, analystId), [data, analystId]);
  const stats = view.stats;
  const scope = view.byAnalyst.get(analystId)?.analyst.name ?? t('report.all');
  const totalRows = ledger === 'recommendations' ? view.recommendations.length : view.trades.length;
  const pages = Math.max(1, Math.ceil(totalRows / pageSize));
  const displayedPage = Math.min(page, pages);
  const start = (displayedPage - 1) * pageSize;
  const detail = detailId ? view.recById.get(detailId) : undefined;
  const detailTrades = detail ? view.trades.filter(r => r.recommendationId === detail.id) : [];
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 8 });
  const money = (v: number | null) => v === null ? '—' : num.format(v);
  const time = (iso: string) => reportTime(iso, locale);
  const analystName = (id: string) => view.byAnalyst.get(id)?.analyst.name ?? '—';
  const hit = (r: ReportRecommendation) => r.hit === null ? '—' : t(r.hit ? 'report.yes' : 'report.no');
  const header = (keys: string[]) => keys.map(k => t('report.' + k));

  function changeAnalyst(id: string) {
    setSelection(id); setPage(1); setDetailId(null); setReportOpen(false);
  }
  function changeLedger(next: Ledger) {
    setLedger(next); setPage(1); setDetailId(null);
  }
  function download() {
    const text = reportMarkdown(view, scope, data.generatedAt, locale, t);
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'osborn-analyst-report-' + toBeijingDateTimeInput(data.generatedAt).slice(0,10) + '.md';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className={s.board}>
    <header className={s.header}>
      <div>{backLink && <div className={s.back}>{backLink}</div>}
        <h1>{t('report.title')}</h1><p>{t('report.subtitle')}</p></div>
      <div className={s.headerActions}>
        {refresh && <Button variant="secondary" disabled={refreshing} onClick={refresh}>{t(refreshing ? 'report.refreshing' : 'report.refresh')}</Button>}
        <Button onClick={() => setReportOpen(!reportOpen)} aria-expanded={reportOpen} aria-controls="analyst-written-report">
          {t(reportOpen ? 'report.closeReport' : 'report.generate')}
        </Button>
      </div>
    </header>

    <div className={s.filters}>
      <label>{t('report.analyst')}<select value={analystId} onChange={e => changeAnalyst(e.target.value)}>
        <option value="">{t('report.all')}</option>
        {data.analysts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select></label>
      <small>{t('report.asOf', { time: time(data.generatedAt) })}</small>
    </div>

    {reportOpen && <section id="analyst-written-report" className={s.written} aria-live="polite">
      <div className={s.sectionHead}><div><h2>{t('report.analysis.title')}</h2><small>{scope} · {t('report.asOf', { time: time(data.generatedAt) })}</small></div>
        <Button size="sm" variant="secondary" onClick={download}>{t('report.download')}</Button></div>
      <ul>{reportAnalysis(view, t).map(line => <li key={line}>{line}</li>)}</ul>
    </section>}

    <dl className={s.metrics}>
      <Metric label={t('report.registered')} value={String(stats.registered)} detail={t('report.activeCounts', { active: stats.active, withdrawn: stats.withdrawn })} />
      <Metric label={t('report.hitRate')} value={reportRate(stats.hitRate)} detail={t('report.hitCounts', { hits: stats.hits, n: stats.assessed })} />
      <Metric label={t('report.avgScore')} value={reportNumber(stats.average)} detail={t('report.scoreCount', { n: stats.scored })} />
      <Metric label={t('report.trades')} value={String(stats.fills)} detail={t('report.tradeCount', { n: stats.executedRecommendations })} />
    </dl>

    <div className={s.summary}>
      <section className={s.panel}><div className={s.sectionHead}><h2>{t('report.members')}</h2></div>
        {view.members.length ? <Table caption={t('report.members')} headers={header(['analyst','registered','hitRate','avgScore','fills'])}>
          {view.members.map(a => <tr key={a.id}><th scope="row">{a.name}</th><td>{a.stats.registered}</td>
            <td>{reportRate(a.stats.hitRate)}</td><td>{reportNumber(a.stats.average)}</td><td>{a.stats.fills}</td></tr>)}
        </Table> : <p className={s.empty}>{t('report.noMembers')}</p>}
      </section>
      <section className={s.panel}><div className={s.sectionHead}><h2>{t('report.coverage')}</h2></div>
        <Coverage label={t('report.scored')} count={stats.scored} total={stats.active} />
        <Coverage label={t('report.assessed')} count={stats.assessed} total={stats.active} />
        <p className={s.method}>{t('report.method')}</p>
      </section>
    </div>

    <section className={s.panel}>
      <div className={s.sectionHead}><h2>{t('report.ledger')}</h2><small>{t('report.beijing')}</small></div>
      <div className={s.tabs} role="group" aria-label={t('report.ledger')}>
        {(['recommendations','trades'] as const).map(k => <button type="button" key={k} onClick={() => changeLedger(k)} aria-pressed={ledger === k}>
          {t('report.' + k)} <span>{k === 'recommendations' ? stats.registered : stats.fills}</span>
        </button>)}
      </div>
      {totalRows === 0 ? <p className={s.empty}>{t(ledger === 'recommendations' ? 'report.noRecs' : 'report.noTrades')}</p> :
        ledger === 'recommendations' ? <Table caption={t('report.recommendations')} headers={header(['ticker','analyst','time','action','status','score','hit','fills'])}>
          {view.recommendations.slice(start, start+pageSize).map(r => <tr key={r.id}>
            <th scope="row"><button type="button" className={s.rowLink} onClick={() => setDetailId(r.id)} aria-label={t('report.openRec', { ticker:r.ticker, time:time(r.recommendedAt) })}>{r.ticker}</button></th>
            <td>{analystName(r.analystId)}</td><td>{time(r.recommendedAt)}</td><td>{t('action.' + r.action)}</td>
            <td>{t(r.withdrawnAt ? 'report.withdrawn' : 'report.active')}</td><td>{reportNumber(r.score)}</td><td>{hit(r)}</td><td>{view.fillCounts.get(r.id) ?? 0}</td>
          </tr>)}
        </Table> : <Table caption={t('report.trades')} headers={header(['ticker','analyst','time','action','quantity','price','fee','source'])}>
          {view.trades.slice(start, start+pageSize).map(r => <tr key={r.id}><th scope="row">{r.ticker}</th><td>{analystName(r.analystId)}</td>
            <td>{time(r.executedAt)}</td><td>{t('action.' + r.direction)}</td><td>{money(r.quantity)}</td><td>{money(r.price)} {r.currency}</td><td>{money(r.fee)} {r.currency}</td>
            <td><button type="button" className={s.rowLink} onClick={() => setDetailId(r.recommendationId)}>{t('report.viewSource')}</button></td></tr>)}
        </Table>}
      {pages > 1 && <div className={s.pagination}><span>{t('report.page', { page:displayedPage, pages })}</span>
        <Button size="sm" variant="secondary" disabled={displayedPage === 1} onClick={() => setPage(displayedPage-1)}>{t('report.previous')}</Button>
        <Button size="sm" variant="secondary" disabled={displayedPage === pages} onClick={() => setPage(displayedPage+1)}>{t('report.next')}</Button></div>}
      {detail && <div className={s.detail} aria-live="polite">
        <div className={s.sectionHead}><div><h3>{t('report.detail')} · {detail.ticker}</h3><small>{analystName(detail.analystId)} · {time(detail.recommendedAt)} · {t('action.' + detail.action)} · {currencyCodeOfMarket(detail.market)}</small></div>
          <Button size="sm" variant="secondary" onClick={() => setDetailId(null)}>{t('report.close')}</Button></div>
        <dl className={s.detailGrid}>
          {[['reference', money(detail.referencePrice)], ['target', money(detail.targetPrice)], ['stop', money(detail.stopLoss)],
            ['d5', reportRate(detail.forward5dPct)], ['d20', reportRate(detail.forward20dPct)], ['d60', reportRate(detail.forward60dPct)]].map(([label,value]) =>
            <div key={label}><dt>{t('report.' + label)}</dt><dd>{value}</dd></div>)}
        </dl><small>{t('report.id')} <code>{detail.id}</code></small>
        {detailTrades.length ? <ul>{detailTrades.map(r => <li key={r.id}>{time(r.executedAt)} · {t('action.'+r.direction)} · {money(r.quantity)} × {money(r.price)} {r.currency} · <code>{r.id}</code></li>)}</ul> :
          <p>{t('report.noRecTrades')}</p>}
      </div>}
    </section>
  </div>;
}
