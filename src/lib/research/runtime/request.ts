import {fail} from '../ingest/pa-v1/json.js';
/** The configured origin is operator-controlled. Forwarded headers never select authority. */
export function assertResearchRequest(req:Request,configuredOrigin:string|undefined) {
 let origin:URL;
 try{origin=new URL(configuredOrigin||'invalid');}catch{throw fail('not_configured');}
 if(origin!.origin!==configuredOrigin||!['http:','https:'].includes(origin!.protocol))fail('scope_denied');
 if(new URL(req.url).origin!==origin!.origin||req.headers.get('host')!==origin!.host)fail('scope_denied');
 if(req.headers.get('sec-fetch-site')==='cross-site'||(req.method!=='GET'&&req.headers.get('origin')!==origin!.origin))fail('scope_denied');
}
