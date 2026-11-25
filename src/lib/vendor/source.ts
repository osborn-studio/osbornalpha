// Server-side vendor retrieval contract. Requests carry provenance, responses carry exact bytes.
import type {Budget} from '../facts/types';
export interface VendorRequest{tool:string;templateId:string;templateVersion:number;args:Readonly<Record<string,string|number>>;query:string}
export interface VendorResponse{vendor:string;product:string;request:VendorRequest;bytes:Uint8Array;sha256:string;httpStatus:number;fetchedAt:string;attempt:number}
export interface VendorSource{
 readonly vendor:string;readonly product:string;
 /** Dispatched attempts so far on this instance. */
 callsMade():number;
 fetch(request:VendorRequest,budget:Budget):Promise<VendorResponse>;
}
export type VendorErrorCode='vendor_unavailable'|'vendor_auth_failed'|'vendor_rate_limited'|'vendor_http_error'|'vendor_timeout'|'vendor_network_error'|'vendor_call_budget_exceeded'|'budget_exhausted'|'budget_aborted'|'fixture_missing';
export class VendorError extends Error{
 constructor(public readonly code:VendorErrorCode,detail?:string){super(detail===undefined?code:`${code}: ${detail}`);this.name='VendorError';}
}
/** Storage representation. Credentials belong exclusively to the transport. */
export function canonicalRequest(r:VendorRequest):Record<string,unknown>{
 return {tool:r.tool,template_id:r.templateId,template_version:r.templateVersion,args:r.args,query:r.query};
}
