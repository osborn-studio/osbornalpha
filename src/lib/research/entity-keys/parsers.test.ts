import {describe,expect,it} from 'vitest';
import {parseSecCompanyTickers,selectIsinsForLeis} from './parsers';

describe('parseSecCompanyTickers',()=>{
 const fixture=JSON.stringify({'0':{cik_str:1321655,ticker:'PLTR',title:'Palantir Technologies Inc.'},'1':{cik_str:1108524,ticker:'CRM',title:'Salesforce, Inc.'},'2':{cik_str:99,ticker:'ODD',title:'Odd Co'}});
 it('returns normalized CIKs for the requested tickers and lists the ones not found',()=>{
  expect(parseSecCompanyTickers(fixture,['PLTR','CRM','ZZZZ'])).toEqual({found:{PLTR:{cik:'1321655',title:'Palantir Technologies Inc.'},CRM:{cik:'1108524',title:'Salesforce, Inc.'}},missing:['ZZZZ']});
 });
 it('matches tickers case-insensitively but returns them as requested',()=>{
  expect(parseSecCompanyTickers(fixture,['pltr']).found).toEqual({pltr:{cik:'1321655',title:'Palantir Technologies Inc.'}});
 });
 it('rejects documents that are not the SEC shape',()=>{
  expect(()=>parseSecCompanyTickers('[]',['PLTR'])).toThrow('invalid_schema');
  expect(()=>parseSecCompanyTickers('{"0":{"ticker":"PLTR"}}',['PLTR'])).toThrow('invalid_schema');
  expect(()=>parseSecCompanyTickers('not json',['PLTR'])).toThrow('invalid_schema');
 });
});

describe('selectIsinsForLeis',()=>{
 const lines=['LEI,ISIN\r\n','549300UVN46B3BBDHO85,US69608A1088\r\n','RCGZFPDMRW58VJ54VR07,US79466L1044\n','549300UVN46B3BBDHO85,US69608A2078\n','00EHHQ2ZHDCFXJCPCL46,US92204Q1031\n','\n'];
 it('streams lines and keeps only the requested LEIs in file order',()=>{
  expect(selectIsinsForLeis(lines,new Set(['549300UVN46B3BBDHO85','RCGZFPDMRW58VJ54VR07','MISSING000000000000X']))).toEqual({
   found:{'549300UVN46B3BBDHO85':['US69608A1088','US69608A2078'],'RCGZFPDMRW58VJ54VR07':['US79466L1044']},
   missing:['MISSING000000000000X']});
 });
 it('rejects a file whose header is not LEI,ISIN',()=>{
  expect(()=>selectIsinsForLeis(['isin,lei\n','a,b\n'],new Set(['a']))).toThrow('invalid_schema');
 });
 it('works on a generator without materializing the file',()=>{
  function* gen(){yield 'LEI,ISIN\n';for(let i=0;i<1000;i++)yield `X${String(i).padStart(19,'0')},US0000000000\n`;yield '549300UVN46B3BBDHO85,US69608A1088\n';}
  expect(selectIsinsForLeis(gen(),new Set(['549300UVN46B3BBDHO85'])).found).toEqual({'549300UVN46B3BBDHO85':['US69608A1088']});
 });
});
