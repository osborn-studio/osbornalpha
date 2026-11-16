import {describe,expect,it} from 'vitest';
import {macroJudgmentsEnabled} from './flags';

describe('macroJudgmentsEnabled',()=>{
 it.each([[undefined,false],['',false],['true',false],['TRUE',false],[' 1',false],['1',true]] as const)('exact flag %s → %s',(value,enabled)=>{
  expect(macroJudgmentsEnabled({MACRO_JUDGMENTS_ENABLED:value})).toBe(enabled);
 });
});
