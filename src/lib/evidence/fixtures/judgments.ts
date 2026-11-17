// Topic spec §4.1 judgment fixtures.
import {envelope,methodologyRow} from '@/lib/judgments/testing/envelopes';
import type {MemorySourcesInput} from '../memory-sources';
export const JUDGMENT={ok:'50000000-0000-4000-8000-000000000001',unknown:'50000000-0000-4000-8000-000000000002',later:'50000000-0000-4000-8000-000000000003',private:'50000000-0000-4000-8000-000000000004',withdrawn:'50000000-0000-4000-8000-000000000005',noMethod:'50000000-0000-4000-8000-000000000006'};
export function judgmentFixture():MemorySourcesInput{
 return {judgments:{items:[JUDGMENT.ok,JUDGMENT.later,JUDGMENT.private,JUDGMENT.withdrawn,JUDGMENT.noMethod].map(id=>({
  envelope:envelope({judgment:{judgment_id:id,registered_at:id===JUDGMENT.later?'2026-11-20T00:00:00.000Z':'2026-11-01T00:00:00.000Z'},
   ...(id===JUDGMENT.withdrawn?{settlement:{kind:'withdrawn' as const,outcome:null,realized:null,reason:'withdrawn'}}:{})}),
  method:id===JUDGMENT.noMethod?null:methodologyRow({publishable:id!==JUDGMENT.private}),
 }))}};
}
