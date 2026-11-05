// src/lib/facts/concepts.ts
// Concept catalogue (spec §3). FACT_CONCEPTS lists every concept the facts layer stores, in the
// order of the spec table: us-gaap tags in fallback order (first tag with an entry for the
// period wins; a lower tag only fills periods the higher one lacks), the ifrs-full alias, and
// the Tushare column (or a sum of columns). Only equivalent-basis aliases share a concept; a
// different basis is a different concept (revenue vs revenue_operating, capex vs
// capex_incl_intangibles). MAPPING_GEN and MAPPING_VERSION move together on any change here.
// 'dei:' prefixes a tag from the dei taxonomy (companyfacts facts.dei.*), everything else is
// facts['us-gaap'].* ; the EDGAR adapter splits on that prefix.
import type {ConceptDef,Statement,UnitKind} from './types';

export const MAPPING_GEN=1;
export const MAPPING_VERSION='facts-map/1';

type Api='income'|'balancesheet'|'cashflow';
const ts=(api:Api,field:string):ConceptDef['tushare']=>({api,field});
const tsSum=(api:Api,sum:string[]):ConceptDef['tushare']=>({api,sum});
const def=(id:string,statement:Statement,nature:'duration'|'instant',unitKind:UnitKind,usGaap:string[],ifrs:string[],tushare:ConceptDef['tushare'],notes?:string):ConceptDef=>
 notes===undefined?{id,statement,nature,unitKind,usGaap,ifrs,tushare}:{id,statement,nature,unitKind,usGaap,ifrs,tushare,notes};

