import type {ReactNode} from 'react';
import {StateBadge} from '@/components/research-ui/StateBadge';
import {StateCell} from '@/components/research-ui/StateCell';
import {unifiedState} from '@/components/research-ui/states';

// Only series, observation and source data states belong here. Workflow phases,
// judgment lifecycles and clock matches must retain their module-owned wording.
export type MacroDataStatus =
  | 'active' | 'ok' | 'current' | 'n/a'
  | 'M' | 'R' | 'missing' | 'restricted' | 'withheld' | 'not_served' | 'not_in_catalog'
  | 'no_data' | 'stale' | 'late' | 'revised' | 'quarantined' | 'rejected';
const stateOf = (status?: MacroDataStatus) => status === undefined ? null
  : unifiedState(status === 'late' ? 'stale' : status === 'no_data' ? 'missing' : status === 'not_in_catalog' ? 'not_served' : status);

export function MacroStateLabel({status,detail,children}:{status:MacroDataStatus;detail?:string;children?:ReactNode}) {
 const state=stateOf(status);
 return state?<StateBadge state={state} detail={detail}/>:<>{children}{detail?` · ${detail}`:''}</>;
}
export function MacroStateValue({status,value,detail}:{status?:MacroDataStatus;value?:ReactNode;detail?:string}) {
 const state=stateOf(status)??(value==null||value==='—'?unifiedState('missing'):null);
 return state?<StateCell state={state} value={value} detail={detail}/>:<>{value}</>;
}
