// src/app/api/admin/companies/[ticker]/events/route.ts
// Admin twin (spec §6.4): CN PDF conditions exempt; private, no-store.
import {companyRoute} from '@/lib/company/route';
import {EVENTS_PARAMS,eventsHandler} from '@/lib/company/handlers/events';
export const dynamic='force-dynamic';
export const GET=companyRoute({tag:'admin/companies/events',mode:'admin',params:EVENTS_PARAMS,handler:eventsHandler});
