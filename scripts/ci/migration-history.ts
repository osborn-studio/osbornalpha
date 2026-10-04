/** Compare a sanitized operator export offline. Never connects to or mutates a database. */
import {createHash} from 'node:crypto';

type Migration = {file:string;sha256:string};
const fail=(code:string):never=>{throw new Error(code);};
const versionPattern=/^\d{14}$/;
export function verifyMigrationHistory(local:Migration[],input:unknown,expectedProject:string,now=new Date()) {
 if(!/^[a-z0-9-]{3,64}$/.test(expectedProject)||!Number.isFinite(now.getTime()))fail('INVALID_EXPECTATION');
 if(!local.length)fail('LOCAL_HISTORY_INVALID');
 const localVersions=local.map(m=>{
  if(!/^\d{14}_[a-zA-Z0-9_-]+\.sql$/.test(m.file)||!/^[a-f0-9]{64}$/.test(m.sha256))fail('LOCAL_HISTORY_INVALID');
  return m.file.slice(0,14);
 });
 if(localVersions.some((v,i)=>i>0&&v<=localVersions[i-1]))fail('LOCAL_HISTORY_INVALID');
 if(!input||typeof input!=='object'||Array.isArray(input))fail('HISTORY_FORMAT_INVALID');
 const h=input as Record<string,unknown>;
 if(Object.keys(h).sort().join(',')!=='captured_at,project_ref,schema_version,versions'||h.schema_version!==1)fail('HISTORY_FORMAT_INVALID');
 if(h.project_ref!==expectedProject)fail('PROJECT_MISMATCH');
 const captured=typeof h.captured_at==='string'?new Date(h.captured_at):new Date(NaN);
 if(!Number.isFinite(captured.getTime())||captured.toISOString()!==h.captured_at)fail('CAPTURE_TIME_INVALID');
 const age=now.getTime()-captured.getTime();
 if(age<0||age>86400000)fail('HISTORY_NOT_CURRENT');
 if(!Array.isArray(h.versions)||!h.versions.length||h.versions.length>10000)fail('HISTORY_FORMAT_INVALID');
 const versions=h.versions as unknown[];
 if(versions.some(v=>typeof v!=='string'||!versionPattern.test(v)))fail('HISTORY_FORMAT_INVALID');
 const applied=versions as string[];
 for(let i=0;i<applied.length;i++){
  const v=applied[i];
  if(i>0&&v<=applied[i-1])fail('HISTORY_ORDER_INVALID');
  if(!localVersions.includes(v))fail('UNKNOWN_APPLIED_VERSION');
  if(v!==localVersions[i])fail('HISTORY_GAP');
 }
 return {
  schema_version:1,scope:'offline_declared_version_history',project_ref:expectedProject,captured_at:h.captured_at,
  compared_at:now.toISOString(),appliedCount:versions.length,pending:local.slice(versions.length).map(m=>m.file),
  localInventorySha256:createHash('sha256').update(JSON.stringify(local)).digest('hex'),
  historySha256:createHash('sha256').update(JSON.stringify({schema_version:1,project_ref:h.project_ref,captured_at:h.captured_at,versions})).digest('hex'),
  productionSqlEquivalence:'not_verified',captureAuthenticity:'not_verified',authorizesExecution:false,
 };
}
