/**
 * Phone eligibility for resolveOrCreateUserByPhone.
 *
 * Permanent invariant: a number is unavailable because it is assigned to a
 * Vyaamikk UEID (phoneIndex), not because it was entered, OTP-verified,
 * replaced during onboarding, or left in a recovery quarantine.
 *
 * Quarantine is a temporary recovery marker. It must not masquerade as
 * UEID ownership and must not block signup of an unassigned number.
 */

export type ResolverMobileDecision =
  | { kind: "login" }
  | { kind: "conflict" }
  | { kind: "signup"; releaseStaleQuarantine: boolean };

export function decideResolverMobileEligibility(args: {
  phoneIndexUid: string | null | undefined;
  authUid: string;
  quarantineBlocking: boolean;
}): ResolverMobileDecision {
  const owner = typeof args.phoneIndexUid === "string" ? args.phoneIndexUid.trim() : "";
  if (owner && owner === args.authUid) {
    return { kind: "login" };
  }
  if (owner && owner !== args.authUid) {
    return { kind: "conflict" };
  }
  return {
    kind: "signup",
    releaseStaleQuarantine: args.quarantineBlocking === true,
  };
}

/** Contact-change bind: quarantine never overrides phoneIndex uniqueness. */
export function shouldCancelQuarantineOnUnassignedBind(args: {
  phoneIndexOwnerUid: string | null | undefined;
  currentUid: string;
  quarantineBlocking: boolean;
}): boolean {
  if (!args.quarantineBlocking) return false;
  const owner = typeof args.phoneIndexOwnerUid === "string" ? args.phoneIndexOwnerUid.trim() : "";
  if (owner && owner !== args.currentUid) return false;
  return true;
}
