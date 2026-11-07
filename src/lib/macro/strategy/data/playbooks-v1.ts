// src/lib/macro/strategy/data/playbooks-v1.ts
// Playbook library v1 (spec 2026-11-07 §5.2, macro-playbooks/1): a static hypothesis framework, not a judgment.
// Triggers are NOT defined here — they are the P1 rules projection (playbooks.ts::playbookTriggers). Mechanism chains and
// allocation implications are untested assumptions (F4 macro_regime_asset_pair is not implemented). watch ⊂ catalog ids.
import type {PlaybookDef} from '../playbooks';
/** Rendered under every card's implications (spec §7.5): untested, and F4 macro_regime_asset_pair is not implemented. */
export const PLAYBOOK_DISCLAIMER_V1={zh:'配置含义是假设，未经检验；F4 的象限资产含义检验（macro_regime_asset_pair）尚未实现',en:'Allocation implications are assumptions and untested; F4 asset-implication testing (macro_regime_asset_pair) is not implemented'};
export const PLAYBOOKS_V1:readonly PlaybookDef[]=[
 {regime:'recovery',title:{zh:'复苏',en:'Recovery'},
  mechanism:[{zh:'增长回升而通胀仍低（假设）',en:'Growth picks up while inflation stays low (assumption)'},{zh:'政策保持宽松，信用逐步扩张（假设）',en:'Policy stays accommodative and credit expands gradually (assumption)'}],
  implications:{favored:[{zh:'权益类资产',en:'Equities'},{zh:'周期性行业',en:'Cyclical sectors'}],disfavored:[{zh:'长久期债券',en:'Long-duration bonds'}]},
  watch:['US_CPI_YOY','US_UNRATE','US_DGS10','CN_PMI_MFG','CN_CPI_YOY','CN_M2_YOY']},
 {regime:'overheat',title:{zh:'过热',en:'Overheat'},
  mechanism:[{zh:'增长强劲且通胀上行（假设）',en:'Strong growth with rising inflation (assumption)'},{zh:'政策转向收紧，利率上行（假设）',en:'Policy turns tighter and rates rise (assumption)'}],
  implications:{favored:[{zh:'大宗商品',en:'Commodities'}],disfavored:[{zh:'债券',en:'Bonds'}]},
  watch:['US_CPI_YOY','US_PPI_FD_YOY','US_DFF','US_WTI','CN_PPI_YOY','CN_CGB_10Y']},
 {regime:'stagflation',title:{zh:'滞胀',en:'Stagflation'},
  mechanism:[{zh:'增长放缓而通胀仍高（假设）',en:'Growth slows while inflation stays high (assumption)'},{zh:'政策两难，实际收入受压（假设）',en:'Policy faces a trade-off and real incomes are squeezed (assumption)'}],
  implications:{favored:[{zh:'现金与短久期资产',en:'Cash and short-duration assets'}],disfavored:[{zh:'权益类资产',en:'Equities'}]},
  watch:['US_CPI_YOY','US_UNRATE','US_WTI','CN_CPI_YOY','CN_PMI_MFG']},
 {regime:'recession',title:{zh:'衰退',en:'Recession'},
  mechanism:[{zh:'增长与通胀同时回落（假设）',en:'Growth and inflation both fall (assumption)'},{zh:'政策转向宽松，利率下行（假设）',en:'Policy eases and rates fall (assumption)'}],
  implications:{favored:[{zh:'长久期债券',en:'Long-duration bonds'}],disfavored:[{zh:'大宗商品',en:'Commodities'},{zh:'周期性行业',en:'Cyclical sectors'}]},
  watch:['US_UNRATE','US_DGS10','US_DTWEXBGS','CN_PMI_MFG','CN_CGB_10Y','CN_USDCNY_CP']},
];
