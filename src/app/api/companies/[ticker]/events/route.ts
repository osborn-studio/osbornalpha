// src/app/api/companies/[ticker]/events/route.ts
// Public company events (spec §6.1): service_role read server-side, values gated; never reads the session.
import {companyRoute} from '@/lib/company/route';
import {EVENTS_PARAMS,eventsHandler} from '@/lib/company/handlers/events';
export const dynamic='force-dynamic';
export const GET=companyRoute({tag:'companies/events',mode:'public',params:EVENTS_PARAMS,handler:eventsHandler});
