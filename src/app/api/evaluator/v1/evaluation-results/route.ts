import {evaluatorRpc} from '@/lib/research/s6/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:Request){return evaluatorRpc(req,'commit');}
