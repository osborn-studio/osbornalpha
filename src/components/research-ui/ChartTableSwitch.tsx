'use client';
// Accessible chart/table pair; section charts supply both views and optional narrow-screen defaults.
import {useEffect,useState,type ReactNode} from 'react';
import {useTranslations} from 'next-intl';
export interface ChartTableSwitchProps {chart:ReactNode;table:ReactNode;defaultView?:'chart'|'table';narrowTable?:boolean;title?:string}
export function ChartTableSwitch({chart,table,defaultView='chart',narrowTable=false,title}:ChartTableSwitchProps) {
  const t=useTranslations('research');
  const [view,setView]=useState<'chart'|'table'>(defaultView);
  useEffect(()=>{
    if(narrowTable && window.matchMedia('(max-width: 639px)').matches) setView('table');
  },[narrowTable]);
  return <div>
    <div className="mb-2 flex items-center justify-between gap-2">
      {title && <h3 className="text-sm font-medium text-text">{title}</h3>}
      <div role="group" aria-label={t('view.label')} className="ml-auto inline-flex rounded-[4px] border border-border overflow-hidden">
        {(['chart','table'] as const).map(v=><button key={v} type="button" aria-pressed={view===v} onClick={()=>setView(v)} className={`min-h-[30px] px-3 text-xs ${view===v?'bg-[var(--accent-wash)] text-accent font-semibold':'text-text-dim'}`}>{t(`view.${v}`)}</button>)}
      </div>
    </div>
    {view==='chart' && chart}
    <div className={view==='chart'?'sr-only':undefined}>{table}</div>
  </div>;
}
