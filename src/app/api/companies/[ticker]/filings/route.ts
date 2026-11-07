// src/app/api/companies/[ticker]/filings/route.ts
// Public filings list (spec §5.5). No values, no gate; never reads the session.
import {companyRoute} from '@/lib/company/route';
import {FILINGS_PARAMS,filingsHandler} from '@/lib/company/handlers/filings';
export const dynamic='force-dynamic';
export const GET=companyRoute({tag:'companies/filings',mode:'public',params:FILINGS_PARAMS,handler:filingsHandler});
