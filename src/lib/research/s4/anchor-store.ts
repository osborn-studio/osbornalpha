import {constants} from 'node:fs';
import {lstat,mkdir,open,type FileHandle} from 'node:fs/promises';
import {dirname,isAbsolute,join} from 'node:path';
import {canonicalize,digest,fail,parseStrict} from '../ingest/pa-v1/json.js';

/** Genesis `previous_hash` of every owner chain. */
export const ZERO_HASH='0'.repeat(64);
/** One journal line, exactly the shape `drainOutbox` has always written. */
export interface AnchorReceiptEntry {
  sequence:string; owner_scope_hash:string; record_id:string; event_hash:string; record_kind:string;
  observation_hash:string|null; rule_hash:string|null; server_time:string; exported_at:string;
  previous_hash:string; provenance_level:'local_receipt'; receipt_hash:string;
}
/** The store's persisted tail: what a compare-and-append must still see. */
export interface AnchorTail { bytes:number; last_sequence:string|null; last_hash:string }
export interface AnchorVerification extends AnchorTail { entries:number; scan_ms:number }
/** 02 §3: readCheckpoint / readReceipts / appendExpected / flush / verify, and nothing that
 * updates, deletes or repairs. Integrity failures throw `anchor_integrity_failed`; a tail that
 * moved under a caller throws `anchor_tail_moved`. */
export interface AnchorStore {
  readCheckpoint():Promise<AnchorTail>;
  readReceipts():AsyncIterable<AnchorReceiptEntry>;
  appendExpected(expected:AnchorTail,entries:AnchorReceiptEntry[]):Promise<AnchorTail>;
  flush():Promise<void>;
  verify():Promise<AnchorVerification>;
}
export type OpenFile=(path:string,flags:number,mode:number)=>Promise<FileHandle>;
export interface FileAnchorStoreOptions { openFile?:OpenFile }
export const MAX_LINE_BYTES=16384;
const HASH=/^[0-9a-f]{64}$/,SEQUENCE=/^(?:0|[1-9][0-9]*)$/;
const ENTRY_KEYS=['event_hash','exported_at','observation_hash','owner_scope_hash','previous_hash','provenance_level','receipt_hash','record_id','record_kind','rule_hash','sequence','server_time'].join(',');

export async function controlledDirectory(path:string) {
  await mkdir(path,{recursive:true,mode:0o700});
  const stat=await lstat(path);
  if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.uid!==process.getuid?.()) fail('scope_denied');
}
/** Bounded memory, no lifetime row/byte cap. An interrupted partial line fails closed. */
export async function* journalEntries(file:FileHandle,size:number) {
  let pending=Buffer.alloc(0),position=0;
  while(position<size){
    const buffer=Buffer.alloc(Math.min(65536,size-position));const {bytesRead}=await file.read(buffer,0,buffer.length,position);
    if(!bytesRead)fail('anchor_integrity_failed');position+=bytesRead;
    pending=Buffer.concat([pending,buffer.subarray(0,bytesRead)]);
    let end:number;
    while((end=pending.indexOf(10))>=0){
      if(end>MAX_LINE_BYTES)fail('anchor_integrity_failed');
      let entry;try{entry=parseStrict(pending.subarray(0,end));}catch{fail('anchor_integrity_failed');}
      pending=pending.subarray(end+1);yield entry;
    }
    if(pending.length>MAX_LINE_BYTES)fail('anchor_integrity_failed');
  }
  if(pending.length)fail('anchor_integrity_failed');
}
/** Structural check of one entry against the chain position it claims. Semantic agreement with
 * the outbox row (event hash, export window) stays with the drain, which can see the row. */
function checkEntry(value:unknown,scope:string,previous:AnchorTail):AnchorReceiptEntry {
  if(!value||typeof value!=='object'||Array.isArray(value))fail('anchor_integrity_failed');
  const e=value as Record<string,unknown>;
  if(Object.keys(e).sort().join(',')!==ENTRY_KEYS)fail('anchor_integrity_failed');
  const str=(k:string)=>typeof e[k]==='string';
  if(!str('sequence')||!SEQUENCE.test(e.sequence as string)||!str('record_id')||!str('record_kind')||!str('server_time')||!str('exported_at'))fail('anchor_integrity_failed');
  if(e.owner_scope_hash!==scope||!HASH.test(String(e.event_hash))||!HASH.test(String(e.previous_hash))||!HASH.test(String(e.receipt_hash)))fail('anchor_integrity_failed');
  if(!(e.observation_hash===null||(str('observation_hash')&&HASH.test(e.observation_hash as string)))||!(e.rule_hash===null||str('rule_hash')))fail('anchor_integrity_failed');
  if(e.provenance_level!=='local_receipt')fail('anchor_integrity_failed');
  if(e.previous_hash!==previous.last_hash||(previous.last_sequence!==null&&BigInt(e.sequence as string)<=BigInt(previous.last_sequence)))fail('anchor_integrity_failed');
  const {receipt_hash,...body}=e;
  if(receipt_hash!==digest(body))fail('anchor_integrity_failed');
  return e as unknown as AnchorReceiptEntry;
}
/** One in-process critical section per journal: the single controlled writer 06 §D requires.
 * It serializes appends and flushes of every store instance for the same file in this process. */
