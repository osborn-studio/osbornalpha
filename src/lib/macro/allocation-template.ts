import type { Regime } from './judgment-contract';

export const ALLOCATION_TEMPLATE_VERSION = 'macro_allocation_template@v1';

/** Static illustrative values, independent of user holdings or trading. */
export const ALLOCATION_TEMPLATE: Record<Regime, {
  equity: number; bond: number; commodity: number; cash: number;
  tilt: { zh: string; en: string };
}> = {
  "recovery": {
    "equity": 60,
    "bond": 15,
    "commodity": 10,
    "cash": 15,
    "tilt": {
      "zh": "假设增长修复、通胀缓解，模板侧重股票。",
      "en": "Assuming improving growth and easing inflation, the template emphasizes equities."
    }
  },
  "overheat": {
    "equity": 25,
    "bond": 10,
    "commodity": 45,
    "cash": 20,
    "tilt": {
      "zh": "假设需求走强、价格压力上升，模板侧重商品。",
      "en": "Assuming stronger demand and rising price pressure, the template emphasizes commodities."
    }
  },
  "stagflation": {
    "equity": 15,
    "bond": 20,
    "commodity": 20,
    "cash": 45,
    "tilt": {
      "zh": "假设增长走弱、价格压力持续，模板侧重现金。",
      "en": "Assuming weaker growth and persistent price pressure, the template emphasizes cash."
    }
  },
  "recession": {
    "equity": 20,
    "bond": 55,
    "commodity": 5,
    "cash": 20,
    "tilt": {
      "zh": "假设增长与通胀同步回落，模板侧重债券。",
      "en": "Assuming growth and inflation both fall, the template emphasizes bonds."
    }
  }
};

export const ALLOCATION_SOURCE = {
  "zh": "来源：Merrill Lynch《Investment Clock》（Greetham & Hartnett，2004）：复苏对应股票、过热对应商品、滞胀对应现金、衰退对应债券表现最强的经典阶段映射。具体百分比为本产品自定的示意模板值，并非取自该文献。",
  "en": "Source: Merrill Lynch “Investment Clock” (Greetham & Hartnett, 2004): the classic strongest-class mapping is equities in recovery, commodities in overheat, cash in stagflation, and bonds in recession. The specific percentages are this product’s own illustrative template values, not from that publication."
};

export const ALLOCATION_LABELS = {
  "zh": {
    "framework": "假设框架",
    "untested": "未经检验",
    "disclaimer": "不构成投资建议"
  },
  "en": {
    "framework": "Assumed framework",
    "untested": "untested",
    "disclaimer": "not investment advice"
  }
};

const CLOCK_ORDER: readonly Regime[] = ['recovery', 'overheat', 'stagflation', 'recession'];
export function allocationRows() {
  return CLOCK_ORDER.map(regime => {
    const { tilt, ...weights } = ALLOCATION_TEMPLATE[regime];
    return { regime, weights, tilt };
  });
}
