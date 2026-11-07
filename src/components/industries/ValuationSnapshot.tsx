// src/components/industries/ValuationSnapshot.tsx
// Valuation section of the list and detail pages (spec §6.4, §8.2–8.3; canvas "Main" valuation table,
// "States" valuation states). Only published cells are ever shown. In this plan the valuation
// pipeline is deferred (verification items 1/2), so the usual state is "not enabled"; an active run
// with nothing published in the window says so; published cells render as source buttons, the
// percentile column stays "not enabled" until §6.5 lands.
import {useLocale,useTranslations} from 'next-intl';
import {formatValuation} from '@/lib/industry/display';
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
              const pe=block.cells.find(c=>c.code===n.code&&c.metric==='pe_ttm'),pb=block.cells.find(c=>c.code===n.code&&c.metric==='pb');
              if(!pe&&!pb)return null;
              const name=nodeName(n,locale);
              const cellBtn=(c:typeof pe)=>c?<SourceButton payload={{kind:'valuation',scheme,code:n.code,nodeName:name,runId:block.runId,cell:c,preview}} label={tc('heatmap.cellTitle',{industry:name,period:c.tradeDate,metric:c.metric==='pb'?t('pb'):t('pe'),value:formatValuation(c.metric,c.value,locale)})}>{formatValuation(c.metric,c.value,locale)}</SourceButton>:<span className="font-mono text-text-dim">{t('unpublished')}</span>;
              return (
                <tr key={n.code} className="border-t border-border">
                  <td className="py-1.5">{name}</td>
                  <td className="py-1.5 text-right">{cellBtn(pe)}</td>
                  <td className="py-1.5 text-right">{cellBtn(pb)}</td>
                  <td className="hidden py-1.5 sm:table-cell"><PercentileBar value={null} width="w-[96px]" /><span className="ml-2 text-xs text-text-dim">{t('percentileDeferred')}</span></td>
                  <td className="py-1.5 text-right font-mono text-xs tabular-nums text-text-dim">{(pe??pb)?.mcapCoverage??'—'}</td>
                  <td className="hidden py-1.5 font-mono text-xs tabular-nums text-text-dim sm:table-cell">{(pe??pb)?.tradeDate}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
