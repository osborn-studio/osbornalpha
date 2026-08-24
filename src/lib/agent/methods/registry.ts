import type { AgentMethod } from './john-cameron-5step';
import { JOHN_CAMERON_5STEP } from './john-cameron-5step';
import { HIPHON_PM_DEEPDIVE } from './hiphon-pm-deepdive';
import { BOTTLENECK_PICKER } from './bottleneck-picker';
import { INDUSTRY_CHAIN } from './industry-chain';
import { COMPANY_DILIGENCE } from './company-diligence';

/** Executable AgentMethods keyed by id — resolved by the copilot route from methodId. */
export const AGENT_METHODS: Record<string, AgentMethod> = {
  [JOHN_CAMERON_5STEP.id]: JOHN_CAMERON_5STEP,
  [HIPHON_PM_DEEPDIVE.id]: HIPHON_PM_DEEPDIVE,
  [COMPANY_DILIGENCE.id]: COMPANY_DILIGENCE,
  [BOTTLENECK_PICKER.id]: BOTTLENECK_PICKER,
  [INDUSTRY_CHAIN.id]: INDUSTRY_CHAIN,
};

/** An executable analysis workflow surfaced in the Skill Hub. */
export interface SkillMethod {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Where running this method takes the user. */
  href: string;
}

export const METHODS: SkillMethod[] = [
  {
    id: JOHN_CAMERON_5STEP.id,
    name: JOHN_CAMERON_5STEP.name,
    description: JOHN_CAMERON_5STEP.description,
    icon: '🎩',
    href: '/copilot',
  },
  {
    id: HIPHON_PM_DEEPDIVE.id,
    name: HIPHON_PM_DEEPDIVE.name,
    description: HIPHON_PM_DEEPDIVE.description,
    icon: '🔬',
    href: '/copilot?method=hiphon-pm-deepdive',
  },
  {
    id: COMPANY_DILIGENCE.id,
    name: COMPANY_DILIGENCE.name,
    description: COMPANY_DILIGENCE.description,
    icon: '🏢',
    href: '/copilot?method=company-diligence',
  },
  {
    id: 'dcf-valuation',
    name: 'DCF 估值',
    description: '组合式现金流折现：4 个变体 + 每股区间 + WACC×g 敏感性。可单独运行，也由 Copilot 调用。',
    icon: '🧮',
    href: '/copilot',
  },
  {
    id: BOTTLENECK_PICKER.id,
    name: BOTTLENECK_PICKER.name,
    description: BOTTLENECK_PICKER.description,
    icon: '🔭',
    href: '/intel',
  },
  {
    id: INDUSTRY_CHAIN.id,
    name: INDUSTRY_CHAIN.name,
    description: INDUSTRY_CHAIN.description,
    icon: '🕸',
    href: '/intel',
  },
];
