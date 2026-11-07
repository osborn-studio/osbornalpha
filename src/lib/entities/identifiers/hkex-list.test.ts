// src/lib/entities/identifiers/hkex-list.test.ts
import * as XLSX from 'xlsx';
import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {HKEX_LIST_FILES,XLSX_MIME,XLS_MIME,mergeHkexIsins,parseHkexList} from './hkex-list';

/** Builds an in-memory .xlsx so no binary fixture is committed. */
const book=(rows:unknown[][])=>{
 const wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'ListOfSecurities');
 return new Uint8Array(XLSX.write(wb,{type:'array',bookType:'xlsx'}) as ArrayBuffer);
};
// Header layout mirrors ListOfSecurities.xlsx (title rows, then the header row); values are real
// HKEX codes/ISINs (Tencent, Ping An H, HSBC) with one bad code and one bad ISIN check digit.
const LIST=book([
 ['List of Securities'],['Updated as at 04/11/2026'],[],
 ['Stock Code','Name of Securities','Category','Sub-Category','Board Lot','ISIN'],
 ['00700','TENCENT','Equity','Equity Securities (Main Board)','100','KYG875721634'],
 [2318,'PING AN','Equity','Equity Securities (Main Board)','500','CNE1000003X6'],
 ['04335','HKGB 2.48 2030','Debt Securities','Government Bonds','50000',''],
 ['ABC','BAD CODE','Equity','',null,null],
 ['Legend: * = suspended'],
 ['ACD','Aex - Clearing and Depository N.V.'],
 ['XYZ','BAD CODE REAL ISIN','Equity','',null,'US88160R1014'],
 ['00005','HSBC HOLDINGS','Equity','','400','GB0005405280'],
]);

describe('parseHkexList',()=>{
 it('finds columns by header text, pads stock codes, validates ISINs and reports rejects',()=>{
  const p=parseHkexList(LIST,'list_of_securities');
  expect(p.headerRow).toBe(4);
  expect(p.columns).toEqual({stockCode:0,name:1,category:2,isin:5});
  expect(p.rows.map(r=>[r.stockCode,r.name,r.category,r.isin])).toEqual([
   ['00700','TENCENT','Equity','KYG875721634'],['02318','PING AN','Equity','CNE1000003X6'],
   ['04335','HKGB 2.48 2030','Debt Securities',null],['00005','HSBC HOLDINGS','Equity',null],
  ]);
  expect(p.skipped).toEqual([{row:8,reason:'non_data'},{row:9,reason:'non_data'},{row:10,reason:'non_data'}]);   // empty-ISIN row with a non-numeric code, legend text, a legend table row
  expect(p.rejected).toEqual([{row:11,reason:'invalid_stock_code'},{row:12,reason:'invalid_isin'}]);
  expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
 });
 it('accepts any column order and a file without an ISIN column',()=>{
  const p=parseHkexList(book([['Category','Name of Securities','Stock Code'],['Equity','TENCENT','700']]),'list_of_securities');
  expect(p.columns).toEqual({stockCode:2,name:1,category:0,isin:null});
  expect(p.rows).toEqual([{stockCode:'00700',name:'TENCENT',category:'Equity',isin:null,row:2}]);
 });
 it('reads every row even when the sheet declares a stale <dimension> (live HKEX file: A1:R8 for 17k rows)',()=>{
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Stock Code','ISIN'],['00001','KYG217651051'],['00002','HK0002007356'],['00003','HK0003000038']]),'S');
  // Stored (uncompressed) zip: the sheet XML is plain bytes, so the dimension can be patched in place at equal length.
  const bytes=new Uint8Array(XLSX.write(wb,{type:'array',bookType:'xlsx',compression:false}) as ArrayBuffer);
  const xml=Buffer.from(bytes).toString('latin1'),from='<dimension ref="A1:B4"/>';
  expect(xml).toContain(from);
  const patched=new Uint8Array(Buffer.from(xml.replace(from,'<dimension ref="A1:B2"/>'),'latin1'));
  expect(XLSX.read(patched,{type:'array'}).Sheets.S['!ref']).toBe('A1:B2');   // precondition: the default reader is fooled
  expect(parseHkexList(patched,'list_of_securities').rows.map(r=>r.stockCode)).toEqual(['00001','00002','00003']);
 });
 it('reads the HKEX ISIN workbooks ("HK Stock Code" / "ISIN Code" / "Stocks" headers, repeated header rows, preamble)',()=>{
  const p=parseHkexList(book([['ISINs assigned by Other Numbering Agencies'],[],['Stocks ','ISIN Code','HK Stock Code','Type '],['TENCENT HOLDINGS LIMITED','KYG875721634','00700','ORD SH'],['Stocks','ISIN Code','HK Stock Code','Type'],['AB&B BIO-TECH CO., LTD. JS','CNE1000071P9','02627','ORD SH'],['ASIA-PAC FINANCIAL RTS','Not Available','08555','RTS'],['X','  n/a ','08556','RTS'],['Y','-','08557','RTS'],['Z',null,'08558','RTS']]),'isin_other_agencies');
  expect(p.columns).toEqual({stockCode:2,name:0,category:null,isin:1});
  expect(p.rows.map(r=>[r.stockCode,r.name,r.isin])).toEqual([['00700','TENCENT HOLDINGS LIMITED','KYG875721634'],['02627','AB&B BIO-TECH CO., LTD. JS','CNE1000071P9'],['08555','ASIA-PAC FINANCIAL RTS',null],['08556','X',null],['08557','Y',null],['08558','Z',null]]);
  expect(p.rejected).toEqual([]);   // placeholders mean "no ISIN", not a malformed one
  expect(p.skipped).toEqual([]);
 });
 it('fails with invalid_schema when no header row names "Stock Code"',()=>{
  expect(()=>parseHkexList(book([['Code','Name'],['00700','TENCENT']]),'list_of_securities')).toThrow('invalid_schema');
 });
});

