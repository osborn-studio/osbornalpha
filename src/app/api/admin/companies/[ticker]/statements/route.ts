// src/app/api/admin/companies/[ticker]/statements/route.ts
// Admin twin (spec §6.4, §0 #63): same params and shape; CN PDF conditions exempt; requireAdminUser; private, no-store.
import {companyRoute} from '@/lib/company/route';
import {STATEMENTS_PARAMS,statementsHandler} from '@/lib/company/handlers/statements';
export const dynamic='force-dynamic';
export const GET=companyRoute({tag:'admin/companies/statements',mode:'admin',params:STATEMENTS_PARAMS,handler:statementsHandler});
