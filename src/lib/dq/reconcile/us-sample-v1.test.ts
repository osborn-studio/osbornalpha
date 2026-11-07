// src/lib/dq/reconcile/us-sample-v1.test.ts
// Offline consistency of the fixture sample v1 (no database): for every expected key of every filing, the
// companyfacts fixture value of that accession and the recorded iXBRL document value must be equal, and every
// key must be present on both sides — unless the key is listed with an explanation in
// us-ixbrl-sample-v1.exceptions.json. This is the cheap pre-check of the "all passed" assertion of
// ixbrl-pair.integration.test.ts; an exception is never added to make a test pass, only to register an
// explained, real discrepancy (each one is also written up in the E4 audit note).
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {FACT_CONCEPTS,conceptById} from '../../facts/concepts';
import {parseCompanyFacts,tagsOf} from '../../facts/providers/edgar-companyfacts';
import {snapshotOf} from '../../facts/providers/shared';
import {unitKindOf} from '../../facts/units';
import {compareDecimal} from './decimal';
import {indexIxFacts,parseInlineXbrl} from './ixbrl';
import {US_SAMPLE_PATH,entityIs,usNaturalKey,validateUsSample} from './us-sample';

const read=(p:string)=>readFileSync(p);
const FIXTURE:Record<string,{companyfacts:string;doc:string}>={
 '0000320193-23-000106':{companyfacts:'src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm'},
 '0000950170-23-035122':{companyfacts:'src/lib/facts/fixtures/edgar/CIK0000789019.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/msft-20230630.trimmed.htm'},
};
interface Exception{natural_key:string;outcome:string;explanation:string}
const EXCEPTIONS=JSON.parse(readFileSync('src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.exceptions.json','utf8')) as Exception[];

describe('us-ixbrl-sample-v1 (fixture sample, offline)',()=>{
 const v=validateUsSample(JSON.parse(readFileSync(US_SAMPLE_PATH,'utf8')));
 it('is a valid manifest with AAPL and MSFT FY2023 10-Ks',()=>{
  expect(v.ok).toBe(true);
  if(!v.ok)return;
  expect(v.sample.selection).toBe('fixture/1');
  expect(v.sample.issuers.map(i=>[i.ticker,i.filings.map(f=>f.accn)])).toEqual([['AAPL',['0000320193-23-000106']],['MSFT',['0000950170-23-035122']]]);
  for(const e of EXCEPTIONS)expect(e.explanation.trim().length,`${e.natural_key}: explanation`).toBeGreaterThan(20);
 });
 it('every expected key has equal values on both sides, except the registered, explained exceptions',()=>{
  if(!v.ok)throw new Error('invalid sample');
  const found:{natural_key:string;outcome:string}[]=[];
  for(const iss of v.sample.issuers)for(const f of iss.filings){
   const fx=FIXTURE[f.accn];
   const parse=parseCompanyFacts(snapshotOf(new Uint8Array(read(fx.companyfacts)),{source:'edgar'}),{sinceYear:2016});
   const left=new Map(parse.candidates.filter(c=>c.filingRef===f.accn).map(c=>[`${c.concept}|${c.periodStart??''}|${c.periodEnd}|${c.unit}`,c]));
   const doc=parseInlineXbrl(read(fx.doc).toString('utf8'));
   const idx=indexIxFacts(doc.facts.filter(x=>entityIs(x.entity,iss.cik)).map(x=>({...x,entity:'filer'})));
   for(const k of f.expected_keys){
    const nk=usNaturalKey(iss.cik,f.accn,k);
    const l=left.get(`${k.concept}|${k.period_start??''}|${k.period_end}|${k.unit}`);
    if(!l){found.push({natural_key:nk,outcome:'left_missing'});continue;}
    const def=conceptById(k.concept)!;
    const tags=[l.sourceConcept,...tagsOf(def).filter(t=>t!==l.sourceConcept)];
    const hit=tags.map(t=>idx.get([t,'filer',k.period_start??'',k.period_end,k.unit].join('|'))).find(h=>h!==undefined);
    if(!hit){
     const unsupported=doc.unsupported.some(u=>u.name!==undefined&&tags.includes(u.name)&&u.periodEnd===k.period_end&&(u.periodStart??null)===k.period_start);
     found.push({natural_key:nk,outcome:unsupported?'unsupported':'right_missing'});continue;
    }
    if(hit.values.length>1){found.push({natural_key:nk,outcome:'right_ambiguous'});continue;}
    if(compareDecimal(l.value,hit.values[0])!==0)found.push({natural_key:nk,outcome:'compared_failed'});
   }
  }
  expect(found).toEqual(EXCEPTIONS.map(({natural_key,outcome})=>({natural_key,outcome})));
 });
});

