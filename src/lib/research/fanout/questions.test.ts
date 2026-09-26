import {describe,expect,it} from 'vitest';
import {QUESTIONS,QUESTION_IDS,QUESTION_SET_VERSION,decide} from './questions';

describe('question set v1.0',()=>{
 it('pins the version and the option keys of every question',()=>{
  expect(QUESTION_SET_VERSION).toBe('v1.0');
  expect(QUESTION_IDS).toEqual(['Q1','Q2','Q3','Q4','Q5']);
  expect(QUESTIONS.Q1).toMatchObject({type:'noul',options:['true','false']});
  expect(QUESTIONS.Q2).toMatchObject({type:'choice',options:['support','weaken','trigger_invalidation','related_insufficient']});
  expect(QUESTIONS.Q3).toMatchObject({type:'choice',material_level:true,options:['filing_or_regulator','executive_statement','third_party_data','analyst_or_media','retelling','unknown']});
  expect(QUESTIONS.Q4).toMatchObject({type:'choice',options:['completed','planned','denied','conditional','not_applicable']});
  expect(QUESTIONS.Q5).toMatchObject({type:'noul',options:['true','false']});
  for(const id of QUESTION_IDS) expect(QUESTIONS[id].instructions.length).toBeGreaterThan(10);
 });
});

describe('decide (abstention bands and fallbacks)',()=>{
 it('Q1: relevant above 0.6, irrelevant below 0.4, abstains in between',()=>{
  expect(decide('Q1',{true:0.9,false:0.1},null)).toEqual({selected:'true',abstained:false,confidence:null});
  expect(decide('Q1',{true:0.2,false:0.8},null)).toEqual({selected:'false',abstained:false,confidence:null});
  expect(decide('Q1',{true:0.5,false:0.5},null)).toEqual({selected:null,abstained:true,confidence:null});
  expect(decide('Q1',{true:0.6,false:0.4},null)).toEqual({selected:null,abstained:true,confidence:null});
 });
 it('Q2: abstains under confidence 0.6 and keeps the argmax otherwise',()=>{
  const dist={support:0.7,weaken:0.1,trigger_invalidation:0.1,related_insufficient:0.1};
  expect(decide('Q2',dist,0.55)).toEqual({selected:null,abstained:true,confidence:0.55});
  expect(decide('Q2',dist,0.6)).toEqual({selected:'support',abstained:false,confidence:0.6});
 });
 it('Q3/Q4: low confidence falls back to unknown / not_applicable without abstaining',()=>{
  expect(decide('Q3',{filing_or_regulator:0.4,analyst_or_media:0.35,unknown:0.25},0.3)).toEqual({selected:'unknown',abstained:false,confidence:0.3});
  expect(decide('Q3',{filing_or_regulator:0.8,unknown:0.2},0.7)).toEqual({selected:'filing_or_regulator',abstained:false,confidence:0.7});
  expect(decide('Q4',{completed:0.4,planned:0.35,not_applicable:0.25},0.2)).toEqual({selected:'not_applicable',abstained:false,confidence:0.2});
 });
 it('derives confidence for choices when the backend gives none, and rejects unknown option keys',()=>{
  // (n·max_p − 1)/(n − 1) with n = number of options in the question set.
  const d=decide('Q2',{support:0.85,weaken:0.05,trigger_invalidation:0.05,related_insufficient:0.05},null);
  expect(d.confidence).toBeCloseTo((4*0.85-1)/3,6);
  expect(d.selected).toBe('support');
  expect(()=>decide('Q2',{yes:1},0.9)).toThrow('invalid_schema');
  expect(()=>decide('Q9' as any,{true:1},null)).toThrow('invalid_schema');
 });
 it('treats an empty distribution as an abstention',()=>{
  expect(decide('Q2',{},null)).toEqual({selected:null,abstained:true,confidence:null});
 });
});
