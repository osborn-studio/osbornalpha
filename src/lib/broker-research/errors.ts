// Service errors for broker research (plan Part C; spec §13). Routes map these directly to HTTP.
export class BrokerError extends Error{
 constructor(readonly code:string,readonly status:number,readonly extra:Record<string,unknown>={}){super(code);this.name='BrokerError';}
}
export const bad=(code:string,extra?:Record<string,unknown>)=>new BrokerError(code,400,extra);
export const notFound=(code='not_found')=>new BrokerError(code,404);
export const conflict=(code:string,extra?:Record<string,unknown>)=>new BrokerError(code,409,extra);
export const gone=()=>new BrokerError('document_withdrawn',410);
