// src/components/industries/ValuationSnapshot.tsx
// Valuation section of the list and detail pages (spec §6.4, §8.2–8.3; canvas "Main" valuation table,
// "States" valuation states). Only published cells are ever shown. In this plan the valuation
// pipeline is deferred (verification items 1/2), so the usual state is "not enabled"; an active run
// with nothing published in the window says so; published cells render as source buttons, the
// percentile column stays "not enabled" until §6.5 lands.
import {useLocale,useTranslations} from 'next-intl';
import {formatValuation,percentText} from '@/lib/industry/display';
import type {NodeView,ValuationBlock} from '@/lib/industry/read';
import type {Scheme} from '@/lib/industry/types';
import {PercentileBar} from './PercentileBar';
import {SourceButton} from './SourceDrawer';
import {StateNotice} from './StateNotice';
import {nodeName} from './hrefs';

export function ValuationSnapshot({scheme,nodes,block,preview,title}:{scheme:Scheme;nodes:NodeView[];block:ValuationBlock;preview:boolean;title:'title'|'titleDetail'}){
  const t=useTranslations('industries.valuation');
  const tc=useTranslations('industries');
  const locale=useLocale()==='en'?'en':'zh';
  return (
    <section aria-label={t(title)} className="card-base" data-valuation-state={block.state}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{t(title)}</h2>
        <span className="rounded-[4px] border border-border px-2 py-0.5 text-xs text-text-dim">{t('publishedOnly')}</span>
      </div>
      {block.state==='not_enabled'&&<StateNotice kind="notEnabled" />}
      {block.state==='unpublished'&&<StateNotice kind="partialUnpublished" />}
      {block.state==='published'&&(
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-text-dim"><th className="py-1.5 font-normal">{t('industry')}</th><th className="py-1.5 text-right font-normal">{t('pe')}</th><th className="py-1.5 text-right font-normal">{t('pb')}</th><th className="hidden py-1.5 font-normal sm:table-cell">{t('percentile')}</th><th className="py-1.5 text-right font-normal">{t('mcapCoverage')}</th><th className="hidden py-1.5 font-normal sm:table-cell">{t('date')}</th></tr></thead>
          <tbody>
            {nodes.map(n=>{
              // One snapshot date per industry, never an older metric silently backfilled into
              // a newer row. Detail returns history; list may already reduce to latest per metric.
              const cells=block.cells.filter(c=>c.code===n.code&&(c.metric==='pe_ttm'||c.metric==='pb'));
              const date=cells.reduce((latest,c)=>c.tradeDate>latest?c.tradeDate:latest,'');
              if(!date)return null;
              const pe=cells.find(c=>c.tradeDate===date&&c.metric==='pe_ttm'),pb=cells.find(c=>c.tradeDate===date&&c.metric==='pb');
              const name=nodeName(n,locale);
              // Spec §6.3 requires facts_as_of = D. Fail closed on inconsistent published input.
              const compatible=(c:typeof pe)=>c?.factsAsOf===date;
              const cellBtn=(c:typeof pe)=>{
                if(!c)return <span className="font-mono text-text-dim">{t('unpublished')}</span>;
                if(!compatible(c))return <span className="text-xs text-text-dim">— {tc('drawer.factsAsOf')}: {c.factsAsOf} ≠ {date}</span>;
                return <SourceButton payload={{kind:'valuation',scheme,code:n.code,nodeName:name,runId:block.runId,cell:c,preview}} label={tc('heatmap.cellTitle',{industry:name,period:c.tradeDate,metric:c.metric==='pb'?t('pb'):t('pe'),value:formatValuation(c.metric,c.value,locale)})}>{formatValuation(c.metric,c.value,locale)}</SourceButton>;
              };
              const coverage=(c:typeof pe)=>c&&compatible(c)&&c.mcapCoverage!==null?`${percentText(c.mcapCoverage)}%`:'—';
              return (
                <tr key={n.code} className="border-t border-border">
                  <td className="py-1.5">{name}</td>
                  <td className="py-1.5 text-right">{cellBtn(pe)}</td>
                  <td className="py-1.5 text-right">{cellBtn(pb)}</td>
                  <td className="hidden py-1.5 sm:table-cell"><PercentileBar value={null} width="w-[96px]" /><span className="ml-2 text-xs text-text-dim">{t('percentileDeferred')}</span></td>
                  <td className="py-1.5 text-right font-mono text-xs tabular-nums text-text-dim"><div>{t('pe')}: {coverage(pe)}</div><div>{t('pb')}: {coverage(pb)}</div></td>
                  <td className="hidden py-1.5 font-mono text-xs tabular-nums text-text-dim sm:table-cell">{date}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
