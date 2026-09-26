import {describe,expect,it} from 'vitest';
import cohort from './first-cohort.json';
import {isValidCik,isValidIsin,isValidLei,isValidUsci} from './identifiers';
import type {CohortCompany} from './types';

const companies=cohort.companies as CohortCompany[];
const KEYS=['lei','usci','cninfo_org_id','cik'] as const;

describe('first cohort data (§13 candidates)',()=>{
 it('lists the 21 §13 candidates with names, home market and cohort tag',()=>{
  expect(companies).toHaveLength(21);
  expect(companies.filter(c=>c.home_market==='A')).toHaveLength(10);
  expect(companies.filter(c=>c.home_market==='HK')).toHaveLength(2);
  expect(companies.filter(c=>c.home_market==='US')).toHaveLength(9);
  for(const c of companies){
   expect(c.names_en[0]).toMatch(/\S/);
   expect(c.cohort).toBe('candidate-2026-09');
   expect(typeof c.in_scope).toBe('boolean');
   if(c.home_market==='A') expect(c.names_zh[0]).toMatch(/\S/);
  }
 });
 it('has every key either valid with provenance or explicitly listed as missing',()=>{
  for(const c of companies){
   for(const k of KEYS){
    const v=c.keys[k];
    if(v==null){expect(c.missing,`${c.names_en[0]} ${k}`).toContain(k);continue;}
    expect(c.missing,`${c.names_en[0]} ${k}`).not.toContain(k);
    expect(c.provenance[k]?.source,`${c.names_en[0]} ${k} provenance`).toMatch(/^(gleif-api|gleif-isin-lei-file|sec-company-tickers|web:[a-z0-9.-]+|manual)$/);
    expect(c.provenance[k]?.retrieved_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
   }
   if(c.keys.lei) expect(isValidLei(c.keys.lei),`${c.names_en[0]} lei`).toBe(true);
   if(c.keys.usci) expect(isValidUsci(c.keys.usci),`${c.names_en[0]} usci`).toBe(true);
   if(c.keys.cik) expect(isValidCik(c.keys.cik),`${c.names_en[0]} cik`).toBe(true);
   for(const m of c.missing) expect(c.keys[m as typeof KEYS[number]]??null).toBeNull();
  }
  // Market-specific completeness: US → CIK; A → USCI; every company → LEI or an explicit gap.
  for(const c of companies){
   if(c.home_market==='US') expect(c.keys.cik,`${c.names_en[0]} cik`).toBeTruthy();
   if(c.home_market==='A') expect(c.keys.usci,`${c.names_en[0]} usci`).toBeTruthy();
  }
 });
 it('gives every company one primary security with a valid ISIN, exchange code, MIC and listing date',()=>{
  for(const c of companies){
   const primary=c.securities.filter(s=>s.is_primary);
   expect(primary,`${c.names_en[0]} primary`).toHaveLength(1);
   for(const s of c.securities){
    expect(s.exchange_code).toMatch(/^[A-Z0-9.\-]{1,20}$/);
    expect(s.mic).toMatch(/^(XSHG|XSHE|XHKG|XNYS|XNAS)$/);
    expect(s.market).toBe(c.home_market);
    expect(s.valid_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(isValidIsin(s.isin),`${s.exchange_code} isin`).toBe(true);
    expect(s.provenance.isin?.source).toMatch(/\S/);
    if(s.market==='A') expect(s.exchange_code).toMatch(/^\d{6}\.(SH|SZ)$/);
    if(s.market==='HK') expect(s.exchange_code).toMatch(/^\d{4}\.HK$/);
   }
  }
 });
 it('never repeats an identifier across companies',()=>{
  const all=(pick:(c:CohortCompany)=>(string|null|undefined)[])=>companies.flatMap(pick).filter((v):v is string=>!!v);
  for(const values of [all(c=>[c.keys.lei]),all(c=>[c.keys.usci]),all(c=>[c.keys.cik]),all(c=>c.securities.map(s=>s.isin)),all(c=>c.securities.map(s=>s.exchange_code)),all(c=>[c.names_en[0].toLowerCase()])])
   expect(new Set(values).size).toBe(values.length);
 });
});
