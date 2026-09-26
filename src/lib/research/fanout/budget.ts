/** WP-A6 daily budget (§6.2: ~$0.08/day expected, $5/day hard stop). */
import { fail } from '../ingest/pa-v1/json.js';

export const DEFAULT_DAILY_BUDGET_MICROS = 5_000_000;
export const DEFAULT_JEV_MICROS_PER_1K = 45;
export const DEFAULT_DEEPSEEK_MICROS_PER_1K = 280;

export interface BudgetConfig { daily_budget_micros: number; jev_micros_per_1k: number; deepseek_micros_per_1k: number }
export interface BudgetState { spent_micros: number; limit_micros: number; remaining_micros: number; stopped: boolean }

export function budgetState(spent: number, limit: number): BudgetState {
  const remaining = Math.max(0, limit - spent);
  return { spent_micros: spent, limit_micros: limit, remaining_micros: remaining, stopped: spent >= limit };
}

function envInt(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d{1,12}$/.test(raw.trim())) fail('invalid_schema');
  return Number(raw.trim());
}

export function readBudgetConfig(env: Record<string, string | undefined> = process.env): BudgetConfig {
  return {
    daily_budget_micros: envInt(env, 'FANOUT_DAILY_BUDGET_MICROS', DEFAULT_DAILY_BUDGET_MICROS),
    jev_micros_per_1k: envInt(env, 'FANOUT_JEV_MICROS_PER_1K_TOKENS', DEFAULT_JEV_MICROS_PER_1K),
    deepseek_micros_per_1k: envInt(env, 'FANOUT_DEEPSEEK_MICROS_PER_1K_TOKENS', DEFAULT_DEEPSEEK_MICROS_PER_1K),
  };
}
