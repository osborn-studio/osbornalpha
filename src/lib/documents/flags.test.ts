// src/lib/documents/flags.test.ts
import {afterEach,describe,expect,it} from 'vitest';
import {documentsFlag} from './flags';

const saved=process.env.DOCUMENTS_EXTRACT_ENABLED;
afterEach(()=>{if(saved===undefined)delete process.env.DOCUMENTS_EXTRACT_ENABLED;else process.env.DOCUMENTS_EXTRACT_ENABLED=saved;});
describe('documentsFlag',()=>{
 it("is on for '1' and 'true' only",()=>{
  for(const [v,on] of [['1',true],['true',true],['TRUE',false],['0',false],['false',false],['yes',false],['',false]] as const){
   process.env.DOCUMENTS_EXTRACT_ENABLED=v;
   expect(documentsFlag('DOCUMENTS_EXTRACT_ENABLED'),v).toBe(on);
  }
  delete process.env.DOCUMENTS_EXTRACT_ENABLED;
  expect(documentsFlag('DOCUMENTS_EXTRACT_ENABLED')).toBe(false);
 });
});