describe('mergeHkexIsins',()=>{
 it('takes the ISIN from the highest-priority file and records disagreements',()=>{
  const list=parseHkexList(LIST,'list_of_securities');
  const other=parseHkexList(book([['Stock Code','ISIN Code'],['00700','US88160R1014'],['00941','HK0941009539']]),'isin_hkex');
  const m=mergeHkexIsins([other,list]);
  expect(m.hasIsinColumn).toBe(true);
  expect(m.byCode.get('00700')).toMatchObject({isin:'KYG875721634',file:'list_of_securities',row:5});
  expect(m.byCode.get('00941')).toMatchObject({isin:'HK0941009539',file:'isin_hkex'});
  expect(m.conflicts).toEqual([{stockCode:'00700',isins:[{file:'list_of_securities',isin:'KYG875721634'},{file:'isin_hkex',isin:'US88160R1014'}]}]);
  expect(HKEX_LIST_FILES.map(f=>f.id)).toEqual(['list_of_securities','isin_hkex','isin_other_agencies']);
 });
 it('drops superseded -OLD counters from the merge and lists them, so the live counter keeps the code',()=>{
  const other=parseHkexList(book([['Stocks','ISIN Code','HK Stock Code'],['BEIJING DEEPZERO TECH CO., LTD.-OLD','CNE1000002H1','02938'],['BEIJING DEEPZERO TECH CO., LTD.','CNE1000003X6','02938'],['OLD ECONOMY LTD','KYG875721634','02939']]),'isin_other_agencies');
  const m=mergeHkexIsins([other]);
  expect(m.byCode.get('02938')).toMatchObject({isin:'CNE1000003X6'});
  expect(m.byCode.get('02939')).toMatchObject({isin:'KYG875721634'});   // only a name ENDING in -OLD is superseded
  expect(m.dropped).toEqual([{stockCode:'02938',file:'isin_other_agencies',row:2,name:'BEIJING DEEPZERO TECH CO., LTD.-OLD',reason:'superseded_counter'}]);
  expect(m.conflicts).toEqual([]);
 });
 it('reports hasIsinColumn=false when no file carries ISINs',()=>{
  const m=mergeHkexIsins([parseHkexList(book([['Stock Code','Name of Securities'],['700','TENCENT']]),'list_of_securities')]);
  expect(m.hasIsinColumn).toBe(false);expect(m.byCode.size).toBe(0);
 });
});

describe('HKEX_LIST_FILES content types',()=>{
 it('declares xlsx for ListOfSecurities and legacy xls for the two ISIN workbooks, matching file extensions',()=>{
  expect(HKEX_LIST_FILES.map(f=>[f.id,f.contentType])).toEqual([['list_of_securities',XLSX_MIME],['isin_hkex',XLS_MIME],['isin_other_agencies',XLS_MIME]]);
  for(const f of HKEX_LIST_FILES)expect(f.file.endsWith(f.contentType===XLSX_MIME?'.xlsx':'.xls')).toBe(true);
 });
 it('XLSX_MIME bytes start with the PK zip magic and XLS_MIME bytes with the OLE d0cf11e0 magic (generated .xlsx; .xls via the BIFF writer)',()=>{
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Stock Code'],['00700']]),'S');
  const hex=(b:Uint8Array)=>Buffer.from(b.slice(0,4)).toString('hex');
  expect(hex(new Uint8Array(XLSX.write(wb,{type:'array',bookType:'xlsx'}) as ArrayBuffer))).toBe('504b0304');
  const xls=new Uint8Array(XLSX.write(wb,{type:'array',bookType:'biff8'}) as ArrayBuffer);
  expect(hex(xls)).toBe('d0cf11e0');
  expect(parseHkexList(xls,'isin_other_agencies').rows[0].stockCode).toBe('00700');
 });
 const dir='.claude/scratch/verify';
 it.skipIf(!existsSync(`${dir}/isino.xls`))('the downloaded workbooks have the magic their declared content type implies (local verification files)',()=>{
  const magic=(f:string)=>readFileSync(`${dir}/${f}`).subarray(0,4).toString('hex');
  expect(magic('ListOfSecurities.xlsx')).toBe('504b0304');
  expect(magic('isinsehk.xls')).toBe('d0cf11e0');expect(magic('isino.xls')).toBe('d0cf11e0');
 });
});
