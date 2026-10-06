import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatchOperationalAlert } = vi.hoisted(() => ({ dispatchOperationalAlert: vi.fn() }));
vi.mock('./delivery', () => ({ dispatchOperationalAlert }));

import { recordAndDeliverCheck } from './service';

function fakeDb(insertResult: { data: { id: string } | null; error: { code: string } | null }, prior?: Record<string, unknown>, faults: { read?: boolean; update?: boolean } = {}) {
  const read = { eq: vi.fn(() => read), maybeSingle: vi.fn(async () => ({ data: prior ?? null, error: faults.read ? { code: 'synthetic' } : null })) };
  const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: faults.update ? { code: 'synthetic' } : null })) }));
  return {
    update,
    read,
    db: {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({ single: vi.fn(async () => insertResult) })),
        })),
        update,
        select: vi.fn(() => read),
      })),
    },
  };
}

describe('service alert persistence', () => {
  beforeEach(() => { dispatchOperationalAlert.mockReset(); });

  it('records healthy windows without sending a notification', async () => {
    const { db, update } = fakeDb({ data: { id: 'run-1' }, error: null });
    const result = await recordAndDeliverCheck(db, {
      checkName: 'quote_15m',
      window: { from: '2026-07-21T02:00:00Z', to: '2026-07-21T02:15:00Z' },
      metrics: { batches: 2 },
      violations: [],
    });
    expect(result.status).toBe('healthy');
    expect(dispatchOperationalAlert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });

  it('deduplicates a retried cron window before delivery', async () => {
    const { db } = fakeDb({ data: null, error: { code: '23505' } }, { id: 'stored', status: 'alerting', metrics: { saved: 1 }, violations: [{ code: 'stored', value: 1, threshold: 0 }], delivery: { email: { ok: true }, telegram: { ok: false, skipped: 'not_configured' } } });
    const result = await recordAndDeliverCheck(db, {
      checkName: 'ai_daily',
      window: { from: '2026-07-19T16:00:00Z', to: '2026-07-20T16:00:00Z' },
      metrics: { failure_rate: 0.2 },
      violations: [{ code: 'ai_failure_rate_high', value: 0.2, threshold: 0.1 }],
    });
    expect(result.deduplicated).toBe(true);
    expect(result.metrics).toEqual({ saved: 1 });
    expect(dispatchOperationalAlert).not.toHaveBeenCalled();
  });
  const input = { checkName: 'quote_15m' as const, window: { from: '2026-10-06T00:00:00Z', to: '2026-10-06T00:15:00Z' }, metrics: {}, violations: [{ code: 'quote_batch_failed', value: 1, threshold: 0 }] };
  it.each([{}, null, { email: { ok: false } }, { email: { ok: true }, telegram: { ok: false } }, { email: { ok: false, skipped: 'not_configured' } }])('does not falsely acknowledge duplicate unresolved delivery %s', async delivery => {
    const { db } = fakeDb({ data: null, error: { code: '23505' } }, { id: 'stored', status: 'alerting', metrics: {}, violations: input.violations, delivery });
    await expect(recordAndDeliverCheck(db, input)).rejects.toThrow('prior delivery unresolved'); expect(dispatchOperationalAlert).not.toHaveBeenCalled();
  });
  it('refuses a conflict without a matching stored window', async () => {
    const { db } = fakeDb({ data: null, error: { code: '23505' } }); await expect(recordAndDeliverCheck(db,input)).rejects.toThrow('prior run unavailable');expect(dispatchOperationalAlert).not.toHaveBeenCalled();
  });
  it('persists failed delivery but does not report success', async () => {
    dispatchOperationalAlert.mockResolvedValue({ email: { ok: false, error_code: 'synthetic' } }); const { db, update } = fakeDb({ data: { id: 'new' }, error: null });
    await expect(recordAndDeliverCheck(db,input)).rejects.toThrow('delivery incomplete'); expect(update).toHaveBeenCalledWith({ delivery: { email: { ok: false, error_code: 'synthetic' } } }); expect(dispatchOperationalAlert).toHaveBeenCalledOnce();
  });
  it('returns successful first delivery only after storing its receipt', async () => {
    dispatchOperationalAlert.mockResolvedValue({ email: { ok: true } });const { db,update }=fakeDb({data:{id:'new'},error:null});expect((await recordAndDeliverCheck(db,input)).deduplicated).toBe(false);expect(update).toHaveBeenCalledOnce();
  });

  it('filters all exact stored-window dimensions and returns healthy stored data without dispatch', async () => {
    const { db,read }=fakeDb({data:null,error:{code:'23505'}},{id:'stored',status:'healthy',metrics:{saved:2},violations:[],delivery:{}});
    expect((await recordAndDeliverCheck(db,input)).status).toBe('healthy');expect(read.eq.mock.calls).toEqual([['check_name',input.checkName],['window_start',input.window.from],['window_end',input.window.to]]);expect(dispatchOperationalAlert).not.toHaveBeenCalled();
  });
  it('refuses prior read errors',async()=>{
    const {db}=fakeDb({data:null,error:{code:'23505'}},{id:'stored',status:'healthy',metrics:{},violations:[]},{read:true});await expect(recordAndDeliverCheck(db,input)).rejects.toThrow('prior run unavailable');expect(dispatchOperationalAlert).not.toHaveBeenCalled();
  });
  it.each([{status:'healthy',violations:input.violations},{status:'alerting',violations:[]},{status:'error',violations:[]},{status:'healthy',violations:{},metrics:{}},{status:'healthy',violations:[],metrics:[]}])('refuses malformed or inconsistent stored rows %s',async change=>{
    const {db}=fakeDb({data:null,error:{code:'23505'}},{...{id:'stored',status:'healthy',metrics:{},violations:[]},...change});await expect(recordAndDeliverCheck(db,input)).rejects.toThrow('prior run unavailable');expect(dispatchOperationalAlert).not.toHaveBeenCalled();
  });
  it('does not resend after successful send with failed receipt update',async()=>{
    dispatchOperationalAlert.mockResolvedValue({email:{ok:true}});const first=fakeDb({data:{id:'new'},error:null},undefined,{update:true});await expect(recordAndDeliverCheck(first.db,input)).rejects.toThrow('delivery status unavailable');
    const retry=fakeDb({data:null,error:{code:'23505'}},{id:'new',status:'alerting',metrics:{},violations:input.violations,delivery:{}});await expect(recordAndDeliverCheck(retry.db,input)).rejects.toThrow('prior delivery unresolved');expect(dispatchOperationalAlert).toHaveBeenCalledOnce();
  });
  it.each([{email:{ok:true},telegram:{ok:false,error_code:'synthetic'}},{email:{ok:false,skipped:'not_configured'},telegram:{ok:false,skipped:'not_configured'}}])('saves first partial or unconfigured delivery %s before failing',async receipt=>{
    dispatchOperationalAlert.mockResolvedValue(receipt);const {db,update}=fakeDb({data:{id:'new'},error:null});await expect(recordAndDeliverCheck(db,input)).rejects.toThrow('delivery incomplete');expect(update).toHaveBeenCalledWith({delivery:receipt});
  });
  it('saves a fixed failure receipt if the dispatcher unexpectedly rejects',async()=>{
    dispatchOperationalAlert.mockImplementation(async () => { throw new Error('synthetic-private'); });const {db,update}=fakeDb({data:{id:'new'},error:null});const outcome=await recordAndDeliverCheck(db,input).then(()=>'unexpected success',(error:Error)=>error.message);expect(outcome).toBe('service alert delivery incomplete');expect(update).toHaveBeenCalledWith({delivery:{dispatch:{ok:false,error_code:'alert_dispatch_threw'}}});
  });

});
