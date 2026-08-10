/**
 * Shared vertical composition for auth actions + verifying/verified.
 * Flex weights — not pixel offsets — so the cluster sits in the lower-middle
 * (~60–70% on a typical phone) and compresses safely with keyboard / font scale.
 */
/** Remaining-space weights. Combined with typical top form, cluster centers ~60–70% down. */
export const AUTH_ACTION_ZONE_ABOVE = 1.2;
export const AUTH_ACTION_ZONE_BELOW = 1.05;

/** Width of the compact action cluster relative to the content column. */
export const AUTH_ACTION_CLUSTER_WIDTH = "82%" as const;
export const AUTH_ACTION_CLUSTER_MAX_WIDTH = 360;

export function authActionZoneAboveShare(): number {
  return AUTH_ACTION_ZONE_ABOVE / (AUTH_ACTION_ZONE_ABOVE + AUTH_ACTION_ZONE_BELOW);
}
