import { JOHN_CAMERON_5STEP } from './john-cameron-5step';

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
    id: 'dcf-valuation',
    name: 'DCF 估值',
    description: '组合式现金流折现：4 个变体 + 每股区间 + WACC×g 敏感性。可单独运行，也由 Copilot 调用。',
    icon: '🧮',
    href: '/copilot',
  },
];
