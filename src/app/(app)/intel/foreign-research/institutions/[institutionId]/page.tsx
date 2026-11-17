// Anon-only institution page (spec §9.1).
import {notFound} from 'next/navigation';
import {UUID_RE} from '@/lib/facts/public-route';
import {anonPublicDeps,institutionPageData} from '@/lib/broker-research/public-read';
import {InstitutionView} from '../../components/InstitutionView';
export const dynamic='force-dynamic';
export default async function ForeignResearchInstitutionPage({params}:{params:Promise<{institutionId:string}>}){const {institutionId}=await params;if(!UUID_RE.test(institutionId))notFound();const data=await institutionPageData(anonPublicDeps(),institutionId.toLowerCase());if(!data)notFound();return <InstitutionView data={data}/>;}
