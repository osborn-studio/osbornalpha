// Safe stateful value; section tables use this to suppress unavailable numeric values.
import type {ReactNode} from 'react';
import {STATE_SHOWS_VALUE,type ResearchState} from './states';
import {StateBadge} from './StateBadge';
export function StateCell({state,value,detail}:{state:ResearchState;value?:ReactNode;detail?:string}) {
  return <span className="inline-flex items-center gap-1.5">
    {STATE_SHOWS_VALUE[state] && value!=null && <span className="font-mono tabular-nums">{value}</span>}
    <StateBadge state={state} detail={detail}/>
  </span>;
}