export const FACT_CONCEPTS:readonly ConceptDef[]=[
 def('revenue','IS','duration','money',['Revenues','RevenueFromContractWithCustomerExcludingAssessedTax','SalesRevenueNet'],['Revenue'],ts('income','total_revenue')),
 def('revenue_operating','IS','duration','money',[],[],ts('income','revenue')),
 def('cost_of_revenue','IS','duration','money',['CostOfRevenue','CostOfGoodsAndServicesSold','CostOfGoodsSold'],['CostOfSales'],ts('income','oper_cost')),
 def('gross_profit','IS','duration','money',['GrossProfit'],['GrossProfit'],null),
 def('operating_income','IS','duration','money',['OperatingIncomeLoss'],['ProfitLossFromOperatingActivities'],ts('income','operate_profit')),
 def('net_income','IS','duration','money',['ProfitLoss'],['ProfitLoss'],ts('income','n_income')),
 def('net_income_parent','IS','duration','money',['NetIncomeLoss'],['ProfitLossAttributableToOwnersOfParent'],ts('income','n_income_attr_p')),
 def('eps_basic','IS','duration','per_share',['EarningsPerShareBasic'],['BasicEarningsLossPerShare'],ts('income','basic_eps')),
 def('eps_diluted','IS','duration','per_share',['EarningsPerShareDiluted'],['DilutedEarningsLossPerShare'],ts('income','diluted_eps')),
 def('rd_expense','IS','duration','money',['ResearchAndDevelopmentExpense'],['ResearchAndDevelopmentExpense'],ts('income','rd_exp')),
 def('sga_expense','IS','duration','money',['SellingGeneralAndAdministrativeExpense'],['SellingGeneralAndAdministrativeExpense'],tsSum('income',['sell_exp','admin_exp'])),
 def('interest_expense','IS','duration','money',['InterestExpense'],['InterestExpense'],ts('income','fin_exp_int_exp')),
 def('interest_expense_bank','IS','duration','money',[],[],ts('income','int_exp'),'bank basis'),
 def('income_tax','IS','duration','money',['IncomeTaxExpenseBenefit'],['IncomeTaxExpenseContinuingOperations'],ts('income','income_tax')),
 def('total_assets','BS','instant','money',['Assets'],['Assets'],ts('balancesheet','total_assets')),
 def('total_liabilities','BS','instant','money',['Liabilities'],['Liabilities'],ts('balancesheet','total_liab')),
 def('liabilities_and_equity','BS','instant','money',['LiabilitiesAndStockholdersEquity'],['EquityAndLiabilities'],null),
 def('equity_parent','BS','instant','money',['StockholdersEquity'],['EquityAttributableToOwnersOfParent'],ts('balancesheet','total_hldr_eqy_exc_min_int')),
 def('equity_total','BS','instant','money',['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],['Equity'],ts('balancesheet','total_hldr_eqy_inc_min_int')),
 def('cash','BS','instant','money',['CashAndCashEquivalentsAtCarryingValue'],['CashAndCashEquivalents'],ts('balancesheet','money_cap')),
 def('cash_and_restricted_cash','BS','instant','money',['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],[],null),
 def('short_term_borrowings','BS','instant','money',['ShortTermBorrowings'],['ShorttermBorrowings'],ts('balancesheet','st_borr')),
 def('long_term_borrowings','BS','instant','money',['LongTermDebtNoncurrent'],['LongtermBorrowings'],ts('balancesheet','lt_borr')),
 def('bonds_payable','BS','instant','money',[],[],ts('balancesheet','bond_payable')),
 def('shares_outstanding','BS','instant','shares',['CommonStockSharesOutstanding','dei:EntityCommonStockSharesOutstanding'],['NumberOfSharesOutstanding'],ts('balancesheet','total_share'),'cover_date'),
 def('operating_cash_flow','CF','duration','money',['NetCashProvidedByUsedInOperatingActivities'],['CashFlowsFromUsedInOperatingActivities'],ts('cashflow','n_cashflow_act')),
 def('investing_cash_flow','CF','duration','money',['NetCashProvidedByUsedInInvestingActivities'],['CashFlowsFromUsedInInvestingActivities'],ts('cashflow','n_cashflow_inv_act')),
 def('financing_cash_flow','CF','duration','money',['NetCashProvidedByUsedInFinancingActivities'],['CashFlowsFromUsedInFinancingActivities'],ts('cashflow','n_cash_flows_fnc_act')),
 def('capex','CF','duration','money',['PaymentsToAcquirePropertyPlantAndEquipment'],['PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities'],null),
 def('capex_incl_intangibles','CF','duration','money',[],[],ts('cashflow','c_pay_acq_const_fiolta')),
 def('dividends_paid','CF','duration','money',['PaymentsOfDividends'],['DividendsPaidClassifiedAsFinancingActivities'],null),
 def('dividends_and_interest_paid','CF','duration','money',[],[],ts('cashflow','c_pay_dist_dpcp_int_exp')),
 def('net_change_in_cash','CF','duration','money',['CashAndCashEquivalentsPeriodIncreaseDecrease'],['IncreaseDecreaseInCashAndCashEquivalents'],ts('cashflow','n_incr_cash_cash_equ')),
 def('net_change_in_cash_and_restricted','CF','duration','money',['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect'],[],null),
];

export const CONCEPT_IDS:readonly string[]=FACT_CONCEPTS.map(c=>c.id);
/** Upper bound of `concepts` on the public read route (spec §3). */
export const MAX_READ_CONCEPTS=FACT_CONCEPTS.length;
const BY_ID=new Map(FACT_CONCEPTS.map(c=>[c.id,c]));
export const conceptById=(id:string):ConceptDef|undefined=>BY_ID.get(id);
export const isConceptId=(id:unknown):id is string=>typeof id==='string'&&BY_ID.has(id);
/** Concepts fed by one Tushare table, in catalogue order (readonly like the catalogue). */
export const conceptsForTushare=(api:Api):readonly ConceptDef[]=>FACT_CONCEPTS.filter(c=>c.tushare!==null&&c.tushare.api===api);
/** Tushare columns a table request must ask for (value fields only; the adapter adds control fields). */
export const tushareFieldsFor=(api:Api):string[]=>[...new Set(conceptsForTushare(api).flatMap(c=>c.tushare!==null&&'sum' in c.tushare?c.tushare.sum:[(c.tushare as {field:string}).field]))];
