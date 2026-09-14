/**
 * Root data-provider mount policy.
 *
 * Expo Router keeps nested layouts (e.g. `app/(app)/_layout.tsx`) mounted
 * across route transitions. Gating `AuthProvider` / `LocalDbProvider` /
 * `SyncProvider` on pathname therefore unmounts the provider while
 * `useAuth()` consumers remain in the tree — the
 * "useAuth must be used within <AuthProvider>" crash.
 *
 * Invariant: these providers mount once at the root and stay mounted for
 * public routes, authenticated routes, redirects, language changes,
 * loading/error states, and navigation transitions. Route *content* may
 * change; the provider instance must not.
 *
 * `SubscriptionProvider` follows the same rule: it mounts once after
 * `AuthProvider` (uid binding) and must not be pathname-gated.
 */

export interface RootDataProvidersDecision {
  mountLocalDb: boolean;
  mountAuth: boolean;
  mountSync: boolean;
  mountAppFeedback: boolean;
  mountSubscription: boolean;
}

const ALWAYS: RootDataProvidersDecision = {
  mountLocalDb: true,
  mountAuth: true,
  mountSync: true,
  mountAppFeedback: true,
  mountSubscription: true,
};

/**
 * Decide which root data providers to mount.
 * `pathname` is accepted only so call sites cannot accidentally invent a
 * path-gated branch — it must never affect the result.
 */
export function decideRootDataProviders(_pathname?: string): RootDataProvidersDecision {
  return ALWAYS;
}

/** Paths that previously incorrectly skipped Auth — used in regression tests. */
export const FORMERLY_PROVIDER_SKIPPED_PATHS = [
  "/landing",
  "/landing/download",
  "/legal",
  "/legal/privacy",
] as const;
