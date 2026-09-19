/**
 * Fail-closed reconciliation flags. Enabling a client flag is not backend
 * completion. Defaults are closed.
 */

export function isBillingReconciliationEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.BILLING_RECONCILIATION_ENABLED === "true";
}

export function isBillingReconciliationOperatorEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.BILLING_RECONCILIATION_OPERATOR_ENABLED === "true";
}

export function isUpdateBillingDetailsEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.UPDATE_BILLING_DETAILS_ENABLED === "true";
}
