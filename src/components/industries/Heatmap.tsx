// src/components/industries/Heatmap.tsx
// List heatmap (spec §8.2; canvas "Main", "M-List"): rows = industries (name → detail page), columns
// = period ends, every cell a button that opens the source drawer. Single brass hue at alpha
// 0.12–0.6 with the value overprinted; counts instead of values below the display thresholds; '—'
// with the reason for missing cells. Below 640px only the last 5 columns render (no horizontal page
// scroll). The table view of the same series is one click away (`tableHref`).
import type {CSSProperties} from 'react';
import Link from 'next/link';
import {useLocale,useTranslations} from 'next-intl';
import type {NodeView,PublicCell,RunHeader} from '@/lib/industry/read';
import type {AggMetric,Scheme} from '@/lib/industry/types';
import {CoverageCell} from './CoverageCell';
import {SourceButton} from './SourceDrawer';
import {brassBackground,heatmapModel,ALPHA_MAX,ALPHA_MIN} from './heatmap-model';
import {industryPath,nodeName} from './hrefs';

export function Heatmap({scheme,nodes,periodEnds,cells,metric,header,preview,tableHref}:{scheme:Scheme;nodes:NodeView[];periodEnds:string[];cells:PublicCell[];metric:AggMetric;header:RunHeader;preview:boolean;tableHref:string}){
  const t=useTranslations('industries');
  const locale=useLocale()==='en'?'en':'zh';
  const rows=heatmapModel(nodes,periodEnds,cells,metric,locale);
  const cols=periodEnds.length,mcols=Math.min(5,cols);
  const grid='grid items-center gap-[3px] grid-cols-[112px_repeat(var(--mcols),minmax(0,1fr))] sm:grid-cols-[196px_repeat(var(--cols),minmax(0,1fr))]';
  const style={'--cols':String(cols),'--mcols':String(mcols)} as CSSProperties;
  const steps=[0,1,2,3,4].map(i=>ALPHA_MIN+(ALPHA_MAX-ALPHA_MIN)*i/4);
  return (
    <section aria-label={t('heatmap.label')} className="card-base" style={{padding:'16px 16px 12px'}}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-dim">
        <span className="inline-flex items-center gap-1.5">{t('coverage.legendLow')}
          <span className="inline-flex gap-0.5">{steps.map(a=><i key={a} className="inline-block h-3 w-[18px] rounded-[2px]" style={{background:brassBackground(a)}} />)}</span>
          {t('coverage.legendHigh')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="rounded-[3px] border border-dashed border-text-dim px-1 font-mono">6/9</span>{t('coverage.legendInsufficient')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="rounded-[3px] border border-dashed border-warn px-1 font-mono text-warn">{t('coverage.unresolved',{n:3})}</span>{t('coverage.legendUnresolved')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="font-mono">—</span>{t('coverage.legendMissing')}</span>
        <Link href={tableHref} className="ml-auto">{t('table.label')} →</Link>
      </div>
      <div className={grid} style={style}>
        <div className="pl-1 text-[10px] uppercase tracking-wide text-text-dim">{t('heatmap.industry')}</div>
        {periodEnds.map((pe,i)=>(
          <div key={pe} className={`text-center font-mono text-[11px] tabular-nums text-text-dim ${i<cols-mcols?'hidden sm:block':''}`}>{pe.endsWith('-12-31')?pe.slice(0,4):pe.slice(0,7)}</div>
        ))}
      </div>
      <div className="mt-1.5 flex flex-col gap-[3px]">
        {rows.map(r=>{
          const name=nodeName(r.node,locale);
          return (
            <div key={r.node.code} className={grid} style={style}>
              <Link href={industryPath(scheme,r.node.code)} className="flex min-w-0 items-baseline gap-2 pl-1 text-[13px] text-text hover:text-accent">
                <span className="truncate">{name}</span><span className="hidden font-mono text-[11px] text-text-dim sm:inline">{r.node.code}</span>
              </Link>
              {r.cells.map(c=>{
                const title=t('heatmap.cellTitle',{industry:name,period:c.periodEnd,metric:t(`metrics.${metric}`)});
                const base=`min-h-[28px] w-full rounded-[3px] px-0.5 text-center font-mono text-[12px] tabular-nums ${c.mobileHidden?'hidden sm:flex':'flex'} items-center justify-center`;
                if(!c.cell)return <span key={c.periodEnd} title={title} className={`${base} border border-border text-text-dim`}><CoverageCell cell={null} metric={metric} /></span>;
                return (
                  <SourceButton key={c.periodEnd} label={title} className={`${base} ${c.text.kind==='value'?'text-text':'border border-border'}`}
                    style={c.alpha!==null?{background:brassBackground(c.alpha)}:undefined}
                    payload={{kind:'aggregate',scheme,code:r.node.code,nodeName:name,cell:c.cell,header,preview}}>
                    <CoverageCell cell={c.cell} metric={metric} />
                  </SourceButton>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-text-dim">{t('heatmap.caption')} <span className="sm:hidden">{t('heatmap.mobileNote')}</span></p>
    </section>
  );
}
