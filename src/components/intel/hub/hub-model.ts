import {CHAIN_STEPS,type ChainStepId} from '@/components/research-ui/chain';

export const HUB_ORDER=CHAIN_STEPS.map(step=>step.id);
export const hubNumber=(id:ChainStepId)=>CHAIN_STEPS.find(step=>step.id===id)!.no;
export type HubState='loading'|'open'|'notServed';
export function hubState(status:number,parsed:boolean){
 return status===200 && parsed?'open':'notServed';
}
