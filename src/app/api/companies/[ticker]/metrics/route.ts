// src/app/api/companies/[ticker]/metrics/route.ts
// Public metrics proxy (spec §6.1): never reads the session.
import {companyRoute} from '@/lib/company/route';
import {METRICS_PARAMS,metricsHandler} from '@/lib/company/handlers/metrics';
export const dynamic='force-dynamic';
export const GET=companyRoute({tag:'companies/metrics',mode:'public',params:METRICS_PARAMS,handler:metricsHandler});
