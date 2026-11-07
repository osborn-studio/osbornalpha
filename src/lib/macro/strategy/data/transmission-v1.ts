// src/lib/macro/strategy/data/transmission-v1.ts
// Transmission flow configuration v1 (spec 2026-11-07 §5.1, macro-transmission/1): six stages per region,
// economy → policy → liquidity → rates → risk → assets. Every edge is a mechanism assumption, never a measured link.
// Observed nodes name catalog ids (asset views resolve through aliasOf when read); catalog missing / restricted rows show
// their catalog state; series outside the catalog are 'not_in_catalog' nodes with a reason.
import type {Region} from '../contract';
import type {StageDef} from '../transmission';
const SPREAD={kind:'derived',id:'us_cn_10y_spread',op:'spread',a:'US_DGS10',b:'CN_CGB_10Y',unit:'pp',label:{zh:'中美 10 年期国债利差',en:'US–China 10-year government bond spread'}} as const;
const EDGE={
 economy:{zh:'机制假设：通胀与就业变化影响央行的政策取向',en:'Mechanism assumption: inflation and employment shape the policy stance'},
 policy:{zh:'机制假设：政策利率与操作改变银行体系流动性',en:'Mechanism assumption: policy rates and operations change banking-system liquidity'},
 liquidity:{zh:'机制假设：流动性松紧传到无风险利率与汇率',en:'Mechanism assumption: liquidity conditions pass through to risk-free rates and the exchange rate'},
 rates:{zh:'机制假设：无风险利率变化影响风险偏好与估值',en:'Mechanism assumption: risk-free rate moves affect risk appetite and valuations'},
 risk:{zh:'机制假设：风险偏好变化反映到资产价格',en:'Mechanism assumption: shifts in risk appetite show up in asset prices'},
};
const LABEL={
 economy:{zh:'经济数据',en:'Economic data'},policy:{zh:'政策',en:'Policy'},liquidity:{zh:'流动性',en:'Liquidity'},
 rates:{zh:'无风险利率',en:'Risk-free rates'},risk:{zh:'风险偏好',en:'Risk appetite'},assets:{zh:'资产',en:'Assets'},
};
export const TRANSMISSION_V1:Record<Region,StageDef[]>={
 US:[
  {stage:'economy',label:LABEL.economy,edgeToNext:{text:EDGE.economy},nodes:[
   {kind:'observed',id:'us_cpi_yoy',seriesId:'US_CPI_YOY'},{kind:'observed',id:'us_unrate',seriesId:'US_UNRATE'},
   {kind:'observed',id:'us_ppi_fd_yoy',seriesId:'US_PPI_FD_YOY'},{kind:'observed',id:'us_ism_pmi',seriesId:'US_ISM_PMI'}]},
  {stage:'policy',label:LABEL.policy,edgeToNext:{text:EDGE.policy},nodes:[{kind:'observed',id:'us_dff',seriesId:'US_DFF'}]},
  {stage:'liquidity',label:LABEL.liquidity,edgeToNext:{text:EDGE.liquidity},nodes:[
   {kind:'not_in_catalog',id:'us_rrp_tga',label:{zh:'隔夜逆回购（RRP）与财政部一般账户（TGA）',en:'Overnight reverse repo (RRP) and Treasury General Account (TGA)'},
    reason:{zh:'目录尚未增补 RRPONTSYD / WTREGEN（owner 事项 A）',en:'RRPONTSYD / WTREGEN not yet added to the catalog (owner item A)'}}]},
  {stage:'rates',label:LABEL.rates,edgeToNext:{text:EDGE.rates},nodes:[
   {kind:'observed',id:'us_dgs10',seriesId:'US_DGS10'},{kind:'observed',id:'us_dtwexbgs',seriesId:'US_DTWEXBGS'},SPREAD]},
  {stage:'risk',label:LABEL.risk,edgeToNext:{text:EDGE.risk},nodes:[
   {kind:'observed',id:'us_vix',seriesId:'US_VIX'},
   {kind:'not_in_catalog',id:'us_credit_spread',label:{zh:'信用利差',en:'Credit spread'},reason:{zh:'目录没有已确认权利的信用利差序列',en:'No credit spread series with confirmed rights in the catalog'}}]},
  {stage:'assets',label:LABEL.assets,edgeToNext:null,nodes:[
   {kind:'observed',id:'us_wti',seriesId:'US_WTI'},{kind:'observed',id:'us_sp500',seriesId:'US_SP500'},{kind:'observed',id:'cn_csi300',seriesId:'CN_CSI300'}]},
 ],
 CN:[
  {stage:'economy',label:LABEL.economy,edgeToNext:{text:EDGE.economy},nodes:[
   {kind:'observed',id:'cn_pmi_mfg',seriesId:'CN_PMI_MFG'},{kind:'observed',id:'cn_cpi_yoy',seriesId:'CN_CPI_YOY'},{kind:'observed',id:'cn_ppi_yoy',seriesId:'CN_PPI_YOY'},
   {kind:'observed',id:'cn_gdp_yoy',seriesId:'CN_GDP_YOY'},{kind:'observed',id:'cn_export_yoy',seriesId:'CN_EXPORT_YOY'}]},
  {stage:'policy',label:LABEL.policy,edgeToNext:{text:EDGE.policy},nodes:[
   {kind:'observed',id:'cn_lpr_1y',seriesId:'CN_LPR_1Y'},{kind:'observed',id:'cn_mlf_1y',seriesId:'CN_MLF_1Y'}]},
  {stage:'liquidity',label:LABEL.liquidity,edgeToNext:{text:EDGE.liquidity},nodes:[
   {kind:'observed',id:'cn_m2_yoy',seriesId:'CN_M2_YOY'},{kind:'observed',id:'cn_afre_stock_yoy',seriesId:'CN_AFRE_STOCK_YOY'}]},
  {stage:'rates',label:LABEL.rates,edgeToNext:{text:EDGE.rates},nodes:[
   {kind:'observed',id:'cn_cgb_10y',seriesId:'CN_CGB_10Y'},{kind:'observed',id:'cn_usdcny_cp',seriesId:'CN_USDCNY_CP'},SPREAD]},
  {stage:'risk',label:LABEL.risk,edgeToNext:{text:EDGE.risk},nodes:[
   {kind:'not_in_catalog',id:'cn_risk_appetite',label:{zh:'中国风险偏好指标',en:'China risk-appetite gauge'},reason:{zh:'目录没有中国风险偏好序列',en:'No China risk-appetite series in the catalog'}}]},
  {stage:'assets',label:LABEL.assets,edgeToNext:null,nodes:[
   {kind:'observed',id:'cn_cgb10y_asset',seriesId:'CN_CGB10Y'},{kind:'observed',id:'cn_csi300',seriesId:'CN_CSI300'}]},
 ],
};
