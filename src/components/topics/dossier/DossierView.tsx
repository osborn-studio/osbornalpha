// Public dossier composition and future feature mount points (spec §7.2).
'use client';
import Link from 'next/link';
import {useLocale,useTranslations} from 'next-intl';
import type {DossierDto,VersionMeta} from '@/lib/topics/public-dto';
import {dossierModel} from './dossier-model';
import {VersionBar} from './VersionBar';
import {DossierBanner,type DossierFailure} from './DossierBanner';
import {SectionBlock} from './SectionBlock';
type Props={slug:string;isAdmin:boolean;today:string;preview?:boolean;onOpenSource?:(ordinal:number)=>void}&(
 |{dto:DossierDto;versions:VersionMeta[];failure?:never}
 |{dto:null;versions?:never;failure:DossierFailure});
export function DossierView(props:Props){
 const locale=useLocale(),t=useTranslations('topics');
 const {dto,slug,isAdmin,today,preview=false,onOpenSource=()=>{}}=props;
 const model=dto?dossierModel(dto,locale):null;
 return <main className="min-w-0 space-y-5">
  {dto?<VersionBar dto={dto} versions={props.versions} isAdmin={isAdmin} today={today}/>:<div data-version-bar className="flex flex-wrap gap-2 border-y border-border py-3 text-xs text-text-dim"><span>{t('version.caption')}</span>{props.failure.kind==='unpublished'&&<span className="font-mono tabular-nums">v{props.failure.version} · {t('version.unpublished')}</span>}{isAdmin&&<Link href="/admin/topics" className="text-accent">{t('version.manage')}</Link>}</div>}
  <DossierBanner banner={model?.banner??props.failure??null} slug={slug} version={dto?.version.version_no}/>
  {preview&&<p className="text-xs text-text-dim">{t('directory.previewBanner.title')}</p>}
  <header className="space-y-3">
   <nav aria-label={t('meta.title')} className="text-xs text-text-dim"><Link href="/intel/topics" className="text-accent">{t('meta.title')}</Link>{model&&<> / {model.breadcrumb[1]}</>}</nav>
   <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold">{model?.title??t('meta.title')}</h1>{dto&&<span className="rounded border border-border px-2 py-1 text-xs text-text-dim">{t(`directory.categories.${dto.topic.category}`)}</span>}</div>
   {model&&<p className="text-sm text-text-dim">{model.dek}</p>}
  </header>
  {/* T4.8: summary panel mount point (dto.summary). */}
  {model?.sections.map(section=><SectionBlock key={section.key} section={section} onOpenSource={onOpenSource}/>)}
  {/* T4.6: section chart adapters mount through SectionBlock. */}
  {/* T4.7: entries and footer mount point; two columns at lg. */}
  {/* T4.5: source drawer mount point, driven by onOpenSource(ordinal). */}
  {/* T4.9: phone-specific dossier composition mount point. */}
 </main>;
}
