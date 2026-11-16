// src/app/api/companies/[ticker]/facts/route.ts
// Public drawer series (spec §5.6, §0 #68). Gated; never reads the session.
import {companyRoute} from '@/lib/company/route';
import {FACTS_PARAMS,factsHandler} from '@/lib/company/handlers/facts';
export const dynamic='force-dynamic';
export const GET=companyRoute({tag:'companies/facts',mode:'public',params:FACTS_PARAMS,handler:factsHandler});
