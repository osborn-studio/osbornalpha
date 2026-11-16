// src/lib/judgments/job-keys.ts
// judgment_job_state keys (spec §5.5b R01): the ONLY constructor of job keys. Every component is
// percent-encoded with encodeURIComponent (':' '@' '%' and non-ASCII become %XX), so an id, version
// or scope key can never collide with the separators; parseJobKey is the exact inverse.
//   produce:<id>@<version>
//   calibrate:<id>@<version>:<scope_type>:<scope_key>     (scope_type all ⇔ scope_key '')
//   calibrate_round                                        (the calibration cron's round cursor; plan audit P2-02)
import {JudgmentError} from './errors';
import type {CalibrationScope,ScopeType} from './types';

const MAX=512;
const SCOPES:readonly string[]=['all','market','subject_type'];
const bad=(what:string):never=>{throw new JudgmentError('invalid_parameter',`job_key:${what}`);};
function enc(s:string,what:string,allowEmpty=false):string{
 if(typeof s!=='string'||(!allowEmpty&&s.length===0))bad(what);
 return encodeURIComponent(s);
}
export function jobKey(kind:'produce',methodologyId:string,version:string):string;
export function jobKey(kind:'calibrate',methodologyId:string,version:string,scope:CalibrationScope):string;
export function jobKey(kind:'calibrate_round'):string;
export function jobKey(kind:'produce'|'calibrate'|'calibrate_round',methodologyId?:string,version?:string,scope?:CalibrationScope):string{
 let key:string;
 if(kind==='calibrate_round')return 'calibrate_round';
 if(typeof methodologyId!=='string'||typeof version!=='string')return bad('methodology');
 if(kind==='produce')key=`produce:${enc(methodologyId,'methodology_id')}@${enc(version,'version')}`;
 else if(kind==='calibrate'){
  if(!scope||!SCOPES.includes(scope.scope_type))return bad('scope_type');
  if((scope.scope_type==='all')!==(scope.scope_key===''))bad('scope_key');
  key=`calibrate:${enc(methodologyId,'methodology_id')}@${enc(version,'version')}:${scope.scope_type}:${enc(scope.scope_key,'scope_key',true)}`;
 }else return bad('kind');
 if(key.length>MAX)bad('too_long');
 return key;
}

export type ParsedJobKey={kind:'produce';methodologyId:string;version:string}|{kind:'calibrate';methodologyId:string;version:string;scope:CalibrationScope}|{kind:'calibrate_round'};
const PARSE=/^(produce|calibrate):([^@:]+)@([^@:]+)(?::(all|market|subject_type):([^@:]*))?$/;
export function parseJobKey(key:string):ParsedJobKey{
 const p=parseLoose(key);
 const back=p.kind==='produce'?jobKey('produce',p.methodologyId,p.version):p.kind==='calibrate'?jobKey('calibrate',p.methodologyId,p.version,p.scope):jobKey('calibrate_round');
 if(back!==key)bad('not_canonical');
 return p;
}
function parseLoose(key:string):ParsedJobKey{
 if(key==='calibrate_round')return {kind:'calibrate_round'};
 const m=PARSE.exec(key);
 if(!m||(m[1]==='produce')!==(m[4]===undefined))return bad('malformed');
 try{
  const id=decodeURIComponent(m[2]),version=decodeURIComponent(m[3]);
  if(m[1]==='produce')return {kind:'produce',methodologyId:id,version};
  return {kind:'calibrate',methodologyId:id,version,scope:{scope_type:m[4] as ScopeType,scope_key:decodeURIComponent(m[5])}};
 }catch{return bad('malformed');}
}
