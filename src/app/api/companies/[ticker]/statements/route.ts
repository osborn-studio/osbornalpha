// src/app/api/companies/[ticker]/statements/route.ts
// Public statements grid (spec §6.1). Gated for everyone; never reads the session (§6.4).
import {companyRoute} from '@/lib/company/route';
import {STATEMENTS_PARAMS,statementsHandler} from '@/lib/company/handlers/statements';
export const dynamic='force-dynamic';
export const GET=companyRoute({tag:'companies/statements',mode:'public',params:STATEMENTS_PARAMS,handler:statementsHandler});
