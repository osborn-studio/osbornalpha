// Dataset freshness; section page headers pass the reader-facing as-of date unchanged.
import {useTranslations} from 'next-intl';
export interface FreshnessChipProps {status:'fresh'|'stale'|'error'|'missing';asOf?:string|null}
const dots={fresh:'bg-accent',stale:'bg-warn',error:'bg-danger',missing:'border border-text-dim'};
export function FreshnessChip({status,asOf}:FreshnessChipProps) {
  const t=useTranslations('research');
  const [before,after]=t('freshness.asOf',{date:'{date}'}).split('{date}');
  const tone=status==='stale'?'border-[color-mix(in_srgb,var(--warn)_35%,transparent)] text-warn':status==='error'?'border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-danger':'border-border text-text-dim';
  return <span data-freshness={status} className={`inline-flex items-center gap-1.5 min-h-[22px] px-2 rounded-[4px] border text-[11px] whitespace-nowrap ${tone}`}>
    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dots[status]}`}/>
    <span>{asOf && <>{before}<span className="font-mono tabular-nums">{asOf}</span>{after}{' · '}</>}{t(`freshness.status.${status}`)}</span>
  </span>;
}
