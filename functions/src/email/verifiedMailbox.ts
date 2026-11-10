import { emailBindingKey } from "./emailBindingKey";
import { normalizeEmailStrict } from "./otpPolicy";

/**
 * Server-owned verified email binding.
 * A profile address the client can edit is not the recovery destination.
 * A mismatch is not repaired from that address.
 */
export type MailboxUser = {
  uid: string;
  emailStatus?: unknown;
  normalizedEmail?: unknown;
  emailHash?: unknown;
  emailBindingVersion?: unknown;
};

export type MailboxBinding = {
  uid?: unknown;
  normalizedEmail?: unknown;
  status?: unknown;
  bindingVersion?: unknown;
} | null;

export type MailboxResolution =
  | { ok: true; normalizedEmail: string; emailHash: string; bindingVersion: number }
  | { ok: false; outcome: "verification_required" | "support"; reason: string };

function normalizedOrEmpty(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    return normalizeEmailStrict(value);
  } catch {
    return "";
  }
}

export function resolveVerifiedMailbox(user: MailboxUser, binding: MailboxBinding): MailboxResolution {
  if (user.emailStatus !== "verified") {
    return { ok: false, outcome: "verification_required", reason: "not_verified" };
  }
  const version = user.emailBindingVersion;
  const hash = typeof user.emailHash === "string" ? user.emailHash : "";
  if (!binding || typeof version !== "number" || !Number.isFinite(version) || !hash) {
    return { ok: false, outcome: "support", reason: "binding_missing" };
  }
  const address = normalizedOrEmpty(binding.normalizedEmail);
  if (!address) return { ok: false, outcome: "support", reason: "binding_incomplete" };
  const addressHash = emailBindingKey(address);
  if (binding.uid !== user.uid) return { ok: false, outcome: "support", reason: "uid_mismatch" };
  if (binding.status !== "verified") return { ok: false, outcome: "support", reason: "status_mismatch" };
  if (addressHash !== hash) return { ok: false, outcome: "support", reason: "hash_mismatch" };
  if (Number(binding.bindingVersion) !== version) {
    return { ok: false, outcome: "support", reason: "version_mismatch" };
  }
  const profileAddress = normalizedOrEmpty(user.normalizedEmail);
  if (profileAddress && profileAddress !== address) {
    return { ok: false, outcome: "support", reason: "profile_mismatch" };
  }
  return { ok: true, normalizedEmail: address, emailHash: hash, bindingVersion: version };
}
