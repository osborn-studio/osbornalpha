// src/lib/company/fact-scope.ts
// The one scope filter for fact rows entering the evidence gate (buildGated and gateEvents): a row counts only when
// it belongs to the requested (issuer or lineage members, market), is status 'ok', and (when an asOf bound is given) was available by then.
import type {FactRow,Market} from '@/lib/facts/types';

export const inGateScope=(r:Pick<FactRow,'issuer_id'|'market'|'status'|'available_date'>,issuerId:string|ReadonlySet<string>,market:Market,asOf?:string):boolean=>
 (typeof issuerId==='string'?r.issuer_id===issuerId:issuerId.has(r.issuer_id))&&r.market===market&&r.status==='ok'&&(!asOf||r.available_date<=asOf);
