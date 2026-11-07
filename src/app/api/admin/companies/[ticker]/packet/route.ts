// src/app/api/admin/companies/[ticker]/packet/route.ts
// Admin twin of the packet (spec §6.4): CN PDF conditions exempt; private, no-store.
import {companyRoute} from '@/lib/company/route';
import {PACKET_PARAMS,packetHandler} from '@/lib/company/handlers/packet';
export const dynamic='force-dynamic';
export const GET=companyRoute({tag:'admin/companies/packet',mode:'admin',params:PACKET_PARAMS,handler:packetHandler});
