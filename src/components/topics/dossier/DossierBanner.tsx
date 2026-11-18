// Mutually exclusive dossier banners (spec §7.2, D12).
import Link from 'next/link';
import type {Route} from 'next';
import {useTranslations} from 'next-intl';
import type {DossierBannerModel} from './dossier-model';
import type {UnpublishReason} from '@/lib/topics/types';
export type DossierFailure={kind:'unpublished';version:number;reason:UnpublishReason|null}|{kind:'retired';reason:UnpublishReason|null}|{kind:'no_version';asOf:string};
export function DossierBanner({banner,slug,version}:{banner:DossierBannerModel|DossierFailure;slug:string;version?:number}){
 const t=useTranslations('topics');if(!banner)return null;
 const href=`/intel/topics/${encodeURIComponent(slug)}`;
 const reason='reason' in banner?t(`unpublishReasons.${banner.reason??'unknown'}`):'';
 let title:string,body:string|null=null,link:string|null=null;
 switch(banner.kind){
  case 'superseded':title=t('banners.superseded',{version:version??'',current:banner.current});link=t('banners.seeCurrent');break;
  case 'unpublished':title=t('banners.unpublished',{version:'version' in banner?banner.version:version??''});body=t('banners.unpublishedBody',{reason});break;
  case 'retired':title=t('banners.retired');body=t('banners.retiredBody',{reason});break;
  case 'no_version':title=t('banners.replay',{date:banner.asOf});body=t('banners.noVersion');link=t('banners.returnNow');break;
  case 'replay':title=t('banners.replay',{date:banner.asOf});body=t('banners.replayBody');link=t('banners.returnNow');break;
 }
 return <aside role="status" data-dossier-banner={banner.kind} className="rounded border border-border bg-bg-elevated p-4 text-sm space-y-2">
  <p className="font-medium font-mono tabular-nums">{title}</p>{body&&<p className="text-text-dim">{body}</p>}{link&&<Link href={href as Route} className="text-accent">{link}</Link>}
 </aside>;
}
