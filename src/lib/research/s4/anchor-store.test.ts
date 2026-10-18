import {describe,it,expect} from 'vitest';
import {mkdtempSync,readFileSync,statSync,appendFileSync,writeFileSync,mkdirSync,chmodSync,symlinkSync} from 'node:fs';
import {open,type FileHandle} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {canonicalize,digest} from '../ingest/pa-v1/json.js';
import {fileAnchorStore,ZERO_HASH,type AnchorReceiptEntry,type AnchorStore} from './anchor-store';

const scope='c'.repeat(64);
export function syntheticEntries(count:number,start=1,previous=ZERO_HASH,ownerScope=scope):AnchorReceiptEntry[]{
  const out:AnchorReceiptEntry[]=[];
  for(let i=0;i<count;i++){
    const body={sequence:String(start+i),owner_scope_hash:ownerScope,record_id:randomUUID(),event_hash:digest({i}),record_kind:'ControlEvent',
      observation_hash:null,rule_hash:null,server_time:'2026-10-01T00:00:00.000Z',exported_at:'2026-10-02T00:00:00.000Z',previous_hash:previous,provenance_level:'local_receipt' as const};
    const entry={...body,receipt_hash:digest(body)};out.push(entry);previous=entry.receipt_hash;
  }
  return out;
}
const root=()=>mkdtempSync(join(tmpdir(),'s4-store-'));

