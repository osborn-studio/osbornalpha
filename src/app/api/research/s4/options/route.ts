import {requireS4Actor} from '@/lib/research/s4/auth';
import {s4Http} from '@/lib/research/s4/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
import {researchOptions} from '@/lib/research/s4/read';
export async function GET(req:Request){return s4Http(async()=>researchOptions(await requireS4Actor(req)));}
