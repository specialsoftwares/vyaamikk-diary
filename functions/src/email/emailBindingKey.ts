import { createHash } from "node:crypto";

import { normalizeEmailStrict } from "./otpPolicy";

/** SHA-256 hex of normalized email — emailBindings / emailIndex document id. */
export function emailBindingKey(normalizedEmail: string): string {
  return createHash("sha256").update(normalizeEmailStrict(normalizedEmail), "utf8").digest("hex");
}
