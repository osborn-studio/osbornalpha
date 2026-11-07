// Chart geometry helpers (spec §3.3, §3.4): positions only; markers snap to existing points; bands by month.
import {describe,expect,it} from 'vitest';
import {bandPoints,scatterGeometry,snapMarkers,sparklinePoints,withAlpha} from './chart-geometry';
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
