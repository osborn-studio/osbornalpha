import {describe,expect,it} from 'vitest';
import {FACT_CONCEPTS} from '../../facts/concepts';
import {LABEL_RULES,headingSection,labelCore,labelVariants,matchConcepts,normalizeLabel} from './labels';
import type {Section} from './labels';

describe('labels (spec §7.5 step 4)',()=>{
 it('covers exactly the 18 concepts, all landed spec-2 FACT_CONCEPTS on their statement',()=>{
  const ids=[...new Set(LABEL_RULES.map(r=>r.concept))];
  expect(ids).toHaveLength(18);
  for(const r of LABEL_RULES)expect({concept:r.concept,statement:FACT_CONCEPTS.find(c=>c.id===r.concept)?.statement}).toEqual({concept:r.concept,statement:r.statement});
 });
 it('normalizes labels: NFKC, bullets, trailing note numbers and colons; the core drops a trailing parenthesis',()=>{
  expect(normalizeLabel(' — 基本 ')).toBe('基本');
  expect(normalizeLabel('所得稅開支 9')).toBe('所得稅開支');
  expect(normalizeLabel('收益（附註5）')).toBe('收益(附註5)');
  expect(normalizeLabel('以下人士應佔：')).toBe('以下人士應佔');
  expect(labelCore('收益(附註5)')).toBe('收益');
  expect(labelCore('攤薄(港仙)')).toBe('攤薄');
 });
 it('matches whole labels in traditional, simplified and English, honouring statements and sections',()=>{
  const cases:[string,'IS'|'BS'|'CF',Section,string[]][]=[
   ['收益','IS',null,['revenue']],['Turnover','IS',null,['revenue']],['营业额','IS',null,['revenue']],['其他收益','IS',null,[]],
   ['銷售成本','IS',null,['cost_of_revenue']],['Cost of sales','IS',null,['cost_of_revenue']],['毛利','IS',null,['gross_profit']],
   ['經營溢利','IS',null,['operating_income']],['Operating profit','IS',null,['operating_income']],
   ['所得稅開支','IS',null,['income_tax']],['所得税','IS',null,['income_tax']],['Income tax expense','IS',null,['income_tax']],
   ['年內溢利','IS',null,['net_income']],['期内利润','IS',null,['net_income']],['Profit for the period','IS',null,['net_income']],
   ['本公司擁有人','IS','attribution',['net_income_parent']],['本公司擁有人','IS','attribution_ci',[]],['本公司擁有人','IS',null,[]],
   ['Owners of the Company','IS','attribution',['net_income_parent']],['Equity holders of the Company','IS','attribution',['net_income_parent']],
   ['基本','IS','eps',['eps_basic']],['基本','IS',null,[]],['Diluted','IS','eps',['eps_diluted']],['攤薄（港仙）','IS','eps',['eps_diluted']],
   ['資產總值','BS',null,['total_assets']],['Total liabilities','BS',null,['total_liabilities']],['本公司擁有人應佔權益','BS',null,['equity_parent']],
   ['Equity attributable to owners of the Company','BS',null,['equity_parent']],['權益總額','BS',null,['equity_total']],['現金及現金等價物','BS',null,['cash']],
   ['經營活動所得現金淨額','CF',null,['operating_cash_flow']],['投資活動所用之現金淨額','CF',null,['investing_cash_flow']],
   ['Net cash used in financing activities','CF',null,['financing_cash_flow']],['現金及現金等價物增加/(減少)淨額','CF',null,['net_change_in_cash']],
   ['Net decrease in cash and cash equivalents','CF',null,['net_change_in_cash']],['現金及現金等價物','CF',null,[]],['收益','BS',null,[]],
   // bilingual HKEX label cells and the variants of the recorded 0268.HK interim (one concept through both scripts is not ambiguous)
   ['Revenue from contracts with customers 與客戶之間的合同產生的收入','IS',null,['revenue']],['Cost of sales 銷售成本','IS',null,['cost_of_revenue']],
   ['Income tax credit 所得稅沖回','IS',null,['income_tax']],['Profit/(loss) for the period 當期盈利╱（虧損）','IS',null,['net_income']],
   ['Owners of the Company 本公司權益持有人','IS','attribution',['net_income_parent']],['– Basic －基本','IS','eps',['eps_basic']],['– Diluted －稀釋','IS','eps',['eps_diluted']],
   ['Total assets 總資產','BS',null,['total_assets']],['Total equity 總權益','BS',null,['equity_total']],['Cash and cash equivalents 現金及現金等價物','BS',null,['cash']],
   ['Net cash inflow/(outflow) from 經營活動產生╱（所用）淨現金 operating activities','CF',null,['operating_cash_flow']],
   ['Net cash outflow from financing activities 融資活動所用淨現金','CF',null,['financing_cash_flow']],
   ['Net (decrease)/increase in cash and cash 現金及現金等價物淨（減少）╱增加 equivalents','CF',null,['net_change_in_cash']],
   ['Gross profit 收益','IS',null,['gross_profit','revenue']],                                   // two scripts naming two concepts: ambiguous
  ];
  for(const [label,st,section,want] of cases)expect({label,st,section,got:matchConcepts(label,st,section)}).toEqual({label,st,section,got:want});
 });
 it('splits a bilingual label into its scripts',()=>{
  expect(labelVariants('Revenue 收益')).toEqual(['Revenue 收益','Revenue','收益']);
  expect(labelVariants('– Basic －基本')).toEqual(['Basic -基本','Basic','基本']);
  expect(labelVariants('收益')).toEqual(['收益']);
 });
 it('section headings: attribution (profit or comprehensive income, generic decided by the previous row) and EPS',()=>{
  expect(headingSection('以下人士應佔：',null)).toBe('attribution');
  expect(headingSection('以下人士應佔：','年內溢利')).toBe('attribution');
  expect(headingSection('以下人士應佔：','年內全面收益總額')).toBe('attribution_ci');
  expect(headingSection('以下人士應佔全面收益總額：',null)).toBe('attribution_ci');
  expect(headingSection('Profit for the period attributable to:',null)).toBe('attribution');
  expect(headingSection('Total comprehensive income attributable to:',null)).toBe('attribution_ci');
  expect(headingSection('每股盈利（人民幣元）',null)).toBe('eps');
  expect(headingSection('Earnings per share (HK cents)',null)).toBe('eps');
  expect(headingSection('Earnings/(losses) per share for 本公司權益持有人應佔',null)).toBe('eps');
  expect(headingSection('Profit/(loss) attributable to: 應佔當期盈利╱（虧損）：',null)).toBe('attribution');
  expect(headingSection('Total comprehensive income/(loss) attributable to: 應佔當期總綜合收益╱（虧損）：',null)).toBe('attribution_ci');
  expect(headingSection('其他全面收益',null)).toBeUndefined();
 });
});
