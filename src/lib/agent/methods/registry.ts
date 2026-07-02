import type { AgentMethod } from './john-cameron-5step';
import { JOHN_CAMERON_5STEP } from './john-cameron-5step';
import { HIPHON_PM_DEEPDIVE } from './hiphon-pm-deepdive';

/** Executable AgentMethods keyed by id — resolved by the copilot route from methodId. */
export const AGENT_METHODS: Record<string, AgentMethod> = {
  [JOHN_CAMERON_5STEP.id]: JOHN_CAMERON_5STEP,
  [HIPHON_PM_DEEPDIVE.id]: HIPHON_PM_DEEPDIVE,
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
    id: 'dcf-valuation',
    name: 'DCF 估值',
    description: '组合式现金流折现：4 个变体 + 每股区间 + WACC×g 敏感性。可单独运行，也由 Copilot 调用。',
    icon: '🧮',
    href: '/copilot',
  },
];