const writers=new Map<string,Promise<unknown>>();
async function withWriter<T>(path:string,work:()=>Promise<T>):Promise<T> {
  const previous=writers.get(path)??Promise.resolve();
  const run=previous.catch(()=>{}).then(work);
  writers.set(path,run);
  try{return await run;}finally{if(writers.get(path)===run)writers.delete(path);}
}

/** Today's `receipts.jsonl` layout under `<root>/<owner scope hash>/`, 0700 directories and a 0600
 * journal owned by this uid, fsync of the file and of the directory chain, ZERO genesis.
 * `openFile` is injectable only so tests can stall fsync; production callers never pass it. */
export function fileAnchorStore(root:string,ownerScopeHash:string,options:FileAnchorStoreOptions={}):AnchorStore {
  if(typeof root!=='string'||!isAbsolute(root)||!HASH.test(ownerScopeHash)||typeof process.getuid!=='function')fail('scope_denied');
  const openFile:OpenFile=options.openFile??((p,f,m)=>open(p,f,m));
  const dir=join(root,ownerScopeHash),path=join(dir,'receipts.jsonl');
  let pending:FileHandle|null=null;
  async function openJournal(){
    await controlledDirectory(root);await controlledDirectory(dir);
    const file=await openFile(path,constants.O_CREAT|constants.O_RDWR|constants.O_APPEND|constants.O_NOFOLLOW,0o600);
    try{
      const stat=await file.stat();
      if(!stat.isFile()||stat.uid!==process.getuid!()||(stat.mode&0o077)!==0)fail('anchor_integrity_failed');
      return {file,size:stat.size};
    }catch(e){await file.close();throw e;}
  }
  async function tailOf(file:FileHandle,size:number):Promise<AnchorTail>{
    if(size===0)return {bytes:0,last_sequence:null,last_hash:ZERO_HASH};
    const window=Math.min(size,MAX_LINE_BYTES+1);const buffer=Buffer.alloc(window);
    const {bytesRead}=await file.read(buffer,0,window,size-window);
    if(bytesRead!==window||buffer[window-1]!==10)fail('anchor_integrity_failed');
    const start=buffer.lastIndexOf(10,window-2);
    if(start<0&&window<size)fail('anchor_integrity_failed');
    const line=buffer.subarray(start+1,window-1);
    if(line.length>MAX_LINE_BYTES)fail('anchor_integrity_failed');
    let parsed;try{parsed=parseStrict(line);}catch{fail('anchor_integrity_failed');}
    const e=parsed as Record<string,unknown>;
    if(!e||typeof e!=='object'||Array.isArray(e)||typeof e.sequence!=='string'||!SEQUENCE.test(e.sequence)||!HASH.test(String(e.receipt_hash)))fail('anchor_integrity_failed');
    return {bytes:size,last_sequence:e.sequence as string,last_hash:e.receipt_hash as string};
  }
  async function* scan():AsyncGenerator<AnchorReceiptEntry,AnchorVerification>{
    const started=performance.now();const {file,size}=await openJournal();
    try{
      let tail:AnchorTail={bytes:0,last_sequence:null,last_hash:ZERO_HASH},entries=0;
      for await(const raw of journalEntries(file,size)){
        const entry=checkEntry(raw,ownerScopeHash,tail);
        tail={bytes:0,last_sequence:entry.sequence,last_hash:entry.receipt_hash};entries++;
        yield entry;
      }
      return {bytes:size,last_sequence:tail.last_sequence,last_hash:tail.last_hash,entries,scan_ms:performance.now()-started};
    }finally{await file.close();}
  }
  return {
    async readCheckpoint(){const {file,size}=await openJournal();try{return await tailOf(file,size);}finally{await file.close();}},
    readReceipts(){return (async function*(){for await(const entry of scan())yield entry;})();},
    appendExpected(expected,entries){
      return withWriter(path,async()=>{
        const {file,size}=await openJournal();
        try{
          const current=await tailOf(file,size);
          if(current.bytes!==expected.bytes||current.last_hash!==expected.last_hash||current.last_sequence!==expected.last_sequence)fail('anchor_tail_moved');
          let tail=current;const lines:Buffer[]=[];
          for(const entry of entries){
            const checked=checkEntry(entry,ownerScopeHash,tail);
            const line=Buffer.from(canonicalize(checked)+'\n');
            if(line.length-1>MAX_LINE_BYTES)fail('input_limit');
            lines.push(line);tail={bytes:tail.bytes+line.length,last_sequence:checked.sequence,last_hash:checked.receipt_hash};
          }
          if(lines.length){
            const bytes=Buffer.concat(lines);const {bytesWritten}=await file.write(bytes,0,bytes.length);
            if(bytesWritten!==bytes.length)fail('anchor_integrity_failed');
            if(pending)await pending.close();pending=file;
          }else await file.close();
          return tail;
        }catch(e){if(pending!==file)await file.close();throw e;}
      });
    },
    flush(){
      return withWriter(path,async()=>{
        const file=pending??(await openJournal()).file;pending=null;
        try{
          await file.sync();
          for(const directoryPath of [dir,root,dirname(root)]){
            const handle=await open(directoryPath,constants.O_RDONLY);try{await handle.sync();}finally{await handle.close();}
          }
        }finally{await file.close();}
      });
    },
    async verify(){
      const inner=scan();let step=await inner.next();
      while(!step.done)step=await inner.next();
      return step.value;
    },
  };
}
