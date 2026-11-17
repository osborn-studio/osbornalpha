// Institution, append-only rating-scale and analyst maintenance (spec §4.5, §4.9, §9.1; D6).
// Writes use the DB contract; analyst disclosure changes invalidate approved texts in the DB.
import {auditAdmin} from './audit';
import {bad,conflict,notFound} from './errors';
import {boolField,enumField,strField,uuidParam} from './admin-route';
import type {CoreDeps} from './deps';
import {BrokerResearchDbError} from './types';
import type {AnalystRow,InstitutionRow,NormalizedRating,RatingScaleRow} from './types';
const RATINGS:readonly NormalizedRating[]=['buy','overweight','neutral','underweight','sell','not_rated'];
const strings=(b:Record<string,unknown>,k:string):string[]=>{
 const v=b[k]===undefined?[]:b[k];
 if(!Array.isArray(v)||v.some(x=>typeof x!=='string'||!x.trim()||x.length>120))throw bad(`invalid_parameter:${k}`);
 return v as string[];
};
const day=(b:Record<string,unknown>,k:string):string=>{
 const s=b[k];
 if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||s.startsWith('0000-'))throw bad(`invalid_parameter:${k}`);
 const date=new Date(`${s}T00:00:00Z`);
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==s)throw bad(`invalid_parameter:${k}`);
 return s;
};
const httpUrl=(v:string|undefined,k:string):string|null=>{
 if(v===undefined)return null;
 try{const url=new URL(v);if(!/^https?:\/\/\S+$/i.test(v)||!['http:','https:'].includes(url.protocol)||!url.hostname)throw new Error('url');}
 catch{throw bad(`invalid_parameter:${k}`);}
 return v;
};
async function write<T>(fn:()=>Promise<T>):Promise<T>{
 try{return await fn();}catch(e){
  if(e instanceof BrokerResearchDbError&&['duplicate_key','scale_closed','analyst_immutable'].includes(e.code))throw conflict(e.code);
  throw e;
 }
}
export async function institutionOr404(deps:Pick<CoreDeps,'db'>,id:string):Promise<InstitutionRow>{
 const institution=(await deps.db.listInstitutions()).find(i=>i.institution_id===id);
 if(!institution)throw notFound('institution_not_found');return institution;
}
export async function upsertInstitution(deps:CoreDeps,b:Record<string,unknown>,by:string):Promise<string>{
 const row={...(b.institution_id!==undefined?{institution_id:uuidParam(b.institution_id,'institution_id')}:{}),
  name_en:strField(b,'name_en',{max:200}),name_zh:strField(b,'name_zh',{max:200,optional:true})??null,aliases:strings(b,'aliases'),
  kind:strField(b,'kind',{max:40,optional:true})??null,rating_disclosure_url:httpUrl(strField(b,'rating_disclosure_url',{max:2000,optional:true}),'rating_disclosure_url')};
 const id=await write(()=>deps.db.upsertInstitution(row));
 await auditAdmin(deps.tables,by,'broker_research.institution_upsert',id,{name_en:row.name_en},deps.now());return id;
}
export async function addScale(deps:CoreDeps,institutionId:string,b:Record<string,unknown>,by:string):Promise<string>{
 await institutionOr404(deps,institutionId);
 const row:Omit<RatingScaleRow,'scale_id'|'created_at'|'closed_by'|'closed_at'|'valid_to'>={institution_id:institutionId,raw_label:strField(b,'raw_label',{max:80}),
  normalized:enumField(b,'normalized',RATINGS),source_url:httpUrl(strField(b,'source_url',{max:2000}),'source_url')!,valid_from:day(b,'valid_from'),created_by:by};
 const id=await write(()=>deps.db.insertRatingScale(row));
 await auditAdmin(deps.tables,by,'broker_research.rating_scale_insert',id,{institution_id:institutionId,normalized:row.normalized,valid_from:row.valid_from},deps.now());return id;
}
export async function closeScale(deps:CoreDeps,institutionId:string,scaleId:string,b:Record<string,unknown>,by:string):Promise<void>{
 const validTo=day(b,'valid_to');
 const row=(await deps.db.listRatingScales(institutionId)).find(s=>s.scale_id===scaleId);
 if(!row)throw notFound('scale_not_found');
 if(validTo<=row.valid_from)throw bad('invalid_parameter:valid_to');
 await write(()=>deps.db.closeRatingScale(scaleId,validTo,by));
 await auditAdmin(deps.tables,by,'broker_research.rating_scale_close',scaleId,{institution_id:institutionId,valid_to:validTo},deps.now());
}
export async function upsertAnalyst(deps:CoreDeps,institutionId:string,b:Record<string,unknown>,by:string):Promise<string>{
 await institutionOr404(deps,institutionId);
 const row:Omit<AnalystRow,'analyst_id'|'created_at'>&{analyst_id?:string}={...(b.analyst_id!==undefined?{analyst_id:uuidParam(b.analyst_id,'analyst_id')}:{}),institution_id:institutionId,
  display_name:strField(b,'display_name',{max:200}),name_variants:strings(b,'name_variants'),public_display:boolField(b,'public_display',false)};
 if(row.analyst_id&&!(await deps.db.listAnalysts(institutionId)).some(a=>a.analyst_id===row.analyst_id))throw notFound('analyst_not_found');
 const id=await write(()=>deps.db.upsertAnalyst(row));
 await auditAdmin(deps.tables,by,'broker_research.analyst_upsert',id,{institution_id:institutionId,public_display:row.public_display},deps.now());return id;
}
