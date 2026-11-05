// Loader for recorded (or synthetic) Tushare page fixtures shared by tests and scripts:
// <dir>/<ts_code>.<api>.rt<n>.p<k>.json is the byte-exact response; an optional sibling .meta.json carries
// the recording header. Real fixtures live in fixtures/tushare, hand-written ones in fixtures/tushare/_synthetic
// (request_id "synthetic"; never used for gold assertions).
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {RawSnapshot} from '../types';
import {snapshotOf} from './shared';

export const TUSHARE_FIXTURE_DIR=fileURLToPath(new URL('../fixtures/tushare/',import.meta.url));
export const SYNTHETIC_DIR=join(TUSHARE_FIXTURE_DIR,'_synthetic');
const NAME=/^(.+?)\.(income|balancesheet|cashflow)\.rt([145])\.p(\d+)\.json$/;
export function tushareFixtureDir(tsCode:string):{dir:string;synthetic:boolean}{
 return existsSync(join(TUSHARE_FIXTURE_DIR,`${tsCode}.income.rt1.p1.json`))?{dir:TUSHARE_FIXTURE_DIR,synthetic:false}:{dir:SYNTHETIC_DIR,synthetic:true};
}
export function loadTushareFixtures(tsCode:string,dir=tushareFixtureDir(tsCode).dir):RawSnapshot[]{
 return readdirSync(dir).map(n=>NAME.exec(n)).filter((m):m is RegExpExecArray=>!!m&&m[1]===tsCode).sort((a,b)=>a[0].localeCompare(b[0])).map(m=>{
  const bytes=new Uint8Array(readFileSync(join(dir,m[0])));
  const metaPath=join(dir,m[0].replace(/\.json$/,'.meta.json'));
  const meta=existsSync(metaPath)?JSON.parse(readFileSync(metaPath,'utf8')) as Partial<RawSnapshot['meta']>&{recorded_at?:string}:{};
  const json=JSON.parse(Buffer.from(bytes).toString('utf8')) as {data?:{has_more?:boolean}|null};
  return snapshotOf(bytes,{source:'tushare',api:m[2],params:meta.params??{ts_code:tsCode,start_date:'20140101',report_type:m[3]},fields:meta.fields,page:Number(m[4]),has_more:meta.has_more??json.data?.has_more===true,fetched_at:meta.recorded_at??'1970-01-01T00:00:00.000Z',http_status:meta.http_status??200});
 });
}
