import {requireS4Actor} from '@/lib/research/s4/auth';
import {s4Http,bodyText} from '@/lib/research/s4/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
import {listCandidates} from '@/lib/research/s4/read';
import {importCandidate} from '@/lib/research/s4/import';
export async function GET(req:Request){return s4Http(async()=>({candidates:await listCandidates(await requireS4Actor(req))}));}
export async function POST(req:Request){return s4Http(async()=>importCandidate(await requireS4Actor(req),await bodyText(req)));}
