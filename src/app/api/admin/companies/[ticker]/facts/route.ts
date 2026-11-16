// src/app/api/admin/companies/[ticker]/facts/route.ts
// Admin twin of the drawer series (spec §6.4): CN PDF conditions exempt; private, no-store.
import {companyRoute} from '@/lib/company/route';
import {FACTS_PARAMS,factsHandler} from '@/lib/company/handlers/facts';
export const dynamic='force-dynamic';
export const GET=companyRoute({tag:'admin/companies/facts',mode:'admin',params:FACTS_PARAMS,handler:factsHandler});