// Independent enumeration of the two source key sets (does not use us-sample.ts helpers): the companyfacts adapter on
// the plan-2 fixture (candidates + ambiguous + odd-duration of the accession) and the iXBRL parser on the recorded
// trimmed document (filer entity, known tag, unit kind and period nature of the concept, period end >= 2016-01-01,
// highest-priority tag per key).
describe('us-ixbrl-sample-v1 expected keys equal the union of both sources',()=>{
 const sha=(b:Uint8Array|Buffer)=>createHash('sha256').update(b).digest('hex');
 const v=validateUsSample(JSON.parse(readFileSync(US_SAMPLE_PATH,'utf8')));
 const kk=(c:string,s:string|null,e:string,u:string)=>`${c}|${s??''}|${e}|${u}`;
 it('has exactly the union keys with the right origins and source concepts',()=>{
  if(!v.ok)throw new Error('invalid sample');
  for(const iss of v.sample.issuers)for(const f of iss.filings){
   const fx=FIXTURE[f.accn];
   const parse=parseCompanyFacts(snapshotOf(new Uint8Array(read(fx.companyfacts)),{source:'edgar'}),{sinceYear:2016});
   const left=new Map<string,string>();
   for(const c of [...parse.candidates,...parse.ambiguous.flatMap(a=>a.candidates),...parse.oddDuration])if(c.filingRef===f.accn)left.set(kk(c.concept,c.periodStart,c.periodEnd,c.unit),c.sourceConcept);
   const doc=parseInlineXbrl(read(fx.doc).toString('utf8'));
   const right=new Map<string,string>();
   for(const x of doc.facts){
    if(!entityIs(x.entity,iss.cik)||x.periodEnd<'2016-01-01')continue;
    const def=FACT_CONCEPTS.find(c=>tagsOf(c).includes(x.name));
    if(!def||unitKindOf(x.unit)!==def.unitKind||(def.nature==='duration')!==(x.periodStart!==null))continue;
    // the first concept (registry order) that lists the tag owns it
    const k=kk(def.id,x.periodStart,x.periodEnd,x.unit);
    const prev=right.get(k);
    if(prev===undefined||tagsOf(def).indexOf(x.name)<tagsOf(def).indexOf(prev))right.set(k,x.name);
   }
   const expected=new Map<string,{origin:string;source:string}>();
   for(const [k,src] of left)expected.set(k,{origin:right.has(k)?'both':'left',source:src});
   for(const [k,src] of right)if(!left.has(k))expected.set(k,{origin:'right',source:src});
   const actual=new Map(f.expected_keys.map(k=>[kk(k.concept,k.period_start,k.period_end,k.unit),{origin:k.origin,source:k.source_concept}]));
   expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
   for(const [k,e] of expected)expect(actual.get(k),k).toEqual(e);
   expect(f.expected_keys.length).toBe(expected.size);
  }
 });
 it('fixture and manifest hashes match the files and recording metas',()=>{
  if(!v.ok)throw new Error('invalid sample');
  for(const iss of v.sample.issuers)for(const f of iss.filings){
   const fx=FIXTURE[f.accn];
   const meta=JSON.parse(readFileSync(`${fx.doc}.meta.json`,'utf8')) as {source_url:string;source_sha256:string;trimmed_sha256:string;submissions:{accession:string;primaryDocument:string}};
   expect(f.raw_sha256).toBe(sha(read(fx.companyfacts)));
   expect(f.doc_sha256).toBe(meta.source_sha256);
   expect(f.doc_url).toBe(meta.source_url);
   expect(meta.trimmed_sha256).toBe(sha(read(fx.doc)));
   expect(meta.submissions.accession).toBe(f.accn);
   expect(f.primary_document).toBe(meta.submissions.primaryDocument);
  }
 });
});
