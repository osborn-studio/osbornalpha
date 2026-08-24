import type { SecurityUniverse } from '../model';

export interface SecurityScopeThreshold {
  minimum: number;
  maximum?: number;
  relativeMinimum: number;
  maximumMembershipChurn: number;
  maximumIdentityDeactivation: number;
}

export const SECURITY_SCOPE_THRESHOLDS: Record<SecurityUniverse, SecurityScopeThreshold> = {
  a_stock: { minimum: 5000, relativeMinimum: 0.8, maximumMembershipChurn: 0.05, maximumIdentityDeactivation: 0.05 },
  a_exchange_fund: { minimum: 1800, relativeMinimum: 0.8, maximumMembershipChurn: 0.05, maximumIdentityDeactivation: 0.05 },
  a_cb: { minimum: 300, relativeMinimum: 0.8, maximumMembershipChurn: 0.05, maximumIdentityDeactivation: 0.05 },
  hk_main: { minimum: 2200, relativeMinimum: 0.8, maximumMembershipChurn: 0.05, maximumIdentityDeactivation: 0.05 },
  sp500: { minimum: 490, maximum: 510, relativeMinimum: 0.8, maximumMembershipChurn: 0.05, maximumIdentityDeactivation: 0.05 },
  nasdaq_top500: { minimum: 500, maximum: 500, relativeMinimum: 0.8, maximumMembershipChurn: 0.15, maximumIdentityDeactivation: 0.05 },
  us_china: { minimum: 200, relativeMinimum: 0.8, maximumMembershipChurn: 0.05, maximumIdentityDeactivation: 0.05 },
};
