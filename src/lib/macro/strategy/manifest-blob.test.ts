// Blob transport changes storage only: canonical identity and replay stay unchanged.
import {gzipSync,gunzipSync} from 'node:zlib';
import {expect,it} from 'vitest';
import {strategyDbOver,supabaseTransport} from './db';
import type {StrategyTransport} from './db';
import {manifestSizes,sizedManifest} from './manifest-blob.fixture';
import {testManifest} from './db-contract';
import {canonicalJson,sha256Hex} from './hash';
import {manifestFetch,manifestRequestId,withManifestRequest} from './manifest-request';
import {createClient} from '@supabase/supabase-js';

const ID='11111111-1111-4111-8111-111111111111',CREATED='2026-11-07T00:00:00.000Z';
const large=()=>testManifest('cycle_table',{salt:'汉'.repeat(400000)});
const row=(body=large())=>({manifest_id:ID,manifest_hash:sha256Hex(canonicalJson(body)),created_at:CREATED,
 body:null,body_gz:gzipSync(Buffer.from(canonicalJson(body)),{level:6}),body_bytes:Buffer.byteLength(canonicalJson(body))});

it.each(manifestSizes)('chooses the RPC by canonical byte length and preserves jsonb identity at %i bytes',async size=>{
 const body=sizedManifest(size),hash=sha256Hex(canonicalJson(body));
 const store=(expectedRpc:string):StrategyTransport=>{
  let rows:Record<string,unknown>[]=[];
  return {
   rpc:async(fn,args)=>{
    expect(fn).toBe(expectedRpc);
    expect(args.p_manifest_hash).toBe(hash);
    const gzip=fn==='macro_put_manifest_gz';
    rows=[{manifest_id:ID,manifest_hash:args.p_manifest_hash,created_at:CREATED,body:args.p_body??null,
     body_gz:gzip?Buffer.from(String(args.p_body_gz),'base64'):null,body_bytes:args.p_body_bytes??null}];
    return gzip?{manifest_id:ID,outcome:'inserted'}:ID;
   },
   select:async()=>rows,
  };
 };
 const legacy=store('macro_put_manifest');
 const id=await legacy.rpc('macro_put_manifest',{p_kind:body.kind,p_body:body,p_manifest_hash:hash,p_cutoff:body.cutoff,
  p_method_version:body.method_version,p_code_version:body.code_version,p_catalog_version:body.catalog_version});
 const expected=await strategyDbOver(legacy).manifest(String(id));
 const db=strategyDbOver(store(size>100_000?'macro_put_manifest_gz':'macro_put_manifest'));
 const stored=await db.putManifest(body);
 expect(stored).toEqual(expected);
 expect(await db.manifest(stored.manifest_id)).toEqual(expected);
});
it('sends large canonical UTF-8 as base64 gzip with unchanged hash and metadata-only readback',async()=>{
 const body=large(),canonical=canonicalJson(body),stored=row(body);
 const db=strategyDbOver({rpc:async(fn,args)=>{
  expect(fn).toBe('macro_put_manifest_gz');
  expect(Object.keys(args).sort()).toEqual(['p_kind','p_body_gz','p_body_bytes','p_manifest_hash','p_cutoff','p_method_version','p_code_version','p_catalog_version'].sort());
  expect(gunzipSync(Buffer.from(args.p_body_gz as string,'base64')).toString()).toBe(canonical);
  expect(args).toMatchObject({p_body_bytes:Buffer.byteLength(canonical),p_manifest_hash:sha256Hex(canonical)});
  return {manifest_id:ID,outcome:'inserted'};
 },select:async(role,spec)=>{expect(role).toBe('admin');expect(spec.columns).toEqual(['manifest_id','manifest_hash','created_at']);return [stored];}});
 expect(await db.putManifest(body)).toMatchObject({body,manifest_hash:sha256Hex(canonical)});
});
it('keeps the small RPC and payload unchanged',async()=>{
 const body=testManifest('review'),hash=sha256Hex(canonicalJson(body));
 const db=strategyDbOver({rpc:async(fn,args)=>{
  expect(fn).toBe('macro_put_manifest');expect(args).toEqual({p_kind:body.kind,p_body:body,p_manifest_hash:hash,p_cutoff:body.cutoff,
   p_method_version:body.method_version,p_code_version:body.code_version,p_catalog_version:body.catalog_version});return ID;
 },select:async()=>[{manifest_id:ID,manifest_hash:hash,created_at:CREATED}]});
 expect((await db.putManifest(body)).body).toEqual(body);
});
it.each(['buffer','hex'])('decodes %s bytea with exact body and hash',async form=>{
 const body=large(),r=row(body);
 const db=strategyDbOver({rpc:async()=>null,select:async()=>[{...r,body_gz:form==='hex'?`\\x${r.body_gz.toString('hex')}`:r.body_gz}]});
 expect(await db.manifest(ID)).toEqual({manifest_id:ID,manifest_hash:r.manifest_hash,created_at:CREATED,body});
});
it.each(['gzip','length','hash','hex','json'])('rejects corrupt blob %s with a fixed error',async bad=>{
 const r:Record<string,unknown>=row();
 if(bad==='gzip')r.body_gz=Buffer.from('not gzip');
 if(bad==='length')r.body_bytes=1;
 if(bad==='hash')r.manifest_hash='0'.repeat(64);
 if(bad==='hex')r.body_gz='\\x1f8bzz';
 if(bad==='json'){r.body_gz=gzipSync(Buffer.from('!'));r.body_bytes=1;r.manifest_hash=sha256Hex('!');}
 const db=strategyDbOver({rpc:async()=>null,select:async()=>[r]});
 await expect(db.manifest(ID)).rejects.toMatchObject({code:'rpc_failed',message:'manifest_blob_corrupt'});
});
it.each(['jsonb','gzip','different'])('resolves compare against %s without changing stored evidence',async encoding=>{
 const body=large(),other=structuredClone(body);other.params.salt='different';
 const r=encoding==='gzip'?row(body):{...row(body),body:encoding==='different'?other:body,body_gz:null,body_bytes:null};
 const before=JSON.stringify(r);
 const db=strategyDbOver({rpc:async()=>({manifest_id:ID,outcome:'compare'}),select:async(role,spec)=>{
  expect(role).toBe('admin');expect(spec.columns).toBeUndefined();return [r];
 }});
 if(encoding==='different')await expect(db.putManifest(body)).rejects.toMatchObject({code:'payload_conflict'});
 else expect((await db.putManifest(body)).manifest_id).toBe(ID);
 expect(JSON.stringify(r)).toBe(before);
});
it('sends the gzip endpoint as one raw JSON body and correlates its failed request id',async()=>{
 const args={p_body_gz:'encoded'},calls:unknown[]=[];
 const client=createClient('https://fixture.invalid','fixture',{auth:{persistSession:false},global:{fetch:manifestFetch(async(input,init)=>{
  const req=new Request(input,init);expect(new URL(req.url).pathname).toBe('/rest/v1/rpc/macro_put_manifest_gz');
  calls.push(JSON.parse(await req.text()));return new Response('{"message":"invalid_argument"}',{status:400,headers:{'content-type':'application/json','sb-request-id':ID}});
 })}});
 const t:StrategyTransport=supabaseTransport({admin:client,anon:client});
 await withManifestRequest(async()=>{await expect(t.rpc('macro_put_manifest_gz',args)).rejects.toBeDefined();expect(manifestRequestId()).toBe(ID);});
 expect(calls).toEqual([args]);
});
