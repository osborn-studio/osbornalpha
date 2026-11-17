import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it} from 'vitest';
import type {ReactNode} from 'react';
import en from '../../../messages/en/company.json';
import zh from '../../../messages/zh/company.json';
import enResearch from '../../../messages/en/research.json';
import zhResearch from '../../../messages/zh/research.json';
import enTracking from '../../../messages/en/tracking.json';
import zhTracking from '../../../messages/zh/tracking.json';
import enJudgments from '../../../messages/en/judgments.json';
import zhJudgments from '../../../messages/zh/judgments.json';
import {JudgmentsContent} from './JudgmentsView';
import {TrackingContent} from './tracking/tracking-view-state';
import {InboxCompanyStatus,InboxDegradedControls,InboxUnavailable} from './tracking/inbox-degrade-view';
import {checkJudgmentsResponse} from '@/lib/company/judgments';
import type {InboxRowDto,WatchCard} from '@/lib/company/tracking-client';
import {toCard} from '@/lib/judgments/display';
import {envelope} from '@/lib/judgments/testing/envelopes';
import {serializeBody} from '@/lib/judgments/route-utils';
const card=serializeBody(toCard(envelope(),{title:{zh:'测试',en:'Test'},now:'2026-06-30T23:59:59.999Z'}));
const fixture={codeVersion:'abc1234',subject:card.subject,view:'latest',asOf:null,cards:[card]};
const checked=checkJudgmentsResponse(fixture,null,fixture.subject.key);
const cards=checked.ok?checked.cards:[];
for(const locale of ['zh','en'] as const){
 const render=(children:ReactNode)=>renderToStaticMarkup(<NextIntlClientProvider locale={locale} timeZone="UTC" messages={{company:locale==='zh'?zh:en,research:locale==='zh'?zhResearch:enResearch,tracking:locale==='zh'?zhTracking:enTracking,judgments:locale==='zh'?zhJudgments:enJudgments}}>{children}</NextIntlClientProvider>);
 it.each(['off','none','cards','failed','replayMismatch','loading'] as const)(`judgments %s ${locale}`,state=>{
  const html=render(<JudgmentsContent model={state==='cards'?{state,cards}:state==='failed'?{state,code:'down'}:{state}} retry={()=>{}}/>);
  expect(html).toContain(`data-judgments-state="${state}"`);
  expect(html.includes('data-mark="judgment"')).toBe(state==='cards');
  const copy=locale==='zh'?zh:en;
  if(state==='off') {expect(html).toContain(copy.judgments.emptyTitle);expect(html).not.toContain('<button');}
  if(state==='none')expect(html).toContain(copy.judgments.none);
  if(state==='cards')expect(html).toContain(cards[0].display.headline[locale]);
  if(state==='loading')expect(html).toContain('aria-busy="true"');
  if(state==='failed'||state==='replayMismatch') {expect(html).toContain('role="alert"');expect(html).toContain(locale==='zh'?(state==='failed'?'判断读取失败（down）':'回放读取失败'):(state==='failed'?'Judgments failed to load (down)':'Replay failed to load'));expect(html).toContain(copy.states.retry);}
 });
 it(`tracking unavailable hides rows, empty and withheld ${locale}`,()=>{
  const html=render(<TrackingContent error="down" loading={false} rowCount={3} ticker="TEST" asOf="2024-01-01" retry={()=>{}} withheld={{citationPending:2,evidenceIncomplete:1}}><p>OLD EVENT</p></TrackingContent>);
  expect(html).toContain('data-tracking-state="unavailable"');expect(html).toContain('role="alert"');expect(html).toContain(locale==='zh'?'事件暂不可用':'Events temporarily unavailable');expect(html).toContain(locale==='zh'?'重试':'Retry');expect(html).toContain('view=filings&amp;asOf=2024-01-01');expect(html).not.toContain('OLD EVENT');expect(html).not.toContain('tracking-withheld');expect(html).not.toContain(locale==='zh'?'该期间无事件':'No events in this period');
 });
 it.each([0,2])(`tracking withheld accompanies empty or rows %s ${locale}`,rowCount=>{
  const html=render(<TrackingContent error={null} loading={false} rowCount={rowCount} ticker="TEST" asOf={null} retry={()=>{}} withheld={{citationPending:2,evidenceIncomplete:1}}><p>EVENT</p></TrackingContent>);
  expect(html).toContain(`data-tracking-state="${rowCount?'ok':'empty'}"`);expect(html).not.toContain('role="alert"');expect(html).toContain('data-research-state="withheld"');expect(html).toContain('data-testid="tracking-withheld"');expect(html).toContain(rowCount?'EVENT':locale==='zh'?'该期间无事件':'No events in this period');
 });
 it(`inbox table and partial chip ${locale}`,()=>{
  const watches=['a','b','c'].map(issuerId=>({issuerId,names:{zh:`公司${issuerId}`,en:`Company ${issuerId}`},tickers:[{ticker:issuerId}],primaryTicker:{US:issuerId}} as WatchCard));
  const row={eventId:'1',firstSeenAt:'2026-01-01',occurredOn:'2025-12-31',kind:'filing_published',read:false} as InboxRowDto;
  const html=render(<><InboxCompanyStatus watches={watches} perIssuer={new Map([['a',{state:'ok' as const,rows:[row]}],['b',{state:'ok' as const,rows:[]}],['c',{state:'unavailable' as const,code:'down'}]])}/><InboxDegradedControls partial retry={()=>{}}/></>);
  for(const text of locale==='zh'?['未读','该期间无事件','事件暂不可用','部分不可用']:['Unread','No events in this period','Events temporarily unavailable','Partially unavailable'])expect(html).toContain(text);
  expect(html).toContain('2025-12-31');expect(html).toContain('inbox-company-status');expect(html).toContain('inbox-unavailable-row');expect(html).toContain('inbox-partial-chip');expect(html).not.toContain('data-research-state');
  expect(render(<InboxDegradedControls partial={false} retry={()=>{}}/>)).not.toContain('inbox-partial-chip');
  expect(render(<InboxUnavailable code="down" retry={()=>{}}/>)).toContain('data-testid="inbox-unavailable"');
 });
}
