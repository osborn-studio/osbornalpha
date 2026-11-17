import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it} from 'vitest';
import zh from '../../../messages/zh/research.json';
import en from '../../../messages/en/research.json';
import {RESEARCH_STATES,STATE_SHOWS_VALUE,STATE_SHAPE,STATE_TONE,LEGACY_STATE_MAP,unifiedState} from './states';
import {StateBadge} from './StateBadge';
import {StateCell} from './StateCell';
const legacy: Record<string,string[]> = {
 missing:['missing','M','—'],withheld:['restricted','R','unlicensed','withheld','授权待确认'],notServed:['not_served'],
 lowCoverage:['coverageSic','insufficient','members','low_coverage'],reconstructed:['reconstruction'],
 stale:['stale'],revised:['revised','修订','drift:revised'],retracted:['quarantined','rejected','unpublished','retracted'],
};
it('maps the complete vocabulary and rejects unknown words',()=>{
 expect(RESEARCH_STATES).toEqual(Object.keys(legacy));
 for(const [state,words] of Object.entries(legacy))for(const word of words)expect(unifiedState(word)).toBe(state);
 expect(new Set(Object.values(LEGACY_STATE_MAP))).toEqual(new Set(RESEARCH_STATES));
 expect(unifiedState('unknown')).toBeNull();expect(unifiedState('toString')).toBeNull();
 expect(STATE_SHOWS_VALUE).toEqual({missing:false,withheld:false,notServed:false,lowCoverage:false,reconstructed:true,stale:true,revised:true,retracted:false});
 expect(STATE_SHAPE).toEqual({missing:'dashed',withheld:'dotted',notServed:'solid',lowCoverage:'dashed',reconstructed:'solid',stale:'solid',revised:'solid',retracted:'solid'});
 expect(STATE_TONE).toEqual({missing:'neutral',withheld:'neutral',notServed:'neutral',lowCoverage:'neutral',reconstructed:'accent',stale:'warn',revised:'warn',retracted:'danger'});
});
it.each(['zh','en'] as const)('renders labels and guards values in %s',locale=>{
 const catalog=locale==='zh'?zh:en;
 const render=(children:React.ReactNode)=>renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{research:catalog},children}));
 for(const state of RESEARCH_STATES){
  expect(catalog.stateMeaning[state]).not.toBe('');
  const html=render(createElement(StateBadge,{state}));
  expect(html).toContain(catalog.states[state]);expect(html).toContain(`data-research-state="${state}"`);
  expect(html).not.toMatch(/>0</);
  const cell=render(createElement(StateCell,{state,value:'0'}));
  expect(cell.includes('>0<')).toBe(STATE_SHOWS_VALUE[state]);
 }
 expect(render(createElement(StateCell,{state:'revised',value:'4.2%'}))).toContain('4.2%');
 expect(render(createElement(StateBadge,{state:'lowCoverage',detail:'0.62'}))).toContain('font-mono tabular-nums');
 expect(render(createElement(StateBadge,{state:'withheld',detail:'licence'}))).not.toContain('font-mono');
});
