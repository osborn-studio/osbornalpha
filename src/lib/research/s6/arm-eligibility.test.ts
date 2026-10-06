import {randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {validateArmSince,validateRegisteredArmWindow} from './arm-eligibility';
const row=()=>({decision_id:randomUUID(),thesis_id:randomUUID(),week_of:'2026-10-05',arm:'collab',action:'adopt',observation_id:randomUUID(),card_id:randomUUID(),cited_judgment_ids:[]});
describe('registered arm structural admission (not provenance authorization)',()=>{
 it('accepts real date bounds and rejects normalized overflow and wrong input types',()=>{
  expect(validateArmSince(undefined)).toBeUndefined();expect(validateArmSince('2024-02-29')).toBe('2024-02-29');
  for(const value of ['2026-02-29','2026-02-30','2026-13-01','2026-1-1','2026-01-01T00:00:00Z',null,4])expect(()=>validateArmSince(value)).toThrow('invalid_schema');
 });
 it('preserves all rows and order at the exact bound without exposing extra content or mutable input',()=>{
  const rows=Array.from({length:100},()=>({...row(),reason:'private fixture sentinel'}));const result=validateRegisteredArmWindow(rows);
  expect(result.map(r=>r.decision_id)).toEqual(rows.map(r=>r.decision_id));expect(JSON.stringify(result)).not.toContain('sentinel');expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result[0])).toBe(true);
  rows[0].card_id=randomUUID();expect(result[0].research_card_id).not.toBe(rows[0].card_id);expect(validateRegisteredArmWindow([])).toEqual([]);
  expect(()=>validateRegisteredArmWindow([...rows,row()])).toThrow('input_limit');
 });
 it('rejects unprovable rows rather than returning a smaller denominator',()=>{
  for(const patch of [{observation_id:null},{card_id:null},{arm:'averaged'},{cited_judgment_ids:[randomUUID()]}])expect(()=>validateRegisteredArmWindow([row(),{...row(),...patch}])).toThrow('not_configured');
 });
 it('rejects reused observations across arms and within an arm, and duplicate decisions',()=>{
  const a=row();for(const b of [{...row(),observation_id:a.observation_id},{...row(),arm:'human_baseline',observation_id:a.observation_id},{...row(),decision_id:a.decision_id}])expect(()=>validateRegisteredArmWindow([a,b])).toThrow('not_configured');
 });
 it('rejects repeated thesis/week/arm in either order even with distinct decision, card and observation IDs',()=>{
  const a=row(),b={...row(),thesis_id:a.thesis_id};
  for(const rows of [[a,b],[b,a]])expect(()=>validateRegisteredArmWindow(rows)).toThrow('not_configured');
 });
 it('keeps hypothetical structural rows in distinct cohorts, without claiming writer compatibility',()=>{
  const a=row();const rows=[a,{...row(),thesis_id:a.thesis_id,arm:'human_baseline'},{...row(),thesis_id:a.thesis_id,arm:'ai_candidate'},{...row(),thesis_id:a.thesis_id,week_of:'2026-10-12'},row()];
  expect(validateRegisteredArmWindow(rows)).toHaveLength(5);
 });
 it('refuses current weekly writer shapes and multi-card cohorts without backfilling fields',()=>{
  const baseline={...row(),arm:'human_baseline',card_id:null,observation_id:null};
  const ai={...row(),arm:'ai_candidate',observation_id:null,cited_judgment_ids:[randomUUID()]};
  for(const rows of [[baseline],[ai],[row(),baseline,ai]])expect(()=>validateRegisteredArmWindow(rows)).toThrow('not_configured');
  const a={...row(),arm:'collab'},b={...row(),arm:'collab'};b.thesis_id=a.thesis_id;
  expect(()=>validateRegisteredArmWindow([a,b])).toThrow('not_configured');
 });
 it('requires canonical lowercase IDs and reads a routing accessor once',()=>{
  const a=row();expect(()=>validateRegisteredArmWindow([a,{...row(),observation_id:a.observation_id.toUpperCase()}])).toThrow('not_configured');
  let reads=0;const id=randomUUID(),input={...row(),get observation_id(){reads++;return reads===1?id:'unvalidated';}};
  expect(validateRegisteredArmWindow([input])[0].observation_id).toBe(id);expect(reads).toBe(1);
 });
 it('rejects malformed routing fields without echoing supplied contents',()=>{
  for(const patch of [{decision_id:'sentinel'},{thesis_id:null},{week_of:'2026-02-30'},{action:'buy'},{cited_judgment_ids:null}])expect(()=>validateRegisteredArmWindow([{...row(),...patch}])).toThrow('invalid_schema');
  for(const value of [null,{},'sentinel',[null],[[]]])expect(()=>validateRegisteredArmWindow(value)).toThrow('invalid_schema');
 });
});
