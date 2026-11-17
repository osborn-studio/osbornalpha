import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {BisParseError,parseBisCbpolLpr1y} from './bis-cbpol';
import {parserFor} from './index';
const bytes=readFileSync('src/lib/macro/fixtures/bis/WS_CBPOL-M.CN.csv');
const manifest=JSON.parse(readFileSync('src/lib/macro/fixtures/bis/manifest.json','utf8'))[0];
const header=['FREQ','REF_AREA','COMPILATION','SOURCE_REF','TIME_PERIOD','OBS_VALUE','OBS_STATUS'];
const row=['M','CN','From 20 Aug 2019 onwards: Loan Prime Rate (1 year)',"People's Bank of China",'2026-10','3.00','A'];
const encode=(s:string)=>new TextEncoder().encode(s);
const csv=(r=row,h=header)=>encode(`${h.join(',')}\n${r.join(',')}\n`);
const parse=(b:Uint8Array=bytes,today='2026-11-16')=>parseBisCbpolLpr1y(b,{seriesId:'CN_LPR_1Y',today});
const error=(b:Uint8Array,code:string)=>{try{parse(b);throw new Error('expected rejection');}catch(e){expect(e).toBeInstanceOf(BisParseError);expect(e).toMatchObject({code});}};
describe('BIS monthly LPR',()=>{
 it('verifies recorded bytes, all change points and independent locator replay',()=>{
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.sha256);expect(bytes.length).toBe(manifest.bytes);
  const points=parse();expect(points).toHaveLength(87);
  expect([points[0].periodEnd,points[0].valueText]).toEqual(['2019-08-31','4.25']);expect([points.at(-1)!.periodEnd,points.at(-1)!.valueText]).toEqual(['2026-10-31','3']);
  expect(points.filter((p,i)=>i===0||p.valueText!==points[i-1].valueText).map(p=>[p.periodEnd.slice(0,7),p.valueText])).toEqual([
   ['2019-08','4.25'],['2019-09','4.2'],['2019-11','4.15'],['2020-02','4.05'],['2020-04','3.85'],['2021-12','3.8'],['2022-01','3.7'],['2022-08','3.65'],['2023-06','3.55'],['2023-08','3.45'],['2024-07','3.35'],['2024-10','3.1'],['2025-05','3']]);
  // This recorded fixture has no quoted fields; split independently from the production parser.
  const lines=bytes.toString('utf8').split('\n');
  for(const p of points){expect(p.locator.kind).toBe('csv_row');if(p.locator.kind!=='csv_row')throw new Error('locator');expect(lines[p.locator.line-1].replace(/\r$/,'').split(',')[p.locator.column]).toBe(p.valueText);}
 });
 it('excludes the current UTC month and remains outside AKShare',()=>{expect(parse(bytes,'2026-10-20').at(-1)!.periodEnd).toBe('2026-09-30');expect(parserFor('CN_LPR_1Y')).toBeNull();});
 it('locates reordered fields and handles quoted commas and escaped quotes',()=>{
  const r=[...row];r[2]='"From 20 Aug 2019 onwards: Loan Prime Rate (1 year), ""note"""';
  const p=parse(csv([...r].reverse(),[...header].reverse()));expect(p[0]).toMatchObject({valueText:'3',locator:{line:2,column:1}});
 });
 it('skips missing values, inactive status and pre-LPR months; deduplicates equal values',()=>{
  for(const [i,v] of [[5,''],[5,'NaN'],[6,'E'],[4,'2019-07']] as const){const r=[...row];r[i]=v;expect(parse(csv(r))).toEqual([]);}
  expect(parse(encode(new TextDecoder().decode(csv())+row.join(',')+'\n'))).toHaveLength(1);
 });
 it('fails closed for encoding, header, CSV shape, period, value, definition and conflicting rows',()=>{
  error(new Uint8Array([255]),'bis_bad_encoding');error(encode(''),'bis_bad_header');
  expect(()=>parse(csv(),'2026-02-30')).toThrowError(new BisParseError('bis_invalid_today'));error(csv(row,header.map(h=>h==='OBS_VALUE'?'VALUE':h)),'bis_bad_header');
  error(csv([...row,'extra']),'bis_bad_row');error(csv(row.slice(1)),'bis_bad_row');const broken=[...row];broken[2]='"unclosed';error(csv(broken),'bis_bad_row');
  for(const [i,v,code] of [[4,'2026-13','bis_bad_period'],[5,'1e2','bis_bad_value'],[0,'D','bis_definition_changed'],[1,'US','bis_definition_changed'],[2,'Other instrument','bis_definition_changed'],[3,'Other publisher','bis_definition_changed']] as const){const r=[...row];r[i]=v;error(csv(r),code);}
  const r=[...row];r[5]='4';error(encode(new TextDecoder().decode(csv())+r.join(',')+'\n'),'bis_conflicting_rows');
 });
});
