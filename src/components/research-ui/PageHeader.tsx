// Shared section header; pages supply localized copy, scope controls and freshness.
import type {ReactNode} from 'react';
import {FreshnessChip,type FreshnessChipProps} from './FreshnessChip';
import {MarkLegend} from './MarkLegend';
export interface PageHeaderProps {
  title:string;
  altTitle?:string;
  scope:string;
  kicker?:string;
  scopeSwitch?:ReactNode;
  freshness?:FreshnessChipProps|null;
  legend?:boolean;
}
export function PageHeader({title,altTitle,scope,kicker,scopeSwitch,freshness,legend=true}:PageHeaderProps) {
  return <header data-research-page-header className="flex flex-wrap items-end gap-x-3 gap-y-2.5">
    <div className="min-w-0 flex-1 basis-[280px]">
      {kicker && <p className="text-[10px] font-medium uppercase tracking-[0.05em] text-text-dim">{kicker}</p>}
      <h1 className="m-0 text-xl font-bold tracking-[-0.01em] text-text">{title}{altTitle && <span className="ml-2 font-normal text-text-muted text-[0.82em]">{altTitle}</span>}</h1>
      <p className="text-xs text-text-dim max-w-[65ch]">{scope}</p>
    </div>
    {scopeSwitch!=null && <div data-scope-switch>{scopeSwitch}</div>}
    {freshness && <FreshnessChip {...freshness}/>}
    {legend && <MarkLegend/>}
  </header>;
}
