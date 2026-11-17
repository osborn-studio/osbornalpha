// Anon-only report detail; all hidden cases share 404 (spec §9.3).
import {notFound} from 'next/navigation';
import {UUID_RE,utcDate} from '@/lib/facts/public-route';
import {anonPublicDeps,reportPageData} from '@/lib/broker-research/public-read';
import {ReportView} from '../components/ReportView';
export const dynamic='force-dynamic';
export default async function ForeignResearchReportPage({params}:{params:Promise<{reportId:string}>}){const {reportId}=await params;if(!UUID_RE.test(reportId))notFound();const data=await reportPageData(anonPublicDeps(),reportId.toLowerCase(),utcDate(new Date()));if(!data)notFound();return <ReportView data={data}/>;}
