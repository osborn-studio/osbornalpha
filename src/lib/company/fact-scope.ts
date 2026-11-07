// src/lib/company/fact-scope.ts
// The one scope filter for fact rows entering the evidence gate (buildGated and gateEvents): a row counts only when
// it belongs to the requested (issuer, market), is status 'ok', and (when an asOf bound is given) was available by then.
import type {FactRow,Market} from '@/lib/facts/types';

export const inGateScope=(r:Pick<FactRow,'issuer_id'|'market'|'status'|'available_date'>,issuerId:string,market:Market,asOf?:string):boolean=>
 r.issuer_id===issuerId&&r.market===market&&r.status==='ok'&&(!asOf||r.available_date<=asOf);
