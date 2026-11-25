import {expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {supabaseVendorIndustryDb} from './db';
it('pages the filtered grid in full identity order',async()=>{
 const rows=Array.from({length:504},(_,i)=>({code:String(i)}));
 const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),in:vi.fn().mockReturnThis(),
  order:vi.fn().mockReturnThis(),range:vi.fn(async(start:number,end:number)=>({data:rows.slice(start,end+1)}))};
 const from=vi.fn(()=>query),db=supabaseVendorIndustryDb({from} as unknown as SupabaseClient);
 const q={metrics:['revenue_cum'],periodEnds:['2024-12-31']};
 expect(await db.observationsGrid('run',q)).toEqual(rows);
 expect(query.range.mock.calls.slice(0,2)).toEqual([[0,499],[500,999]]);
 expect(query.order.mock.calls.slice(0,4).flat()).toEqual(['code','period_end','metric','duration']);
 const columns=query.select.mock.calls[0][0].split(',');
 expect(columns).toContain('value_text');expect(columns).not.toContain('*');expect(columns).not.toContain('value');
 expect(query.eq).toHaveBeenCalledWith('run_id','run');
 expect(query.in).toHaveBeenCalledWith('metric',q.metrics);expect(query.in).toHaveBeenCalledWith('period_end',q.periodEnds);
});
