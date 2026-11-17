// Research chain routing; section pages can override availability as they launch.
export type ChainStepId = 'macro' | 'industry' | 'company' | 'foreign' | 'topic';
export interface ChainStep { id: ChainStepId; no: '01'|'02'|'03'|'04'|'05'; href: string; match: readonly string[] }
export const CHAIN_STEPS: readonly ChainStep[] = [
  {id:'macro',no:'01',href:'/macro',match:['/macro']},
  {id:'industry',no:'02',href:'/intel/industries?scheme=sic',match:['/intel/industries']},
  {id:'company',no:'03',href:'/intel/companies',match:['/intel/companies','/stock']},
  {id:'foreign',no:'04',href:'/intel/foreign-research',match:['/intel/foreign-research']},
  {id:'topic',no:'05',href:'/intel/topics',match:['/intel/topics']},
];
export type ChainAvailability = Record<ChainStepId, boolean>;
/** What is live on main today. Section sessions flip their own step (foreign: when its public flag is on; topic: when built). */
export const DEFAULT_CHAIN_AVAILABILITY: ChainAvailability = {macro:true,industry:true,company:true,foreign:false,topic:false};
const matches = (pathname:string, prefix:string) => pathname === prefix || pathname.startsWith(prefix+'/');
export function chainVisible(pathname:string):boolean {
  return matches(pathname,'/macro') || matches(pathname,'/intel') || pathname.startsWith('/stock/');
}
export function activeChainStep(pathname:string):ChainStepId|null {
  return CHAIN_STEPS.find(step=>step.match.some(prefix=>matches(pathname,prefix)))?.id ?? null;
}
export interface ChainItem { id: ChainStepId; no: ChainStep['no']; href: string|null; state: 'current'|'link'|'notServed' }
export function chainItems(pathname:string, availability:ChainAvailability):ChainItem[] {
  const active=activeChainStep(pathname);
  return CHAIN_STEPS.map(({id,no,href})=>({id,no,href:availability[id]?href:null,state:!availability[id]?'notServed':active===id?'current':'link'}));
}
