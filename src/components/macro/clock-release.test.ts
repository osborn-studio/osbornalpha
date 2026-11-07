import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MacroRegimeClock } from './MacroRegimeClock';
import { clockMetadataFrom } from './judgment-view';
import en from '../../../messages/en/macro.json';
import zh from '../../../messages/zh/macro.json';
import type { MacroT } from './use-macro-t';

const metadata = clockMetadataFrom({snapshot:{snapshot_id:'bound'},regime:{primary_state:'stagflation',secondary_state:'recession',coverage:0.6,margin_pp:0,growth_axis:null,inflation_axis:0.2},uncoveredWeight:40}, 'bound');
const translator = (messages: typeof en): MacroT => (key, values) => {
  const template = key.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown>)[k], messages) as string;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values?.[k]));
};
describe('clock release limitations', () => {
  it.each([en, zh])('renders coverage, missing axis and both tied categories beside the clock', messages => {
    const t = translator(messages);
    const html = renderToStaticMarkup(createElement(MacroRegimeClock, {selected:'stagflation',reason:null,metadata,metadataLoading:false,t}));
    expect(html).toContain(t('judgment.clock.coverage', {value:60}));
    expect(html).toContain(t('judgment.clock.missingAxis', {axes:t('judgment.clock.growth')}));
    expect(html).toContain(t('judgment.clock.tie', {primary:t('judgment.clock.stagflation'),secondary:t('judgment.clock.recession')}));
    expect(html.indexOf(t('judgment.clock.coverage', {value:60}))).toBeLessThan(html.indexOf('grid grid-cols-2'));
    expect(html).not.toContain('<svg');
  });
  it.each([true,false])('states uncertainty while metadata loading=%s', metadataLoading => {
    const t = translator(en);
    const html = renderToStaticMarkup(createElement(MacroRegimeClock, {selected:'overheat',reason:null,metadata:null,metadataLoading,t}));
    expect(html).toContain(t(metadataLoading ? 'judgment.clock.metadataLoading' : 'judgment.clock.metadataUnavailable'));
    expect(html).not.toContain('60%');
  });
});
