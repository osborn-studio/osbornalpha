// Values shared by the judgment route and client consumers. Keep runtime imports out of this module.
import type {JudgmentType} from './types';

export const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const JUDGMENT_TYPES:readonly JudgmentType[]=['macro_regime','macro_regime_asset_pair','recommendation_call','industry_lifecycle_stage','industry_prosperity','valuation_verdict','thesis_win_rate','return_range','sellside_rating','sellside_target_price','synthetic_fact_metric'];
