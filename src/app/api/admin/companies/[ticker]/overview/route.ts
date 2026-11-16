// src/app/api/admin/companies/[ticker]/overview/route.ts
// Admin twin (spec §6.4): CN PDF conditions exempt; private, no-store.
import {companyRoute} from '@/lib/company/route';
import {OVERVIEW_PARAMS,overviewHandler} from '@/lib/company/handlers/overview';
export const dynamic='force-dynamic';
export const GET=companyRoute({tag:'admin/companies/overview',mode:'admin',params:OVERVIEW_PARAMS,handler:overviewHandler});
