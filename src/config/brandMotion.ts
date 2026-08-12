/** Deep indigo — matches auth curtain / language switch / boot surfaces. */
export const BRAND_SURFACE = "#1E1B4B";

/** Ledger gold accent — matches brand mark rule line. */
export const BRAND_GOLD = "#C9A84C";

/**
 * Full boot choreography length (Acts 1–5) when the user is still waiting on
 * boot readiness / route resolution. Not a mandatory hold for already-ready users.
 */
export const BOOT_ANIMATION_MS = 3600;

/**
 * Minimum brand reveal before BootAnimationGate may release a ready user.
 * Ready users are not forced to wait for BOOT_ANIMATION_MS.
 */
export const BOOT_BRAND_MIN_MS = 1000;

/** Fade boot overlay to black before route reveal. */
export const BOOT_EXIT_BLACK_MS = 200;

/** Fade resolved app in from black. */
export const BOOT_REVEAL_MS = 200;

/** Reduced-motion condensed sequence / brand minimum. */
export const BOOT_REDUCED_MOTION_MS = 900;

/**
 * Pure entry gate: brand minimum + authoritative boot/route readiness.
 * Animation completion is not required once the brand minimum has elapsed.
 */
export function canReleaseBootToApp(args: {
  brandMinElapsed: boolean;
  bootReady: boolean;
  routeResolved: boolean;
  bootError: boolean;
}): boolean {
  if (args.bootError) return false;
  return args.brandMinElapsed && args.bootReady && args.routeResolved;
}
