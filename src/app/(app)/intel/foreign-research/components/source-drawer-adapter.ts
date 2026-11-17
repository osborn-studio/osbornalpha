// Only explicitly selected public metadata enters the evidence drawer.
import type {SourceDrawerAdapter,DrawerText} from '@/components/research-ui/source-drawer/types';
import type {PublicInstitutionRef,PublicReportDetailDto} from '@/lib/broker-research/public-types';
import type {DrawerSubject} from './SourceDrawer';
export interface BrokerMetadata{
 reportId:string;institution:PublicInstitutionRef|null;title:string;reportDate:string|null;
 licence:PublicReportDetailDto['licence']|null;
}
export interface BrokerDrawerTarget{
 subject:DrawerSubject;availableAt:string|null;codeVersion:string|null;rulesVersion:string|null;publicationId:string|null;
 metadata?:BrokerMetadata;text:DrawerText;
}
export const brokerDrawerInput:SourceDrawerAdapter<BrokerDrawerTarget>=({availableAt,codeVersion,rulesVersion,publicationId,metadata:m,text:t})=>({
 variant:'ok',
 payload:{
  kind:'broker_report_meta',
  identity:{id:publicationId??m?.reportId??'',label:[m?.institution?.nameEn,m?.title].filter(Boolean).join(' · ')},
  source:{publisher:m?.institution?.nameEn??'',adapter:'',url:null,locator:null,evidence_sha256:null},
  times:{period:m?.reportDate??'',available_at:availableAt??'',ingested_at:null},
  transform:{code_version:codeVersion,mapping_version:rulesVersion,method_version:null},
  licence:{status:'',note_key:'public.drawer.privateLibrary'},
  attribution_key:'public.foundation.ownership',
  links:{module_href:m?`/intel/foreign-research/${encodeURIComponent(m.reportId)}`:'/intel/foreign-research'},
 },
 extras:{
  mark:'fact',
  rows:{
   identity:[{key:'institution',label:t('public.list.columns.institution'),value:m?.institution?.nameEn??''},{key:'reportDate',label:t('public.list.columns.published'),value:m?.reportDate??''}],
   source:[{key:'pdf',label:t('public.list.columns.original'),value:'',state:'withheld'}],
   times:[{key:'publishedAt',label:t('public.drawer.publishedAt'),value:'',state:'missing'}],
   transform:[{key:'extractionModel',label:t('public.drawer.extractionModel'),value:'',state:'missing'}],
   licence:m?.licence?[{key:'summaryPublic',label:t('public.drawer.summaryPublic'),value:t(m.licence.summaryPublic?'public.drawer.allowed':'public.drawer.notAllowed')}]:[],
  },
  links:m?.institution?[{label:m.institution.nameEn,href:`/intel/foreign-research/institutions/${encodeURIComponent(m.institution.id)}`}]:[],
 },
});
