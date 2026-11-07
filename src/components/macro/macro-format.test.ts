// Display formatting from value_text (spec §3.2): string rounding (no float drift), typed changes, neutral arrows.
import {describe,expect,it} from 'vitest';
import {MISSING,formatChange,formatInstant,formatPeriod,formatValueText,roundDecimalText,typedChange,unitLabel,unitSuffix} from './macro-format';
describe('roundDecimalText',()=>{
 it('rounds half away from zero on the decimal string and pads',()=>{
  expect(roundDecimalText('2.9381',2)).toBe('2.94');
  expect(roundDecimalText('4.8',2)).toBe('4.80');
  expect(roundDecimalText('0.005',2)).toBe('0.01');
  expect(roundDecimalText('-0.005',2)).toBe('-0.01');
  expect(roundDecimalText('-0.004',2)).toBe('0.00');
  expect(roundDecimalText('1.5',0)).toBe('2');
  expect(roundDecimalText('999.995',2)).toBe('1000.00');
  expect(roundDecimalText('1.0000000000000000001',2)).toBe('1.00');
 });
});
describe('formatValueText',()=>{
 it('keeps source precision up to 2 decimals',()=>{
  expect(formatValueText('2.9381')).toBe('2.94');expect(formatValueText('4.80')).toBe('4.80');expect(formatValueText('4.800')).toBe('4.80');expect(formatValueText('4.8')).toBe('4.8');expect(formatValueText('-0.50')).toBe('-0.50');expect(formatValueText('50')).toBe('50');expect(formatValueText('710.255')).toBe('710.26');
 });
});
describe('typedChange',()=>{
 it('bp / pp / pct / points with neutral arrows',()=>{
  expect(typedChange('4.80','4.78','bp')).toEqual({text:'+2 bp',arrow:'↑',kind:'bp'});
  expect(typedChange('3.75','3.75','bp')).toEqual({text:'0 bp',arrow:'→',kind:'bp'});
  expect(typedChange('2.9','2.6','pp')).toEqual({text:'+0.3 pp',arrow:'↑',kind:'pp'});
  expect(typedChange('4.2','4.3','pp')).toEqual({text:'−0.1 pp',arrow:'↓',kind:'pp'});
  expect(typedChange('103.4','103','pct')).toEqual({text:'+0.39 pct',arrow:'↑',kind:'pct'});
  expect(typedChange('121.37','121.06','points')).toEqual({text:'+0.31 points',arrow:'↑',kind:'points'});
  expect(typedChange('4.125','4','bp')?.text).toBe('+12.5 bp');
 });
 it('has no float drift (0.3 − 0.1 is exactly 0.2)',()=>{expect(typedChange('0.3','0.1','pp')?.text).toBe('+0.2 pp');});
 it('formatChange renders an exact change already computed by the overview (views.ts changeOf)',()=>{
  expect(formatChange({kind:'bp',value_text:'10'})).toEqual({text:'+10 bp',arrow:'↑',kind:'bp'});
  expect(formatChange({kind:'pct',value_text:'1.2'})).toEqual({text:'+1.20 pct',arrow:'↑',kind:'pct'});
  expect(formatChange({kind:'pct',value_text:'-4.7619'})).toEqual({text:'−4.76 pct',arrow:'↓',kind:'pct'});
  expect(formatChange({kind:'points',value_text:'-0.4'})).toEqual({text:'−0.4 points',arrow:'↓',kind:'points'});
  expect(formatChange({kind:'pp',value_text:'0'})).toEqual({text:'0 pp',arrow:'→',kind:'pp'});
 });
 it('missing input or non-positive pct base → null (rendered as missing, never 0)',()=>{
  expect(typedChange(null,'1','pp')).toBeNull();expect(typedChange('1',null,'pp')).toBeNull();expect(typedChange('5','0','pct')).toBeNull();
 });
});
describe('period / instant / unit',()=>{
 it('formats by period kind',()=>{
  expect(formatPeriod('2026-09-30','month')).toBe('2026-09');expect(formatPeriod('2026-09-30','quarter')).toBe('2026-Q3');expect(formatPeriod('2026-11-03','day')).toBe('2026-11-03');
 });
 it('instants are printed in UTC, invalid → missing',()=>{
  expect(formatInstant('2026-11-03T03:12:08Z')).toBe('2026-11-03 03:12 UTC');expect(formatInstant('nope')).toBe(MISSING);
 });
 it('unit suffix: percent attaches, every other catalog unit is localized, unknown is empty',()=>{
  const tt=(k:string)=>`<${k}>`;
  expect(unitSuffix('pct',tt)).toBe('%');expect(unitSuffix('cny_per_100usd',tt)).toBe(' <units.cny_per_100usd>');expect(unitSuffix('usd_per_bbl',tt)).toBe(' <units.usd_per_bbl>');
  expect(unitSuffix('index',tt)).toBe(' <units.index>');expect(unitSuffix('mystery',tt)).toBe('');
  expect(unitLabel('pct',tt)).toBe('<units.pct>');expect(unitLabel('mystery',tt)).toBe('');
 });
});
