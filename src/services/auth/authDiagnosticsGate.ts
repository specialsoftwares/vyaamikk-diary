/**
 * Rich on-screen Phone Auth diagnostics (Copy diagnostics, Firebase codes).
 *
 * Production Play binaries keep this OFF unless the build explicitly sets
 * EXPO_PUBLIC_INTERNAL_AUTH_DIAGNOSTICS=1. Internal Testing uses production
 * app mode and must not leak debug panels by default.
 *
 * Development Metro (__DEV__) may show diagnostics when not in production mode.
 */
export function shouldShowAuthDiagnosticsInUi(): boolean {
  if (process.env.EXPO_PUBLIC_INTERNAL_AUTH_DIAGNOSTICS === "1") return true;
  if (process.env.EXPO_PUBLIC_APP_MODE === "production") return false;
  return typeof __DEV__ !== "undefined" && __DEV__ === true;
}
