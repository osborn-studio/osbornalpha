// Public dossier server gate, version reads and replay frame (spec §7.2, D1, D12).
import {notFound,redirect} from 'next/navigation';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {topicsEnabled} from '@/lib/topics/flags';
import {fixtureMode} from '@/lib/topics/e2e-fixture';
import {publicDeps,previewDeps} from '@/lib/topics/deps';
import {readTopic,readVersions} from '@/lib/topics/public-read';
import {TopicError} from '@/lib/topics/errors';
import {UNPUBLISH_REASONS,type UnpublishReason} from '@/lib/topics/types';
import {DossierView} from '@/components/topics/dossier/DossierView';
import type {DossierFailure} from '@/components/topics/dossier/DossierBanner';
export const dynamic='force-dynamic';
export default async function TopicDossierPage({params,searchParams}:{params:Promise<{slug:string;n?:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 if(!topicsEnabled())notFound();
 const {slug,n}=await params,query=await searchParams;
 const version=n===undefined?undefined:/^[1-9]\d*$/.test(n)?Number(n):NaN;
 if(version!==undefined&&!Number.isSafeInteger(version))notFound();
 if(Array.isArray(query.asOf))notFound();
 const asOf=query.asOf;
 let isAdmin=false;
 if(!fixtureMode())try{await requireAdminUser();isAdmin=true;}catch(e){
  if(e instanceof AdminUnauthenticated){
   const path=`/intel/topics/${encodeURIComponent(slug)}${n===undefined?'':`/v/${n}`}${asOf?`?asOf=${encodeURIComponent(asOf)}`:''}`;
   redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  if(!(e instanceof AdminForbidden))throw e;
 }
 const deps=await publicDeps(),open=await deps.db.publicOpen();
 if(!open&&!isAdmin)notFound();
 const preview=!open&&isAdmin,reader=preview?previewDeps():deps,today=reader.now().toISOString().slice(0,10);
 try{
  const dto=await readTopic(reader,slug,{asOf,version}),versions=await readVersions(reader,slug);
  return <DossierView dto={dto} versions={versions} slug={slug} isAdmin={isAdmin} today={today} preview={preview}/>;
 }catch(e){
  if(!(e instanceof TopicError))throw e;
  let failure:DossierFailure;
  const rawReason=e.detail?.reason,reason=typeof rawReason==='string'&&UNPUBLISH_REASONS.includes(rawReason as UnpublishReason)?rawReason as UnpublishReason:null;
  if(e.code==='no_version_at_asof'&&asOf)failure={kind:'no_version',asOf};
  else if(e.code==='version_unpublished')failure={kind:'unpublished',version:Number(e.detail?.version_no??version),reason};
  else if(e.code==='topic_retired')failure={kind:'retired',reason};
  else if(e.code==='not_found'||e.code==='no_version_at_asof'||e.code.startsWith('invalid_parameter:'))notFound();
  else throw e;
  return <DossierView dto={null} failure={failure} slug={slug} isAdmin={isAdmin} today={today} preview={preview}/>;
 }
}
