// Chart geometry helpers (spec §3.3, §3.4): positions only; markers snap to existing points; bands by month.
import {describe,expect,it} from 'vitest';
import {assetBarPanels,barGeometry,bandPoints,scatterGeometry,snapMarkers,sparklinePoints,withAlpha} from './chart-geometry';
describe('chart geometry',()=>{
 it('sparkline maps min→bottom, max→top; < 2 points → empty',()=>{
  expect(sparklinePoints(['1','3','2'],100,20,0)).toBe('0,20 50,0 100,10');
  expect(sparklinePoints(['5','5'],100,20,0)).toBe('0,10 100,10');
  expect(sparklinePoints(['5'],100,20)).toBe('');
 });
 it('scatter maps the domain to the plot box and draws the fit across it',()=>{
  const g=scatterGeometry([{x:0,y:0},{x:10,y:20}],{slope:2,intercept:0},120,120,10);
  expect(g.dots).toEqual([{cx:10,cy:110},{cx:110,cy:10}]);
  expect(g.line).toEqual({x1:10,y1:110,x2:110,y2:10});
  expect(g.xDomain).toEqual([0,10]);expect(g.yDomain).toEqual([0,20]);
 });
 it('withAlpha handles hex and rgba',()=>{
  expect(withAlpha('#eab308',0.14)).toBe('rgba(234, 179, 8, 0.14)');
  expect(withAlpha('rgba(202, 138, 4, 0.12)',0.3)).toBe('rgba(202, 138, 4, 0.3)');
  expect(withAlpha('red',0.5)).toBe('red');
 });
 it('markers snap to the first point on/after their date; later ones are dropped; output is sorted',()=>{
  const times=['2024-08-31','2024-09-30','2024-10-31'];
  expect(snapMarkers(times,[{time:'2024-10-15',k:'b'},{time:'2024-09-18',k:'a'},{time:'2024-11-07',k:'c'}])).toEqual([{time:'2024-09-30',k:'a'},{time:'2024-10-31',k:'b'}]);
 });
 it('bands cover points by month, inclusive',()=>{
  expect(bandPoints(['2024-08-31','2024-09-30','2024-10-31','2024-11-30'],[{start:'2024-09-18',end:'2024-10-02',direction:'down'}])).toEqual([{time:'2024-09-30',direction:'down'},{time:'2024-10-31',direction:'down'}]);
 });
});


describe('asset bar geometry (§4.3)',()=>{
 it('centres bars and keeps the original strategy geometry cases',()=>{
  expect(barGeometry(-50,100,100)).toEqual({x:50,width:50});
  expect(barGeometry(100,100,100)).toEqual({x:100,width:100});
  expect(barGeometry(null,100,100)).toEqual({x:100,width:0});
  expect(barGeometry(0,0,50)).toEqual({x:50,width:0});
 });
 const cycles=[{start:'2024-01-01',end:'2024-12-31'},{start:'2025-01-01',end:'2025-12-31'}];
 const asset=(asset_id:string,change_kind:'pct'|'bp',change_text:string|null,cycle_index=0)=>({asset_id,asset_name:{zh:asset_id,en:asset_id},change_kind,change_text,cycle_index,start_period:'2024-01-31',end_period:'2024-12-31',start_value:null,end_value:null,observation_ids:[],missing:change_text===null?'both' as const:null});
 it('separates units and cycles, retaining source text precision for display',()=>{
  const panels=assetBarPanels([asset('stock','pct','2.6845'),asset('oil','pct','-4'),asset('bond','bp','-75'),asset('next','pct','10',1)],cycles);
  expect(panels).toHaveLength(2);
  expect(panels[0].pct).toEqual({domainMax:4,rows:[{asset_id:'stock',name:{zh:'stock',en:'stock'},value:2.6845,text:'+2.68%'},{asset_id:'oil',name:{zh:'oil',en:'oil'},value:-4,text:'−4.00%'}]});
  expect(panels[0].bp.domainMax).toBe(75);
  expect(panels[1].pct.domainMax).toBe(10);
  expect(panels[1].bp).toEqual({domainMax:0,rows:[]});
 });
 it('keeps missing and invalid values null; real zero remains zero',()=>{
  const panel=assetBarPanels([asset('missing','pct',null),asset('bad','pct',''),asset('invalid','bp','NaN'),asset('zero','bp','0')],cycles)[0];
  expect(panel.pct).toEqual({domainMax:0,rows:[{asset_id:'missing',name:{zh:'missing',en:'missing'},value:null,text:'缺失'},{asset_id:'bad',name:{zh:'bad',en:'bad'},value:null,text:'缺失'}]});
  expect(panel.bp.rows.map(r=>[r.value,r.text])).toEqual([[null,'缺失'],[0,'0 bp']]);
 });
});