describe('file AnchorStore',()=>{
 it('exposes exactly readCheckpoint, readReceipts, appendExpected, flush and verify',()=>{
  const store=fileAnchorStore(root(),scope);
  const methods=Object.keys(store).filter(k=>typeof (store as unknown as Record<string,unknown>)[k]==='function').sort();
  expect(methods).toEqual(['appendExpected','flush','readCheckpoint','readReceipts','verify']);
  expect(Object.getPrototypeOf(store)).toBe(Object.prototype);
 });
 it('starts from the ZERO genesis with a 0700 directory and a 0600 journal',async()=>{
  const r=root();const store=fileAnchorStore(r,scope);
  expect(await store.readCheckpoint()).toEqual({bytes:0,last_sequence:null,last_hash:ZERO_HASH});
  expect(await store.verify()).toEqual(expect.objectContaining({bytes:0,entries:0,last_hash:ZERO_HASH,last_sequence:null}));
  expect(statSync(join(r,scope)).mode&0o777).toBe(0o700);
  expect(statSync(join(r,scope,'receipts.jsonl')).mode&0o777).toBe(0o600);
 });
 it('appends canonical one-line receipts in today\'s format and reports the new tail',async()=>{
  const r=root();const store=fileAnchorStore(r,scope);const entries=syntheticEntries(3);
  const tail=await store.appendExpected({bytes:0,last_sequence:null,last_hash:ZERO_HASH},entries);await store.flush();
  const text=readFileSync(join(r,scope,'receipts.jsonl'),'utf8');
  expect(text).toBe(entries.map(e=>canonicalize(e)+'\n').join(''));
  expect(tail).toEqual({bytes:Buffer.byteLength(text),last_sequence:'3',last_hash:entries[2].receipt_hash});
  expect(await store.readCheckpoint()).toEqual(tail);
  const seen=[];for await(const e of store.readReceipts())seen.push(e);expect(seen).toEqual(entries);
  const verified=await store.verify();expect(verified).toEqual({...tail,entries:3,scan_ms:expect.any(Number)});
 });
 it('refuses to append against a stale tail or a broken chain and leaves the file unchanged',async()=>{
  const r=root();const store=fileAnchorStore(r,scope);const first=syntheticEntries(2);
  const tail=await store.appendExpected({bytes:0,last_sequence:null,last_hash:ZERO_HASH},first);await store.flush();
  const before=readFileSync(join(r,scope,'receipts.jsonl'));
  await expect(store.appendExpected({bytes:0,last_sequence:null,last_hash:ZERO_HASH},syntheticEntries(1,3))).rejects.toThrow('anchor_tail_moved');
  await expect(store.appendExpected(tail,syntheticEntries(1,3,'d'.repeat(64)))).rejects.toThrow('anchor_integrity_failed');
  await expect(store.appendExpected(tail,syntheticEntries(1,2,tail.last_hash))).rejects.toThrow('anchor_integrity_failed');
  await expect(store.appendExpected(tail,[{...syntheticEntries(1,3,tail.last_hash)[0],receipt_hash:'e'.repeat(64)}])).rejects.toThrow('anchor_integrity_failed');
  await expect(store.appendExpected(tail,syntheticEntries(1,3,tail.last_hash,'f'.repeat(64)))).rejects.toThrow('anchor_integrity_failed');
  expect(readFileSync(join(r,scope,'receipts.jsonl'))).toEqual(before);
  expect(await store.appendExpected(tail,syntheticEntries(1,3,tail.last_hash))).toEqual(expect.objectContaining({last_sequence:'3'}));
 });
 it('fails closed on a partial last line and on a damaged hash',async()=>{
  const r=root();const store=fileAnchorStore(r,scope);const entries=syntheticEntries(2);
  await store.appendExpected({bytes:0,last_sequence:null,last_hash:ZERO_HASH},entries);await store.flush();
  const path=join(r,scope,'receipts.jsonl');appendFileSync(path,'{"sequence":"3"');
  await expect(store.readCheckpoint()).rejects.toThrow('anchor_integrity_failed');
  await expect(store.verify()).rejects.toThrow('anchor_integrity_failed');
  writeFileSync(path,canonicalize(entries[0])+'\n'+canonicalize({...entries[1],rule_hash:'f'.repeat(64)})+'\n');
  await expect(store.verify()).rejects.toThrow('anchor_integrity_failed');
  writeFileSync(path,canonicalize(entries[0])+'\n'+canonicalize({...entries[1],receipt_hash:'0'.repeat(64)})+'\n');
  await expect(store.verify()).rejects.toThrow('anchor_integrity_failed');
  const {receipt_hash:_u,...unlinked}=entries[1];void _u;const relinked={...unlinked,previous_hash:ZERO_HASH};
  writeFileSync(path,canonicalize(entries[0])+'\n'+canonicalize({...relinked,receipt_hash:digest(relinked)})+'\n');
  await expect(store.verify()).rejects.toThrow('anchor_integrity_failed');
  writeFileSync(path,canonicalize(entries[1])+'\n'+canonicalize(entries[0])+'\n');
  await expect(store.verify()).rejects.toThrow('anchor_integrity_failed');
  // A body rewritten with a recomputed receipt_hash is self-consistent at the store level; only the
  // drain, which can see the outbox row, rejects it (covered by the integration suite).
  const {receipt_hash:_h,...body}=entries[1];void _h;const rewritten={...body,rule_hash:'f'.repeat(64)};
  writeFileSync(path,canonicalize(entries[0])+'\n'+canonicalize({...rewritten,receipt_hash:digest(rewritten)})+'\n');
  expect((await store.verify()).entries).toBe(2);
 });
 it('refuses a relative root, a group-readable directory, a symlinked journal and a foreign-mode file',async()=>{
  expect(()=>fileAnchorStore('relative',scope)).toThrow('scope_denied');
  expect(()=>fileAnchorStore(root(),'not-a-scope-hash')).toThrow('scope_denied');
  const loose=root();mkdirSync(join(loose,scope),{mode:0o750});
  await expect(fileAnchorStore(loose,scope).readCheckpoint()).rejects.toThrow('scope_denied');
  const linked=root();mkdirSync(join(linked,scope),{mode:0o700});writeFileSync(join(linked,'real.jsonl'),'',{mode:0o600});symlinkSync(join(linked,'real.jsonl'),join(linked,scope,'receipts.jsonl'));
  await expect(fileAnchorStore(linked,scope).readCheckpoint()).rejects.toThrow();
  const mode=root();mkdirSync(join(mode,scope),{mode:0o700});writeFileSync(join(mode,scope,'receipts.jsonl'),'',{mode:0o600});chmodSync(join(mode,scope,'receipts.jsonl'),0o640);
  await expect(fileAnchorStore(mode,scope).verify()).rejects.toThrow('anchor_integrity_failed');
 });
 it('lets a caller inject the file handle so a stalled fsync is observable',async()=>{
  const r=root();let stalled=0;const handles:FileHandle[]=[];
  const openFile=async(path:string,flags:number,mode:number):Promise<FileHandle>=>{
    const real=await open(path,flags,mode);handles.push(real);
    return new Proxy(real,{get(target,key){if(key==='sync'){return()=>{stalled++;return new Promise<void>(()=>{});};}const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}}) as FileHandle;
  };
  const store:AnchorStore=fileAnchorStore(r,scope,{openFile});
  await store.appendExpected({bytes:0,last_sequence:null,last_hash:ZERO_HASH},syntheticEntries(1));
  const outcome=await Promise.race([store.flush().then(()=>'flushed'),new Promise(resolve=>setTimeout(()=>resolve('stalled'),200))]);
  expect(outcome).toBe('stalled');expect(stalled).toBe(1);
  for(const h of handles)await h.close().catch(()=>{});
 });
 it('scans a 2 000-entry synthetic journal and reports the duration',async()=>{
  const r=root();mkdirSync(join(r,scope),{mode:0o700});const entries=syntheticEntries(2000);
  writeFileSync(join(r,scope,'receipts.jsonl'),entries.map(e=>canonicalize(e)+'\n').join(''),{mode:0o600});
  const verified=await fileAnchorStore(r,scope).verify();
  expect(verified.entries).toBe(2000);expect(verified.last_sequence).toBe('2000');expect(verified.last_hash).toBe(entries[1999].receipt_hash);
  expect(verified.scan_ms).toBeGreaterThanOrEqual(0);
 });
});
