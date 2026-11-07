// Integrity registration for human-authored gold. This never accepts gold on a human's behalf.
import {closeSync,existsSync,lstatSync,openSync,readFileSync,realpathSync,renameSync,unlinkSync,writeFileSync,fsyncSync,fchmodSync} from 'node:fs';
import {isAbsolute,join} from 'node:path';
import {assessGoldAdmission} from './admission';
import {GOLD_DIR,LEGACY_PLAN2_PATH,LOCK_PATH,RECORDERS_PATH,parseGoldBytes,parseLock,parseRecorders,repoPath} from './load';

/** Explicitly invoked by an operator after human transcription/review; lock presence is integrity,
 * not approval. Existing gold-diff CI and release-manifest requirements continue to apply.
 * A fixed exclusive staging file serializes cooperating writers; a stale file fails closed. */
export function updateGoldLock(path:string,root:string=process.cwd()){
 const base=realpathSync(root),rel=repoPath(path,base);
 if(isAbsolute(path)||rel!==path||(!rel.startsWith(`${GOLD_DIR}/`)&&rel!==LEGACY_PLAN2_PATH)||!rel.endsWith('.json')||[LOCK_PATH,RECORDERS_PATH].includes(rel))throw new Error('candidate_path_invalid');
 const safePath=(p:string)=>{
  const full=join(base,p);
  if(lstatSync(full).isSymbolicLink()||realpathSync(full)!==full)throw new Error(p===LOCK_PATH?'lock_symlink':'input_symlink');
  return full;
 };
 const lockPath=safePath(LOCK_PATH),pending=`${lockPath}.pending`;
 // O_EXCL refuses existing files and symlinks. Do not remove another writer's staging file.
 const fd=openSync(pending,'wx',0o600);
 let renamed=false;
 try{
  const candidatePath=safePath(rel),recordersPath=safePath(RECORDERS_PATH);
  const bytes=readFileSync(candidatePath),recorderBytes=readFileSync(recordersPath),lockBytes=readFileSync(lockPath);
  const set=parseGoldBytes(bytes,rel,parseRecorders(JSON.parse(recorderBytes.toString('utf8'))));
  const lock=parseLock(JSON.parse(lockBytes.toString('utf8')));
  const entry={path:rel,sha256:set.sha256,version:set.version,format:set.format};
  const admission=assessGoldAdmission(set,{files:[entry]});
  if(!admission.ok)throw new Error(`candidate_not_admissible:${[...new Set(admission.findings.map(f=>f.code))].join(',')}`);
  const previous=lock.files.find(f=>f.path===rel);
  const changed=!previous||previous.sha256!==entry.sha256||previous.version!==entry.version||previous.format!==entry.format;
  // Conservative byte-level policy: even a formatting-only change needs a version bump.
  // A legacy migration also needs a higher version; migration never resets history.
  if(previous&&changed&&entry.version<=previous.version)throw new Error('version_must_increase');
  const result={changed,scope:'integrity_lock_only' as const,set:entry,not_verified:admission.not_verified};
  if(!changed)return result;
  const next={files:previous?lock.files.map(f=>f.path===rel?entry:f):[...lock.files,entry]};
  writeFileSync(fd,`${JSON.stringify(next,null,1)}\n`);
  fchmodSync(fd,lstatSync(lockPath).mode&0o777);
  fsyncSync(fd);
  // Refuse external edits while preparing the update, including input path replacements.
  for(const [p,expected] of [[rel,bytes],[RECORDERS_PATH,recorderBytes],[LOCK_PATH,lockBytes]] as const){
   if(!readFileSync(safePath(p)).equals(expected))throw new Error('inputs_changed');
  }
  renameSync(pending,lockPath);renamed=true;
  return result;
 }finally{
  closeSync(fd);
  if(!renamed&&existsSync(pending))unlinkSync(pending);
 }
}
