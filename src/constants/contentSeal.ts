/** Production diary and attachment writes use the server envelope when this is true. */
export const CONTENT_SEAL_WRITES_ENABLED = true;

export const CONTENT_SEAL_MEDIA_TYPE = "application/vnd.vyaamikk.content-seal+json";

/**
 * Rollback switch for new writes. Readers still open envelopes that already exist.
 * Shared-dev and local-mock stay plaintext so existing tests keep their fixtures.
 */
export function shouldSealProductionWrites(
  backend: string,
  writesEnabled = CONTENT_SEAL_WRITES_ENABLED
): boolean {
  return writesEnabled && backend === "firebase-production";
}
