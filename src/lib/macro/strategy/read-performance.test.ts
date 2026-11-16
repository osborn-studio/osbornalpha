// Cold builders with sparse published snapshots: fallback reads must batch while retaining exact manifests.
import {describe,expect,it} from 'vitest';
import {buildSnapshotFactsManifest,levelIndicators} from './facts';
import {manifestHash} from './manifest';
import {memoryStrategyPort,type StrategyReadPort} from './port';
import {buildReviewManifest} from './review';
import {fedTargetFixture,fixture,monthly,snap} from './testing/fixture';

function profile(){
 const snapshots=[snap('US','2026-09-15T00:00:00Z',[]),snap('US','2026-10-15T00:00:00Z',[])];
 const empty=memoryStrategyPort(fixture());
 const observations=[...fedTargetFixture(),...levelIndicators(empty.catalog(),'US').filter(d=>d.status==='active')
  .flatMap(d=>monthly(d.id,'2026-08',['1','2','3'],{availableAt:'2026-09-01T00:00:00Z'})),
  ...monthly('US_WTI','2026-08',['60','61','62'],{availableAt:'2026-09-01T00:00:00Z'})];
 const base=memoryStrategyPort(fixture({snapshots,observations}));
 const calls:{ids:string[];asOf:string}[]=[];
 const port:StrategyReadPort={...base,latestObservations:async(ids,opts)=>{calls.push({ids,asOf:opts.asOf});return base.latestObservations(ids,opts);}};
 return {port,calls,snapshotId:snapshots[1].snapshot_id};
}

describe('cold strategy read budgets',()=>{
 it('batches snapshot explanation fallback by purpose, preserving the pinned manifest',async()=>{
  const {port,calls,snapshotId}=profile();
  const m=await buildSnapshotFactsManifest(port,snapshotId,'profile-code');
  if(!m)throw new Error('missing fixture snapshot');
  expect(manifestHash(m)).toBe('2898ba1d34f966fef00478c148438e68d32a9f2fd04c62690abf48e3b446f9af');
  expect(calls).toHaveLength(2); // level + spread (comparison roles differ)
  expect(calls.every(c=>c.asOf==='2026-10-15T00:00:00Z')).toBe(true);
 });
 it('batches review fallback separately at current and baseline cutoffs',async()=>{
  const {port,calls}=profile();
  const m=await buildReviewManifest(port,'US','2026-10','profile-code');
  expect(manifestHash(m)).toBe('807de675a22dfc0ffe25e1decd3733c5798a7e6c249271fa2ad402f24aeb853b');
  expect(calls).toHaveLength(2);
  expect(calls.map(c=>c.asOf).sort()).toEqual(['2026-10-03T00:00:00Z','2026-11-03T00:00:00Z']);
  expect(m.timeliness?.every(t=>t.state===port.timeliness(port.catalog().find(d=>d.id===t.series_id)!,null,'2026-11-03'))).toBe(true);
 });
});
