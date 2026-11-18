// Dossier version controls (spec §7.2, A15).
import type {DossierDto,VersionMeta} from '@/lib/topics/public-dto';
import zh from '../../../../messages/zh/topics.json';
import en from '../../../../messages/en/topics.json';
import {formatDossierDate} from './dossier-model';
export function versionBarModel(dto:DossierDto,{isAdmin,today,locale='zh',versions=[dto.version]}:{isAdmin:boolean;today:string;locale?:string;versions?:VersionMeta[]}){
 const copy=(locale==='en'?en:zh).version,base=`/intel/topics/${encodeURIComponent(dto.topic.slug)}`;
 const label=(v:VersionMeta)=>`v${v.version_no}${v.unpublished_at?` · ${copy.unpublished}`:v.is_current?` · ${copy.current}`:v.superseded?` · ${copy.superseded}`:''}`;
 return {chips:[label(dto.version),`${copy.published} ${formatDossierDate(dto.version.published_at)}`,`${copy.cutoff} ${formatDossierDate(dto.version.cutoff)}`],
  options:[...versions].sort((a,b)=>b.version_no-a.version_no).map(v=>({value:v.version_no,label:label(v),disabled:v.unpublished_at!==null,href:v.is_current?base:`${base}/v/${v.version_no}`})),
  totalText:copy.total.replace('{total}',String(dto.total_versions)),adminHref:isAdmin?'/admin/topics':null,maxDate:today,baseHref:base,
  driftChip:dto.drift_unchecked?{text:copy.unchecked,checkedText:copy.checked.replace('{date}',dto.drift_checked_at?formatDossierDate(dto.drift_checked_at):copy.neverChecked)}:null};
}
