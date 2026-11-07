// F3 document pipeline boundary (spec §11.1). Page offsets exposed to this module use UTF-16 code units.
export interface F3Page{page:number;text:string}
export interface F3Artifact{extractor_version:string;content_sha256:string;page_count:number;ocr_used:boolean;ocr_version:string|null;pages:F3Page[]}
export interface F3Input{bytes:Uint8Array;sha256:string;outputPrefix:string;pagesPrefix:string}
export interface F3Authorization{licenceId:string;licenceVersion:number;purpose:'broker_research'}
/** Resolves only after all port writes have settled. */
export interface F3Port{available():boolean;extractDocument(input:F3Input,opts:{deadline:Date;authorization:F3Authorization}):Promise<F3Artifact>}
export class F3Timeout extends Error{constructor(){super('f3_timeout');this.name='F3Timeout';}}
export class F3Error extends Error{constructor(readonly code:'f3_failed'|'f3_unavailable'|'extractor_nondeterministic',message?:string){super(message??code);this.name='F3Error';}}
export function assertExtraction(v:unknown,sha256:string):F3Artifact{
 const e=v as F3Artifact;
 if(!e||typeof e!=='object'||typeof e.extractor_version!=='string'||!e.extractor_version||!Array.isArray(e.pages))throw new F3Error('f3_failed','shape');
 if(e.content_sha256!==sha256)throw new F3Error('f3_failed','content_mismatch');
 if(e.page_count!==e.pages.length||e.pages.some((p,i)=>p.page!==i+1||typeof p.text!=='string'))throw new F3Error('f3_failed','pages');
 return e;
}
export function fakeF3Port(build:(input:F3Input)=>F3Artifact|Error):F3Port&{calls:F3Input[]}{
 const calls:F3Input[]=[];
 return {calls,available:()=>true,async extractDocument(input){calls.push(input);const r=build(input);if(r instanceof Error)throw r;return structuredClone(r);}};
}
export function productionF3Port(env:Record<string,string|undefined>=process.env):F3Port{
 return {available:()=>false,async extractDocument(){throw new F3Error('f3_unavailable',env.BROKER_RESEARCH_F3_ENABLED==='1'?'adapter_not_wired':'flag_off');}};
}
