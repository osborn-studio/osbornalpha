/** Read-only capability probe of Alpha's existing public US daily adapters.
 * Captures provider bytes, not an authorized S6 MarketSnapshot or split proof.
 * Usage: tsx scripts/s6/probe-public-market.ts <private-output-directory>
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {fetchEastmoneyKline} from '../../src/lib/data/sources/eastmoney';
import {fetchSinaUsKline} from '../../src/lib/data/sources/sina';

async function main(){
 const directory=process.argv[2];if(!directory)throw Error('output directory required');
 const output=resolve(directory);mkdirSync(output,{recursive:true,mode:0o700});
 const nativeFetch=globalThis.fetch;
 const captures:Record<string,unknown>[]=[],results:Record<string,unknown>[]=[];
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));
  if(!['push2his.eastmoney.com','stock.finance.sina.com.cn'].includes(url.hostname)||url.protocol!=='https:')throw Error('unexpected probe endpoint');
  const startedAt=new Date().toISOString(),timeout=AbortSignal.timeout(6000);
  const signal=init?.signal?AbortSignal.any([init.signal,timeout]):timeout;
  const entry:Record<string,unknown>={url:url.href,started_at:startedAt};captures.push(entry);
  try{
   const response=await nativeFetch(input,{...init,signal,redirect:'error'});
   entry.http_status=response.status;
   const chunks:Uint8Array[]=[];let size=0;
   const reader=response.body?.getReader();
   try{if(reader)for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2_000_000)throw Error('response exceeds 2 MB');chunks.push(part.value);}}
   finally{await reader?.cancel();reader?.releaseLock();}
   const bytes=Buffer.concat(chunks),hash=createHash('sha256').update(bytes).digest('hex');
   const filename=hash+'.raw';writeFileSync(join(output,filename),bytes,{mode:0o600});
   Object.assign(entry,{received_at:new Date().toISOString(),bytes:size,sha256:hash,raw_file:filename});
   return new Response(bytes,{status:response.status,headers:{'content-type':response.headers.get('content-type')||'application/octet-stream'}});
  }catch(error){Object.assign(entry,{failed_at:new Date().toISOString(),error:error instanceof Error?error.message:'fetch failed'});throw error;}
 };
 try{
  for(const ticker of ['IBM','SPY'])for(const provider of ['eastmoney','sina'] as const){
   try{
    const series=provider==='eastmoney'?await fetchEastmoneyKline(ticker,'D',5,{adjustment:'none',timeoutMs:5000}):await fetchSinaUsKline(ticker,5,undefined,5000);
    results.push({ticker,provider,status:series?'received':'empty',bar_count:series?.bars.length??0,first_date:series?.bars[0]?.time,last_date:series?.bars.at(-1)?.time,adapter_adjustment:series?.adjustment});
   }catch(error){results.push({ticker,provider,status:'failed',error:error instanceof Error?error.message:'provider failed'});}
  }
 }finally{globalThis.fetch=nativeFetch;}
 const report={schema_version:'alpha-public-market-probe/1.0',captured_at:new Date().toISOString(),purpose:'capability_only',real_market_acceptance:'not_passed',
  limitations:['adapter_adjustment is an adapter declaration, not upstream certification of unadjusted prices.','No verified split-factor or complete corporate-action history is returned by these adapters.','received_at proves this retrieval only, not historical publication availability.','Existing adapters classify US market without preserving a verified XNYS listing identity.'],
  datagateway_configured:!!(process.env.DATAGATEWAY_BASE_URL&&process.env.DATAGATEWAY_API_KEY),datagateway_called:false,results,captures};
 writeFileSync(join(output,'probe.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'probe failed');process.exitCode=1;});
