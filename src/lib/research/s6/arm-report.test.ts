import {describe,expect,it} from 'vitest';
import {renderArmMarkdown,summarizeArms,type ArmRow} from './arm-report';

const win=(sessions:number,status:string,r?:{price_return:number;benchmark_price_return:number;max_drawdown:number})=>({trading_sessions:sessions,starts_at:null,ends_at:null,status,reason:null,
 result:r?{price_return:r.price_return,benchmark_price_return:r.benchmark_price_return,benchmark_difference:Math.round((r.price_return-r.benchmark_price_return)*1e10)/1e10,max_drawdown:r.max_drawdown,benchmark:'SPY',currency:'USD'}:null});
const evaluation=(windows:ReturnType<typeof win>[],status='open')=>({status,windows} as ArmRow['evaluation']);
let n=0;
const row=(arm:ArmRow['arm'],thesis:string,week:string,evaluationValue:ArmRow['evaluation']|null,observation=true):ArmRow=>({decision_id:`d${++n}`,thesis_id:thesis,week_of:week,arm,action:'adopt',observation_id:observation?`o${n}`:null,evaluation:evaluationValue});

describe('summarizeArms',()=>{
 it('groups by arm, counts observation coverage and averages only resolved windows',()=>{
  const rows:ArmRow[]=[
   row('collab','t1','2026-09-21',evaluation([win(5,'resolved',{price_return:.10,benchmark_price_return:.02,max_drawdown:.03}),win(20,'open')])),
   row('collab','t2','2026-09-21',evaluation([win(5,'resolved',{price_return:-.02,benchmark_price_return:.02,max_drawdown:.05}),win(20,'data_insufficient')])),
   row('collab','t3','2026-09-21',null),
   row('collab','t4','2026-09-21',null,false),
  ];
  const s=summarizeArms(rows);
  expect(s.arms.collab).toMatchObject({decisions:4,with_observation:3,evaluated:2});
  expect(s.arms.collab.windows['5']).toMatchObject({n:2,resolved:2,open:0,pending_start:0,data_insufficient:0,mean_price_return:.04,mean_benchmark_difference:0.02,mean_max_drawdown:.04});
  expect(s.arms.collab.windows['20']).toMatchObject({n:2,resolved:0,open:1,data_insufficient:1,mean_price_return:null,mean_benchmark_difference:null,mean_max_drawdown:null});
  expect(s.arms.human_baseline).toMatchObject({decisions:0,with_observation:0,evaluated:0});
  expect(s.not_computed).toEqual(expect.arrayContaining(['deflated_sharpe','cost','sector_benchmark']));
 });
 it('derives the averaged arm only from thesis-weeks where both human_baseline and ai_candidate resolved the same window',()=>{
  const rows:ArmRow[]=[
   row('human_baseline','t1','2026-09-21',evaluation([win(5,'resolved',{price_return:.10,benchmark_price_return:.02,max_drawdown:.02})])),
   row('ai_candidate','t1','2026-09-21',evaluation([win(5,'resolved',{price_return:.00,benchmark_price_return:.02,max_drawdown:.06})])),
   row('human_baseline','t2','2026-09-21',evaluation([win(5,'resolved',{price_return:.50,benchmark_price_return:0,max_drawdown:0})])), // no ai_candidate partner
   row('ai_candidate','t3','2026-09-28',evaluation([win(5,'open')])),
   row('human_baseline','t3','2026-09-28',evaluation([win(5,'resolved',{price_return:.1,benchmark_price_return:0,max_drawdown:0})])),
  ];
  const s=summarizeArms(rows);
  expect(s.arms.averaged.windows['5']).toMatchObject({n:1,resolved:1,mean_price_return:.05,mean_benchmark_difference:.03,mean_max_drawdown:.04});
  expect(s.arms.averaged).toMatchObject({decisions:0,with_observation:0,evaluated:0,pairs:1});
  // An explicitly recorded 'averaged' decision is reported like any other arm's decision count but never enters the derived pairing.
  expect(summarizeArms([row('averaged','t9','2026-09-21',null)]).arms.averaged).toMatchObject({decisions:1,pairs:0});
 });
 it('handles an empty ledger and renders a facts-only markdown table',()=>{
  const s=summarizeArms([]);
  expect(Object.keys(s.arms).sort()).toEqual(['ai_candidate','averaged','collab','human_baseline']);
  const md=renderArmMarkdown(s);
  expect(md).toContain('| arm |');expect(md).toContain('事实区');expect(md).not.toMatch(/建议|买入|卖出/);
 });
});
