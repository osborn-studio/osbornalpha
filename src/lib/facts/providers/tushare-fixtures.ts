// Loader and recorder helpers for recorded (or synthetic) Tushare page fixtures shared by tests and scripts.
// A fixture set of one issuer is described by <dir>/<ts_code>.manifest.json:
//   {ts_code, recorded_at, pages:[{file, api, report_type, page, sha256, has_more}]}
// <dir>/<ts_code>.<api>.rt<n>.p<k>.json is the byte-exact response of one page; an optional sibling .meta.json
// carries the recording header (request params, fields, http status). The loader reads ONLY manifest-listed
// pages (a stale page left by an older recording is ignored), verifies every page's sha256, requires the pages
// of each (api, report_type) to be 1..n and the last page's has_more to be false. Recording goes through
// writeRecording (complete generation in a temp dir) and commitRecording (replace the issuer's set, drop pages
// absent from the new manifest). Generational: new page files are named <ts_code>.g<gen>.<api>.rt<n>.p<k>.json (hand-written
// synthetic files have no generation part) so a re-record never overwrites a file the current manifest references; the manifest is
// the only pointer and is replaced last via write-temp + rename; files of older generations are deleted only after that.
// Real fixtures live in fixtures/tushare, hand-written ones in
// fixtures/tushare/_synthetic (request_id "synthetic"; never used for gold assertions).
import {randomBytes} from 'node:crypto';
import {copyFileSync,existsSync,mkdirSync,readFileSync,readdirSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {RawSnapshot} from '../types';
import {sha256Hex,snapshotOf} from './shared';

export const TUSHARE_FIXTURE_DIR=fileURLToPath(new URL('../fixtures/tushare/',import.meta.url));
export const SYNTHETIC_DIR=join(TUSHARE_FIXTURE_DIR,'_synthetic');
const NAME=/^(\d{6}\.(?:SH|SZ|BJ))(?:\.(g[0-9a-z]+))?\.(income|balancesheet|cashflow)\.rt([145])\.p(\d+)\.json$/;
export interface ManifestPage{file:string;api:string;report_type:number;page:number;sha256:string;has_more:boolean}
export interface TushareManifest{ts_code:string;recorded_at:string;pages:ManifestPage[]}
export const manifestName=(tsCode:string)=>`${tsCode}.manifest.json`;
export function tushareFixtureDir(tsCode:string):{dir:string;synthetic:boolean}{
 return existsSync(join(TUSHARE_FIXTURE_DIR,manifestName(tsCode)))?{dir:TUSHARE_FIXTURE_DIR,synthetic:false}:{dir:SYNTHETIC_DIR,synthetic:true};
}
const pageName=(tsCode:string,gen:string,api:string,rt:string|number,page:number)=>`${tsCode}.${gen}.${api}.rt${rt}.p${page}.json`;
export const newGeneration=()=>`g${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
const metaName=(file:string)=>file.replace(/\.json$/,'.meta.json');
const hasMoreOf=(bytes:Uint8Array)=>(JSON.parse(Buffer.from(bytes).toString('utf8')) as {data?:{has_more?:boolean}|null}).data?.has_more===true;

export function loadTushareFixtures(tsCode:string,dir=tushareFixtureDir(tsCode).dir):RawSnapshot[]{
 const mp=join(dir,manifestName(tsCode));
 if(!existsSync(mp))throw new Error(`fixture_manifest_missing:${tsCode}`);
 const manifest=JSON.parse(readFileSync(mp,'utf8')) as TushareManifest;
 if(manifest.ts_code!==tsCode||!Array.isArray(manifest.pages)||manifest.pages.length===0)throw new Error('fixture_manifest_invalid');
 const seen=new Set<string>();const groups=new Map<string,ManifestPage[]>();
 const snaps=manifest.pages.map(entry=>{
  const m=NAME.exec(entry.file);
  if(!m||m[1]!==tsCode||m[3]!==entry.api||Number(m[4])!==entry.report_type||Number(m[5])!==entry.page)throw new Error(`fixture_manifest_entry:${entry.file}`);
  if(seen.has(entry.file))throw new Error(`fixture_manifest_duplicate:${entry.file}`);seen.add(entry.file);
  const fp=join(dir,entry.file);
  if(!existsSync(fp))throw new Error(`fixture_page_missing:${entry.file}`);
  const bytes=new Uint8Array(readFileSync(fp));
  if(sha256Hex(bytes)!==entry.sha256)throw new Error(`fixture_sha256_mismatch:${entry.file}`);
  if(hasMoreOf(bytes)!==entry.has_more)throw new Error(`fixture_has_more_mismatch:${entry.file}`);
  const k=`${entry.api}:${entry.report_type}`;groups.set(k,[...(groups.get(k)??[]),entry]);
  const mpth=join(dir,metaName(entry.file));
  const meta=existsSync(mpth)?JSON.parse(readFileSync(mpth,'utf8')) as Partial<RawSnapshot['meta']>&{recorded_at?:string}:{};
  return snapshotOf(bytes,{source:'tushare',api:entry.api,params:meta.params??{ts_code:tsCode,start_date:'20140101',report_type:String(entry.report_type)},fields:meta.fields,page:entry.page,has_more:entry.has_more,fetched_at:meta.recorded_at??manifest.recorded_at,http_status:meta.http_status??200});
 });
 for(const [k,pages] of groups){
  const nums=pages.map(p=>p.page).sort((a,b)=>a-b);
  if(nums.some((n,i)=>n!==i+1))throw new Error(`fixture_pages_not_contiguous:${k}`);
  if(pages.find(p=>p.page===nums.length)!.has_more)throw new Error(`fixture_last_page_has_more:${k}`);
 }
 return snaps.sort((a,b)=>String(a.meta.api).localeCompare(String(b.meta.api))||String((a.meta.params as {report_type:string}).report_type).localeCompare(String((b.meta.params as {report_type:string}).report_type))||(a.meta.page??0)-(b.meta.page??0));
}

/** Writes one complete recording generation (pages, metas, manifest last) into an empty/new directory and validates it by loading it back. */
export function writeRecording(dir:string,tsCode:string,snaps:RawSnapshot[],recordedAt=new Date().toISOString(),gen=newGeneration()):TushareManifest{
 mkdirSync(dir,{recursive:true});
 const pages:ManifestPage[]=[];
 for(const s of snaps){
  const rt=Number((s.meta.params as {report_type:string}).report_type),page=s.meta.page??1,file=pageName(tsCode,gen,String(s.meta.api),rt,page);
  writeFileSync(join(dir,file),s.bytes);
  writeFileSync(join(dir,metaName(file)),JSON.stringify({recorded_at:s.meta.fetched_at,sha256:s.sha256,http_status:s.meta.http_status,has_more:s.meta.has_more,params:s.meta.params,fields:s.meta.fields},null,1));
  pages.push({file,api:String(s.meta.api),report_type:rt,page,sha256:s.sha256,has_more:s.meta.has_more===true});
 }
 pages.sort((a,b)=>a.file.localeCompare(b.file));
 const manifest:TushareManifest={ts_code:tsCode,recorded_at:recordedAt,pages};
 writeFileSync(join(dir,manifestName(tsCode)),JSON.stringify(manifest,null,1));
 loadTushareFixtures(tsCode,dir);   // throws on any inconsistency, before anything reaches the fixture directory
 return manifest;
}

/**
 * Publishes the validated recording in srcDir as the issuer's current set in dstDir. Order: (1) copy every new-generation
 * file under a temp name and rename it (new names, so nothing the current manifest references is touched), (2) replace the
 * manifest via write-temp + rename — the only pointer, (3) delete files of older generations not referenced by the new
 * manifest. A failure before (2) leaves the old generation loadable; leftovers of the failed generation are ignored by the
 * loader and swept by the next successful commit. `beforeManifest` is a test hook for the failure window.
 */
export function commitRecording(srcDir:string,dstDir:string,tsCode:string,hooks:{beforeManifest?:()=>void}={}):{written:string[];removed:string[]}{
 loadTushareFixtures(tsCode,srcDir);
 mkdirSync(dstDir,{recursive:true});
 const manifest=JSON.parse(readFileSync(join(srcDir,manifestName(tsCode)),'utf8')) as TushareManifest;
 const files=manifest.pages.flatMap(p=>[p.file,metaName(p.file)].filter(f=>existsSync(join(srcDir,f))));
 const swap=(f:string)=>{const tmp=join(dstDir,`.${f}.${process.pid}.tmp`);copyFileSync(join(srcDir,f),tmp);renameSync(tmp,join(dstDir,f));};
 files.forEach(swap);
 hooks.beforeManifest?.();
 swap(manifestName(tsCode));
 const keep=new Set([...files,manifestName(tsCode)]);
 const prefix=`${tsCode}.`;
 const removed=readdirSync(dstDir).filter(f=>f.startsWith(prefix)&&!keep.has(f));
 for(const f of removed)rmSync(join(dstDir,f));
 return {written:[...keep],removed};
}
