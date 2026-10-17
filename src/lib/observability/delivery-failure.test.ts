import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
const mocks=vi.hoisted(()=>({email:vi.fn(),telegram:vi.fn()}));
vi.mock('@/lib/data/sources/resend',()=>({sendEmail:mocks.email}));
vi.mock('@/lib/data/sources/telegram',()=>({isTelegramConfigured:()=>true,sendTelegram:mocks.telegram}));
import { dispatchOperationalAlert } from './delivery';
const input={checkName:'quote_15m' as const,window:{from:'2026-10-06T00:00:00Z',to:'2026-10-06T00:15:00Z'},metrics:{},violations:[{code:'synthetic',value:1,threshold:0}]};
beforeEach(()=>{vi.stubEnv('RESEND_API_KEY','synthetic-key');vi.stubEnv('ALERT_EMAIL_TO','synthetic@example.invalid');mocks.email.mockReset();mocks.telegram.mockReset();});afterEach(()=>vi.unstubAllEnvs());
describe('per-channel thrown delivery synthetic receipts only',()=>{
 it('retains email success when Telegram throws',async()=>{mocks.email.mockResolvedValue({ok:true,status:200});mocks.telegram.mockRejectedValue(new Error('synthetic-private'));expect(await dispatchOperationalAlert(input)).toEqual({email:{ok:true,status:200},telegram:{ok:false,error_code:'telegram_delivery_threw'}});});
 it('continues Telegram after email throws without exposing the exception',async()=>{mocks.email.mockRejectedValue(new Error('synthetic-private'));mocks.telegram.mockResolvedValue({ok:true,chunks_sent:1});const result=await dispatchOperationalAlert(input);expect(result).toEqual({email:{ok:false,error_code:'email_delivery_threw'},telegram:{ok:true,chunks_sent:1}});expect(JSON.stringify(result)).not.toContain('synthetic-private');});
 it('retains partial Telegram chunk count on failed send result',async()=>{mocks.email.mockResolvedValue({ok:true});mocks.telegram.mockResolvedValue({ok:false,chunks_sent:1});expect((await dispatchOperationalAlert(input)).telegram).toEqual({ok:false,error_code:'telegram_delivery_failed',chunks_sent:1});});
});
