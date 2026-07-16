/**
 * Public marketing / legal route classification (layout chrome, splash, etc.).
 *
 * IMPORTANT: This must NOT gate root Auth / LocalDb / Sync providers.
 * Expo Router keeps authenticated layouts mounted across transitions; skipping
 * AuthProvider on these paths caused `useAuth must be used within <AuthProvider>`.
 * See `decideRootDataProviders` in `rootDataProviders.ts`.
 */
export function isPublicLightweightRoute(pathname: string): boolean {
  const path = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  if (path === "/landing" || path.startsWith("/landing/")) return true;
  if (path === "/legal" || path.startsWith("/legal/")) return true;
  return false;
}
