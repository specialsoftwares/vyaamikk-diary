/** Production business writes use the server envelope when this is true. */
export const CONTENT_SEAL_WRITES_ENABLED = true;

export const CONTENT_SEAL_MEDIA_TYPE = "application/vnd.vyaamikk.content-seal+json";

/**
 * Readers keep opening envelopes that already exist.
 * This stays on when new seals are paused.
 */
export function shouldOpenContentSeals(backend: string): boolean {
  return backend === "firebase-production";
}

/**
 * Rollback switch for new envelopes only.
 * Shared-dev and local-mock stay plaintext so existing tests keep their fixtures.
 */
export function shouldCreateContentSeals(
  backend: string,
  writesEnabled = CONTENT_SEAL_WRITES_ENABLED
): boolean {
  return writesEnabled && shouldOpenContentSeals(backend);
}

/** @deprecated Use shouldCreateContentSeals. Reads use shouldOpenContentSeals. */
export function shouldSealProductionWrites(
  backend: string,
  writesEnabled = CONTENT_SEAL_WRITES_ENABLED
): boolean {
  return shouldCreateContentSeals(backend, writesEnabled);
}
