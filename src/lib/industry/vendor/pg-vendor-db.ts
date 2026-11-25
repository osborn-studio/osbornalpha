// Test-only adapter. Both transports use the same named RPC arguments and SQL read filters.
import type {Pool} from 'pg';
import {pgTableClient,typeParsers} from '../../db/pg-table-client';
import {vendorDbFromTables} from './db';
export function pgVendorIndustryDb(pool:Pool){
 return vendorDbFromTables(pgTableClient(pool),{
  async observationsOfRun(id,{code,metric,from,to}){
   const result=await pool.query({text:`select * from public.industry_vendor_observations where run_id=$1 and code=$2
    and ($3::text is null or metric=$3) and ($4::date is null or period_end >= $4)
    and ($5::date is null or period_end <= $5) order by period_end,metric,duration`,values:[id,code,metric,from,to],types:typeParsers});
   return result.rows;
  },
  async retrievalsByIds(ids){
   return (await pool.query({text:'select * from public.vendor_retrievals where retrieval_id=any($1::uuid[])',values:[ids],types:typeParsers})).rows;
  }
 });
}
