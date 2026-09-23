import {createServer,type Server} from 'node:http';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {captureAlphaKline} from './market';
import {syntheticMapping} from '../../../../scripts/s6/fixtures';
import {bytesDigest} from 'dsh-trade-strategy-evaluator/engine';
const mapping=syntheticMapping({ticker:'S6SYNTH',exchange:'XNYS',currency:'USD',synthetic:true,company_entity_id:null});
let server:Server,origin:string,mode='valid';
beforeAll(async()=>{
 server=createServer((req,res)=>{if(mode==='hang')return;if(mode==='redirect'){res.writeHead(302,{location:'https://example.invalid'});return res.end();}res.writeHead(mode==='failure'?503:200,{'Content-Type':mode==='non-json'?'text/plain':'application/json'});res.end(mode==='oversize'?'x'.repeat(2_000_001):(mode==='bom'?'\uFEFF':'')+mapping.raw);});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+(server.address() as {port:number}).port;
});
afterAll(()=>new Promise<void>(r=>server.close(()=>r())));
it('captures exact HTTP bytes and requires separately supplied evidence',async()=>{
 const options={origin,security:mapping.security,request:mapping.request,providerVersion:mapping.providerVersion,evidenceFor:async()=>mapping.evidence};
 const captured=await captureAlphaKline(options);expect(captured.raw).toBe(mapping.raw);expect(captured.evidence).toEqual(mapping.evidence);
 await expect(captureAlphaKline({...options,evidenceFor:async()=>null})).rejects.toMatchObject({code:'source_unavailable'});
 mode='redirect';await expect(captureAlphaKline(options)).rejects.toMatchObject({cause:{message:'unexpected redirect'}});
 mode='oversize';await expect(captureAlphaKline(options)).rejects.toMatchObject({code:'input_limit'});
 for(const state of ['non-json','failure']){mode=state;await expect(captureAlphaKline(options)).rejects.toMatchObject({code:'source_unavailable'});}
 mode='bom';const bom=await captureAlphaKline(options);expect(bytesDigest(bom.raw)).toBe(bytesDigest(Buffer.from('\uFEFF'+mapping.raw)));expect(bom.raw.charCodeAt(0)).toBe(0xFEFF);
 mode='hang';await expect(captureAlphaKline({...options,signal:AbortSignal.timeout(20)})).rejects.toMatchObject({name:'TimeoutError'});
});
