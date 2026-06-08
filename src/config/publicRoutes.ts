/**
 * Routes that must render without LocalDb / Auth / Sync providers.
 * Used for public marketing and legal viewer pages on web.
 */
export function isPublicLightweightRoute(pathname: string): boolean {
  const path = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  if (path === "/landing" || path.startsWith("/landing/")) return true;
  if (path === "/legal" || path.startsWith("/legal/")) return true;
  return false;
}
