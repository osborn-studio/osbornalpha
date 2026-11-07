// src/app/api/companies/[ticker]/overview/route.ts
// Public overview (spec §6.1): never reads the session.
import {companyRoute} from '@/lib/company/route';
import {OVERVIEW_PARAMS,overviewHandler} from '@/lib/company/handlers/overview';
export const dynamic='force-dynamic';
export const GET=companyRoute({tag:'companies/overview',mode:'public',params:OVERVIEW_PARAMS,handler:overviewHandler});
