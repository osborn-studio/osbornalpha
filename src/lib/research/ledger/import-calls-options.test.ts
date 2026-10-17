import {describe,expect,it} from 'vitest';
import {parseImportCallsOptions} from '../../../../scripts/import-calls-options';
describe('operator import CLI argument isolation',()=>{
 it.each([
  ['journal.jsonl','--scorecard','score.json','--dry-run'],
  ['--scorecard','score.json','--dry-run','journal.jsonl'],
  ['--dry-run','journal.jsonl','--scorecard','score.json'],
 ])('does not treat scorecard as the journal regardless of option order: %j',(...args)=>{
  expect(parseImportCallsOptions(args)).toEqual({journalPath:'journal.jsonl',scorecardPath:'score.json',dryRun:true});
 });
 it('keeps explicit dry-run off by default and does not infer it from a literal filename',()=>{
  expect(parseImportCallsOptions(['journal.jsonl'])).toEqual({journalPath:'journal.jsonl',dryRun:false});
  expect(parseImportCallsOptions(['--','--dry-run'])).toEqual({journalPath:'--dry-run',dryRun:false});
 });
 it.each([[],['--scorecard'],['--scorecard','--dry-run','journal.jsonl'],['journal.jsonl','extra.json'],['journal.jsonl','--unknown'],['journal.jsonl','--dry-run','--dry-run'],['journal.jsonl','--scorecard','a','--scorecard','b'],['--scorecard','score.json'],[''],['journal\0.jsonl']])('fails closed without including input in errors: %j',(...args)=>{
  expect(()=>parseImportCallsOptions(args)).toThrow('invalid_import_arguments');
 });
});
