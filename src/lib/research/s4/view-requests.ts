/** A view generation fences late responses after selection changes or failed
 * access checks. It does not authorize data; server checks remain mandatory. */
export class ObsoleteViewRequest extends Error {}
export function createViewRequests(onUnavailable:()=>void){
 let generation=0;
 return {
  invalidate(){generation++;},
  async run<T>(work:()=>Promise<T>):Promise<T>{
   const started=generation;
   try{
    const result=await work();
    if(started!==generation)throw new ObsoleteViewRequest();
    return result;
   }catch(error){
    if(started!==generation)throw new ObsoleteViewRequest();
    const code=error instanceof Error?error.message:'';
    if(!['revision_conflict','idempotency_conflict','observation_scope_conflict','invalid_schema','security_unresolved','exposure_required','input_limit','future_input','invalid_timeline','hash_mismatch','fixture_not_operational','data_insufficient'].includes(code)){
     generation++;onUnavailable();
    }
    throw error;
   }
  }
 };
}
