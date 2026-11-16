import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {toCard} from '@/lib/judgments/display';
import {envelope} from '@/lib/judgments/testing/envelopes';
import {serializeBody} from '@/lib/judgments/route-utils';
import {cardBody} from '@/components/judgments/view-model';

const state=vi.hoisted(()=>({data:null as unknown}));
vi.mock('@/lib/company/client',()=>({JUDGMENTS_FLAG:true}));
vi.mock('@/components/company/useCompanyFetch',()=>({useCompanyFetch:()=>({state:{status:'success',data:state.data},retry:()=>{}})}));
vi.mock('next-intl',()=>({useLocale:()=> 'en',useTranslations:()=> (key:string)=>key}));

import {JudgmentsView} from '@/components/company/JudgmentsView';

const issuer='11111111-1111-4111-8111-111111111111';
describe('company F4 rendering',()=>{
 it('renders an F4 JudgmentCard from the parsed route response without an uncalibrated percentage',()=>{
  const card=serializeBody(toCard(envelope(),{title:{zh:'测试',en:'Test'},now:'2026-06-30T23:59:59.999Z'}));
  state.data={codeVersion:'abc1234',subject:{type:'issuer',key:issuer},view:'latest',asOf:null,cards:[card]};
  const html=renderToStaticMarkup(createElement(JudgmentsView,{issuerId:issuer,asOf:null}));
  expect(html).toContain('aria-label="Revenue grows year over year');
  expect(html).toContain('ui.calibration.insufficient');
  expect(html).not.toContain('70%');
 });
 it('keeps the company lifecycle gate when F4 renders a calibrated void card',()=>{
  const card=serializeBody(toCard(envelope(),{title:{zh:'测试',en:'Test'},now:'2026-06-30T23:59:59.999Z'}));
  card.calibration='calibrated';card.lifecycle='void';card.display.percent=70;
  expect(cardBody(card,'en').type).toBe('percent'); // F4 currently gates kind/calibration, not lifecycle.
  state.data={codeVersion:'abc1234',subject:{type:'issuer',key:issuer},view:'latest',asOf:null,cards:[card]};
  const html=renderToStaticMarkup(createElement(JudgmentsView,{issuerId:issuer,asOf:null}));
  expect(html).toContain('ui.lifecycle.void');
  expect(html).not.toContain('70%');
 });
 it.each([null,'2026-06-30'])('rejects another issuer response when asOf=%s',asOf=>{
  const otherIssuer='22222222-2222-4222-8222-222222222222';
  const card=serializeBody(toCard(envelope(),{title:{zh:'测试',en:'Test'},now:'2026-06-30T23:59:59.999Z'}));
  card.subject={type:'issuer',key:otherIssuer};
  state.data={codeVersion:'abc1234',subject:{type:'issuer',key:otherIssuer},view:asOf?'as_known':'latest',asOf,cards:[card]};
  const html=renderToStaticMarkup(createElement(JudgmentsView,{issuerId:issuer,asOf}));
  expect(html).not.toContain('aria-label="Revenue grows year over year');
  expect(html).toContain(asOf?'replayFailed':'loadFailed');
 });
 it('rejects another issuer empty response instead of showing no judgments',()=>{
  state.data={codeVersion:'abc1234',subject:{type:'issuer',key:'22222222-2222-4222-8222-222222222222'},view:'latest',asOf:null,cards:[]};
  const html=renderToStaticMarkup(createElement(JudgmentsView,{issuerId:issuer,asOf:null}));
  expect(html).toContain('loadFailed');
  expect(html).not.toContain('>none<');
 });

});
