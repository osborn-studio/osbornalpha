// PG17 test adapter for the production JudgmentInputsDb interface. Queries run under the caller's role.
import type {Pool} from 'pg';
import {pgTableClient} from '@/lib/db/pg-table-client';
import {pgFactsDb} from '@/lib/facts/pg-facts-db';
import type {IndustryDb} from '@/lib/industry/types';
import type {Row} from '@/lib/db/table-client';
import {inputsDbOf,unsupportedKline} from '../inputs-db';
import {unavailableMacroReadApi} from '../macro-api';

export function pgJudgmentInputsDb(pool:Pool,industry:Pick<IndustryDb,'metricRun'|'metricRowsOfRun'>){
 const tables=pgTableClient(pool);
 const paged=async(table:string,match:Row,order:readonly string[])=>{
  const key=(r:Row)=>order.map(c=>String(r[c])).join('\u0000');
  return (await tables.select(table,match)).sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0);
 };
 return {...inputsDbOf({facts:pgFactsDb(pool),tables,paged,macro:unavailableMacroReadApi(),kline:unsupportedKline,industry}),industry};
}
