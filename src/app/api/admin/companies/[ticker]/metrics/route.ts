// src/app/api/admin/companies/[ticker]/metrics/route.ts
// Admin twin (spec §6.4): CN PDF conditions exempt; private, no-store.
import {companyRoute} from '@/lib/company/route';
import {METRICS_PARAMS,metricsHandler} from '@/lib/company/handlers/metrics';
export const dynamic='force-dynamic';
export const GET=companyRoute({tag:'admin/companies/metrics',mode:'admin',params:METRICS_PARAMS,handler:metricsHandler});
