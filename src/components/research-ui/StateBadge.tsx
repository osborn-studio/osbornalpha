// Visible state label and shape; section pages use it beside a cell or explanation.
import {useTranslations} from 'next-intl';
import {STATE_SHAPE,STATE_TONE,type ResearchState} from './states';
const shapes={dashed:'border-dashed',dotted:'border-dotted',solid:'border-solid'};
const tones={
  neutral:'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-text-dim',
  warn:'border-[color-mix(in_srgb,var(--warn)_35%,transparent)] text-warn',
  danger:'border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-danger',
  accent:'border-[var(--border-active)] text-accent',
};
export function StateBadge({state,detail}:{state:ResearchState;detail?:string}) {
  const t=useTranslations('research');
  const tone=state==='withheld'?'border-text-dim text-text-dim':tones[STATE_TONE[state]];
  const numeric=detail!==undefined && /^[+-]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)\s*%?$/.test(detail.trim());
  return <span data-research-state={state} className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-[4px] text-[11px] whitespace-nowrap border ${shapes[STATE_SHAPE[state]]} ${tone}`}>
    {t(`states.${state}`)}
    {detail!==undefined && <span className={numeric?'font-mono tabular-nums':undefined}>{detail}</span>}
  </span>;
}
