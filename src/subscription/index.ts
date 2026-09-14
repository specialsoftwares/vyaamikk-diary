export {
  DEFAULT_CLIENT_SUBSCRIPTION,
  PLAN_MONTHLY_RECORD_LIMITS,
  TRIAL_PLAN,
  UNLIMITED_RECORDS,
} from "./types";
export type {
  BillingLifecycleStatus,
  BillingPlatform,
  ClientSubscriptionStatus,
  EntitlementReason,
  SubscriptionSource,
  VyaamikkPlan,
} from "./types";

export {
  effectivePlanForSubscription,
  featuresForPlan,
  featuresForSubscription,
  hasSubscriptionFeature,
  subscriptionPlanRank,
  SUBSCRIPTION_PLAN_RANK,
} from "./subscriptionFeatures";
export type { SubscriptionFeatureFlag, SubscriptionFeatures } from "./subscriptionFeatures";

export { parseSubscriptionStatus } from "./parseSubscriptionStatus";

export {
  SUBSCRIPTION_CACHE_KEY,
  SUBSCRIPTION_CACHE_VERSION,
  readSubscriptionCache,
  writeSubscriptionCache,
  clearSubscriptionCache,
} from "./subscriptionCache";

export {
  bindSubscriptionViewToAuth,
  activeAuthUid,
} from "./subscriptionViewBinding";

export { SubscriptionProvider, useSubscription } from "./SubscriptionProvider";
export type { UseSubscriptionResult } from "./SubscriptionProvider";
