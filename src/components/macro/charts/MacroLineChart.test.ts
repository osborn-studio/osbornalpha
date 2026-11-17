import React, {act} from 'react';
import {create, type ReactTestRenderer} from 'react-test-renderer';
import {afterEach, expect, it, vi} from 'vitest';
import {MacroLineChart, type MarkerLayers} from './MacroLineChart';

const chart = vi.hoisted(() => ({
 setMarkers: vi.fn(), setData: vi.fn(), remove: vi.fn(),
}));
vi.mock('lightweight-charts', () => ({
 CrosshairMode: {Normal: 0},
 createChart: () => ({
  addLineSeries: () => chart,
  timeScale: () => ({fitContent: vi.fn()}),
  remove: chart.remove,
 }),
}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
let tree: ReactTestRenderer;
afterEach(async () => {
 if (tree) await act(async () => tree.unmount());
 vi.unstubAllGlobals();
 vi.clearAllMocks();
});
const markers = [
 {time: '2026-10-01', kind: 'derived' as const, text: '-25 bp'},
 {time: '2026-10-01', kind: 'derived' as const, text: ''},
 {time: '2026-10-01', kind: 'calendar' as const, text: ''},
];
it.each([
 [undefined, ['arrowDown', 'arrowDown']],
 [{calendar: true}, ['arrowDown', 'arrowDown', 'circle']],
 [{derived: false, calendar: true}, ['circle']],
 [{derived: false}, []],
] as [MarkerLayers | undefined, string[]][])(
 'applies chart layers %j and retains separate markers snapping to the same bar', async (layers, shapes) => {
  vi.stubGlobal('document', {documentElement: {}});
  vi.stubGlobal('getComputedStyle', () => ({getPropertyValue: () => ''}));
  vi.stubGlobal('ResizeObserver', class {observe() {} disconnect() {}});
  await act(async () => {
   tree = create(React.createElement(MacroLineChart, {
    points: [{time: '2026-10-31', value: 4.2}], markers, layers, ariaLabel: 'History',
   }), {createNodeMock: () => ({clientWidth: 600, innerHTML: ''})});
  });
  const rendered = chart.setMarkers.mock.calls.at(-1)![0];
  expect(rendered.map((m: {shape: string}) => m.shape)).toEqual(shapes);
  expect(rendered.every((m: {time: string}) => m.time === '2026-10-31')).toBe(true);
  expect(rendered.map((m: {text: string}) => m.text)).toEqual(
   shapes.map((shape, index) => shape === 'arrowDown' && index === 0 ? '-25 bp' : ''),
  );
 });

it('splits lines at missing values instead of interpolating or plotting zero',async()=>{
 vi.stubGlobal('document',{documentElement:{}});
 vi.stubGlobal('getComputedStyle',()=>({getPropertyValue:()=>''}));
 vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
 await act(async()=>{tree=create(React.createElement(MacroLineChart,{points:[{time:'2026-01-01',value:2},{time:'2026-02-01',value:null},{time:'2026-03-01',value:3}],ariaLabel:'History'}),{createNodeMock:()=>({clientWidth:600,innerHTML:''})});});
 expect(chart.setData.mock.calls.map(c=>c[0])).toEqual([[{time:'2026-01-01',value:2}],[{time:'2026-03-01',value:3}]]);
});
it('assigns event markers once across separate line segments',async()=>{
 vi.stubGlobal('document',{documentElement:{}});
 vi.stubGlobal('getComputedStyle',()=>({getPropertyValue:()=>''}));
 vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
 await act(async()=>{tree=create(React.createElement(MacroLineChart,{points:[{time:'2026-01-01',value:2},{time:'2026-02-01',value:null},{time:'2026-03-01',value:3}],markers:[{time:'2026-01-01',kind:'derived',text:'first'}],ariaLabel:'History'}),{createNodeMock:()=>({clientWidth:600,innerHTML:''})});});
 expect(chart.setMarkers.mock.calls.flatMap(c=>c[0])).toHaveLength(1);
});
