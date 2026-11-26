import { createTranslator } from 'next-intl';
import { expect, it } from 'vitest';
import zh from '../../../messages/zh/analyst.json';
import en from '../../../messages/en/analyst.json';
import type { AnalystReport, ReportRecommendation, ReportTrade } from './report-types';
import { reportAnalysis, reportMarkdown, selectReport, type ReportTranslator } from './report-view';

const iso = '2026-11-20T16:01:00Z';
const rec: ReportRecommendation = {id:'r',analystId:'a',ticker:'01810.HK',market:'HK',action:'buy',recommendedAt:iso,withdrawnAt:null,
  referencePrice:null,targetPrice:null,stopLoss:null,score:null,hit:null,scoredAt:null,forward5dPct:null,forward20dPct:null,forward60dPct:null};
const trade: ReportTrade = {id:'trade',analystId:'a',ticker:rec.ticker,decisionId:'d',recommendationId:'r',direction:'buy',
  price:25,quantity:2,currency:'HKD',fee:1,executedAt:iso};
const data: AnalystReport = {generatedAt:iso,analysts:[{id:'a',name:'Alpha'},{id:'b',name:'Beta'}],
  recommendations:[{...rec,score:0,hit:false},{...rec,id:'r2',action:'sell',score:2,hit:true},
    {...rec,id:'r3',ticker:'XYZ',analystId:'b',action:'hold'},
    {...rec,id:'r4',ticker:'XYZ',analystId:'b',withdrawnAt:iso,hit:true,score:20}],
  trades:[trade,{...trade,id:'trade2',direction:'sell',quantity:1},
    {...trade,id:'trade3',analystId:'b',recommendationId:'r4',currency:'USD'}]};
const translator = (locale: string, analyst: typeof zh) =>
  createTranslator({locale,messages:{analyst},namespace:'analyst'}) as ReportTranslator;
const t=translator('zh',zh);

it('uses assessed, nonwithdrawn records for each denominator; zero scores and misses remain observations',() => {
  const view = selectReport(data,'');
  expect(view.stats).toMatchObject({registered:4,active:3,withdrawn:1,scored:2,average:1,assessed:2,hits:1,hitRate:50,fills:3,executedRecommendations:2});
  expect(view.byCurrency.get('HKD')).toEqual({buys:1,sells:1,gross:75,fees:2});
  expect(view.byCurrency.get('USD')?.gross).toBe(50);
  expect(reportAnalysis(view,t).join(' ')).toContain('并列');
  const b = selectReport(data,'b');
  expect(b.stats).toMatchObject({average:null,hitRate:null,fills:1,executedRecommendations:1});
  expect(b.trades[0].recommendationId).toBe('r4');
});

it('reports both directions on a concentrated ticker, and exports only the current selection and correct Beijing date',() => {
  const view = selectReport(data,'a');
  const text = reportMarkdown(view,'Alpha',iso,'zh',t);
  expect(text).toContain('01810.HK，共 2 条');
  expect(text).toContain('买入或加仓 1 条，卖出或减仓 1 条');
  expect(text).toContain('2026/11/21 00:01');
  expect(text).toContain('trade2');
  expect(text).not.toContain('trade3');
  expect(text).not.toContain('Beta');
});

it('renders empty report without inventing a zero hit rate or score, for both locales',() => {
  const empty = selectReport({...data, recommendations:[],trades:[]},'a');
  for (const [locale,messages] of [['zh',zh],['en',en]] as const) {
    const text=reportMarkdown(empty,'Alpha',iso,locale,translator(locale,messages));
    expect(text).toContain(messages.report.analysis.noHit);
    expect(text).toContain(messages.report.analysis.noScore);
    expect(text).not.toContain('NaN');
  }
});
