// src/app/api/companies/[ticker]/packet/route.ts
// Public Copilot packet (spec §6.1, §9.2): gated, ≤ 32 KB; never reads the session.
import {companyRoute} from '@/lib/company/route';
import {PACKET_PARAMS,packetHandler} from '@/lib/company/handlers/packet';
export const dynamic='force-dynamic';
export const GET=companyRoute({tag:'companies/packet',mode:'public',params:PACKET_PARAMS,handler:packetHandler});
