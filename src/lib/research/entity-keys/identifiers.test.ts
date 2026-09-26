import {describe,expect,it} from 'vitest';
import {isValidCik,isValidIsin,isValidLei,isValidUsci,normalizeCik} from './identifiers';

describe('isValidIsin (ISO 6166)',()=>{
 it('accepts real ISINs across CN, KY and US prefixes',()=>{
  for(const s of ['US0378331005','CNE000001FN6','CNE100005592','KYG0705A1085','US81762P1021','US78467J1007']) expect(isValidIsin(s)).toBe(true);
 });
 it('rejects a wrong check digit, lowercase, wrong length and non-strings',()=>{
  expect(isValidIsin('US0378331006')).toBe(false);
  expect(isValidIsin('us0378331005')).toBe(false);
  expect(isValidIsin('US037833100')).toBe(false);
  expect(isValidIsin(378331005 as any)).toBe(false);
 });
});

describe('isValidLei (ISO 17442 mod 97-10)',()=>{
 it('accepts real LEIs and rejects a single-character change',()=>{
  for(const s of ['549300UVN46B3BBDHO85','3003003LS77D1DRDDE25','RCGZFPDMRW58VJ54VR07']) expect(isValidLei(s)).toBe(true);
  expect(isValidLei('549300UVN46B3BBDHO86')).toBe(false);
  expect(isValidLei('549300UVN46B3BBDHO8')).toBe(false);
  expect(isValidLei('549300uvn46b3bbdho85')).toBe(false);
 });
});

describe('isValidUsci (GB 32100 weighted mod 31)',()=>{
 it('accepts real codes and rejects a wrong check character or forbidden letters',()=>{
  for(const s of ['913300002539329145','9133000070337747XE','91440300797975760B','911101086976555404']) expect(isValidUsci(s)).toBe(true);
  expect(isValidUsci('913300002539329146')).toBe(false);
  expect(isValidUsci('91330000253932914I')).toBe(false);
  expect(isValidUsci('91330000253932914')).toBe(false);
 });
});

describe('CIK',()=>{
 it('normalizes zero padding and validates digits only',()=>{
  expect(normalizeCik('0001321655')).toBe('1321655');
  expect(normalizeCik(1321655)).toBe('1321655');
  expect(isValidCik('1321655')).toBe(true);
  expect(isValidCik('0001321655')).toBe(false);
  expect(isValidCik('abc')).toBe(false);
  expect(isValidCik('')).toBe(false);
  expect(()=>normalizeCik('abc')).toThrow('invalid_schema');
 });
});
