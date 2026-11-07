// src/app/api/admin/companies/[ticker]/filings/route.ts
// Admin twin (spec §6.4): same body; requireAdminUser; private, no-store.
import {companyRoute} from '@/lib/company/route';
import {FILINGS_PARAMS,filingsHandler} from '@/lib/company/handlers/filings';
export const dynamic='force-dynamic';
export const GET=companyRoute({tag:'admin/companies/filings',mode:'admin',params:FILINGS_PARAMS,handler:filingsHandler});
