// src/lib/dcf/bridge.ts
// Client-safe contract of the DCF equity-bridge panel (spec §5.4, §9.1, §0 #65): response types of
// GET/POST /api/dcf/[ticker] and the pure rules the panel uses — a bridge field is `user` when the user
// typed a finite number, else `fact` when the seed has one, else `missing`; Run appears only when all
// three are fact or user; only user-sourced fields are sent as overrides (facts are re-read server-side).
import type {EvidenceDto} from '@/lib/company/types';
import type {DcfResult} from './engine';

export type BridgeKey='baseRevenue'|'sharesDiluted'|'netDebt';
export const BRIDGE_KEYS:readonly BridgeKey[]=['baseRevenue','sharesDiluted','netDebt'];
export const BRIDGE_PATH:Record<BridgeKey,string>={baseRevenue:'revenueLines[0].baseRevenue',sharesDiluted:'sharesDiluted',netDebt:'netDebt'};
export interface SeedBridgeField{value:number|null;source:'fact'|null;factIds:string[];basis:string|null;periodEnd:string|null;divisor:string|null;reason:string|null}
export interface DcfMeta{currency:string;currencyUnit:string;divisor:string}
export interface DcfSeedResponse{status:'seed';ticker:string;market:'US'|'CN';meta:DcfMeta;bridge:Record<BridgeKey,SeedBridgeField>;grossMarginPct:{value:number|null;factIds:string[]};missing:{field:string;reason:string}[];evidence:Record<string,EvidenceDto>;truncated?:boolean}
export interface DcfRunResponse{
 status:'ok'|'unavailable';code?:'dcf_bridge_missing';ticker:string;market:'US'|'CN';meta:DcfMeta;
 assumptions:Record<string,unknown>|null;provenance:Record<string,'fact'|'llm'|'default'|'user'>;missing:{field:string;reason:string}[];
 result:DcfResult|null;warnings:{code:string;detail?:string}[];evidence:Record<string,EvidenceDto>;
 factProvenance?:Record<string,RunFactLeaf>;truncated?:boolean;
}
/** Per-leaf fact provenance as POST returns it (SeedLeaf, client-safe copy). */
export interface RunFactLeaf{source:'fact';value:number;factIds:string[];metric?:string;divisor:string;basis:string;periodEnd:string;unit:string}
export interface BridgeField{value:number|null;source:'fact'|'user'|'missing';factIds:string[];basis:string|null;reason:string|null}
export function bridgeFields(seed:DcfSeedResponse,user:Partial<Record<BridgeKey,string>>):Record<BridgeKey,BridgeField>{
 const out={} as Record<BridgeKey,BridgeField>;
 for(const k of BRIDGE_KEYS){
  const raw=user[k]?.trim();const n=raw?Number(raw):NaN;const s=seed.bridge[k];
  if(raw&&Number.isFinite(n))out[k]={value:n,source:'user',factIds:[],basis:null,reason:null};
  else if(s.source==='fact'&&s.value!==null)out[k]={value:s.value,source:'fact',factIds:s.factIds,basis:s.basis,reason:null};
  else out[k]={value:null,source:'missing',factIds:[],basis:null,reason:s.reason};
 }
 return out;
}
export const canRun=(f:Record<BridgeKey,BridgeField>)=>BRIDGE_KEYS.every(k=>f[k].source!=='missing'&&f[k].value!==null&&Number.isFinite(f[k].value));
export function bridgeOverrides(f:Record<BridgeKey,BridgeField>):Record<string,unknown>{
 const o:Record<string,unknown>={};
 if(f.baseRevenue.source==='user')o.revenueLines=[{baseRevenue:f.baseRevenue.value}];
 if(f.sharesDiluted.source==='user')o.sharesDiluted=f.sharesDiluted.value;
 if(f.netDebt.source==='user')o.netDebt=f.netDebt.value;
 return o;
}
