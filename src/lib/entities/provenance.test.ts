// src/lib/entities/provenance.test.ts
import {describe,it,expect} from 'vitest';
import {ISSUER_PROVENANCE_KEYS,PROVENANCE_KEYS,ProvenanceError,sanitizeProvenance} from './provenance';

const code=(p:unknown,allowed?:readonly string[])=>{
 try{sanitizeProvenance(p,allowed);return 'ok';}
 catch(e){return e instanceof ProvenanceError?`${e.code}@${e.path}`:'other';}
};

describe('sanitizeProvenance',()=>{
 it('keeps the whitelisted keys of spec 3 §3.1 and returns a deep copy',()=>{
  const p={
   valid_from:{source:'stocks_universe.list_date',provider:'tushare',as_of:'2026-11-05',row:{list_date:'2001-08-27',source:'tushare',source_updated_at:'2026-11-04T00:00:00Z'}},
   figi:{source:'openfigi',as_of:'2026-11-05',evidence_sha256:'a'.repeat(64),job:{idType:'ID_ISIN',idValue:'CNE0000018R8'},level:'composite'},
   pending_change:{first_missing_as_of:'2026-11-01',first_missing_sha256:'b'.repeat(64),replacement_tickers:['NEW'],sources:['sec_company_tickers_exchange']},
  };
  const out=sanitizeProvenance(p);
  expect(out).toEqual(p);
  (out.valid_from as {row:{list_date:string}}).row.list_date='x';
  expect(p.valid_from.row.list_date).toBe('2001-08-27');
  expect(sanitizeProvenance({})).toEqual({});
  expect(PROVENANCE_KEYS).toEqual(['isin','figi','valid_from','valid_to','pending_change']);
 });
 it('rejects unknown top-level keys, secret-looking keys, URL credentials, UUIDs, bad values, depth and size',()=>{
  expect(code({exchange:'NYSE'})).toBe('unknown_key@exchange');
  expect(code({valid_from:{source:'x',api_key:'k'}})).toBe('secret_key@$.valid_from.api_key');
  expect(code({valid_from:{source:'x',row:{user_id:'u'}}})).toBe('secret_key@$.valid_from.row.user_id');
  for(const k of ['auth','session_id','email','apikey'])expect(code({valid_from:{[k]:'x'}})).toBe(`secret_key@$.valid_from.${k}`);
  expect(code({isin:{locator:'https://api.example/x?token=abc'}})).toBe('url_credentials@$.isin.locator');
  expect(code({isin:{locator:'https://bob:pw@example.com/f.csv'}})).toBe('url_credentials@$.isin.locator');
  for(const u of ['https:////bob:pw@example.com/f.csv','//bob:pw@example.com/f.csv','https://bo\tb:pw@example.com/f.csv','https://bob:p\nw@example.com/f.csv'])
   expect({u,r:code({isin:{locator:u}})}).toEqual({u,r:'url_credentials@$.isin.locator'});
  expect(code({isin:{locator:'https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx'}})).toBe('ok');
  expect(code({valid_from:{source:'curated',entity:'5f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f'}})).toBe('uuid_value@$.valid_from.entity');
  expect(code({figi:{level:Number.POSITIVE_INFINITY}})).toBe('bad_value@$.figi.level');
  expect(code({figi:{at:new Date(0)}})).toBe('bad_value@$.figi.at');
  expect(code([])).toBe('not_object@$');
  expect(code(null)).toBe('not_object@$');
  expect(code({valid_from:{a:{b:{c:{d:{e:{f:{g:1}}}}}}}})).toBe('too_deep@$.valid_from.a.b.c.d');
  expect(code({figi:{x:'y'.repeat(501)}})).toBe('too_long@$.figi.x');
  expect(code({figi:Object.fromEntries(Array.from({length:25},(_,i)=>[`k${i}`,'y'.repeat(400)]))})).toBe('too_large@$');
 });
 it('takes another whitelist for issuer provenance',()=>{
  expect(sanitizeProvenance({lei:{source:'gleif',as_of:'2026-11-05'}},ISSUER_PROVENANCE_KEYS)).toEqual({lei:{source:'gleif',as_of:'2026-11-05'}});
  expect(()=>sanitizeProvenance({isin:{source:'x'}},ISSUER_PROVENANCE_KEYS)).toThrow('provenance_rejected:unknown_key:isin');
 });
});

// One case per rule of the SQL guard claim_provenance_safe: TS must reject everything SQL rejects.
describe('sanitizeProvenance agrees with SQL claim_provenance_safe',()=>{
 const cases:[string,unknown,string][]=[
  ['secret key',{figi:{api_key:'x'}},'secret_key'],
  ['authorization key',{figi:{authorization:'x'}},'secret_key'],
  ['url query',{isin:{locator:'https://h.example/f?a=1'}},'url_credentials'],
  ['url fragment',{isin:{locator:'https://h.example/f#frag'}},'url_credentials'],
  ['bare query assignment',{isin:{locator:'/x?a=b'}},'url_credentials'],
  ['encoded token name (Codex bypass)',{isin:{locator:'https://h.example/f?%74oken=abc'}},'url_credentials'],
  ['access-token (Codex bypass)',{isin:{locator:'https://h.example/f?access-token=abc'}},'url_credentials'],
  ['X-Amz-Signature (Codex bypass)',{isin:{locator:'https://h.example/f?X-Amz-Signature=abc'}},'url_credentials'],
  ['uuid',{figi:{x:'5f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f'}},'uuid_value'],
  ['key= text',{figi:{note:'use key=abc'}},'secret_text'],
  ['token: text',{figi:{note:'token: abc'}},'secret_text'],
  ['password= text',{figi:{note:'password = abc'}},'secret_text'],
  ['string over 500',{figi:{x:'y'.repeat(501)}},'too_long'],
  ['depth over 4',{figi:{a:{b:{c:{d:1}}}}},'too_deep'],
 ];
 for(const [name,p,want] of cases)it(`rejects ${name}`,()=>{expect(code(p).startsWith(`${want}@`)).toBe(true);});
 it('accepts depth 4 and a 500 character string',()=>{
  expect(code({figi:{a:{b:{c:1}}}})).toBe('ok');
  expect(code({figi:{x:'y'.repeat(500)}})).toBe('ok');
 });
 it('validateClaimDetail turns each rejection into invalid_claim:provenance_written',async()=>{
  const {validateClaimDetail}=await import('./claims');
  for(const [name,p] of cases){
   const prov=(p as {isin?:unknown;figi?:unknown});
   const r=validateClaimDetail('set_identifier','isin',{schema:'claim/1',evidence_kind:'hard_identifier',target:{issuer_id:'i',ticker:'T',valid_from:'2020-01-01'},params:{},
    evidence:{source:'s',as_of:'2026-11-05',evidence_sha256:'a'.repeat(64)},sources:[],provenance_written:{isin:prov.isin??prov.figi}} as never);
   expect({name,r:r.ok?'ok':r.error.startsWith('invalid_claim:provenance_written')}).toEqual({name,r:true});
  }
 });
});
