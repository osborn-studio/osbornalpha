// src/lib/broker-research/cron-auth.ts
// CRON_SECRET bearer check shared by the two broker-research crons (same timing-safe check as facts-sync).
import {timingSafeEqual} from 'node:crypto';
export function cronAuthorized(auth:string|null,secret:string):boolean{
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(auth??'');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
