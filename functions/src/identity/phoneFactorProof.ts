import { createHash } from "node:crypto";

import { getAdminAuth } from "../admin";

/** A phone sign-in older than this is not fresh proof of the factor. */
export const PHONE_PROOF_FRESH_MS = 5 * 60 * 1000;

export const PHONE_FACTOR_PROOFS = "phoneFactorProofs";

export type PhoneProofPurpose = "current_phone_reauth" | "replacement_phone";

export type PhoneProofClaims = {
  uid: string;
  phoneNumber: string | null;
  authTimeSeconds: number | null;
  signInProvider: string | null;
  projectId: string | null;
};

export type PhoneProofDecision =
  | { ok: true; proofId: string; phoneE164: string; authUid: string; authTimeMs: number }
  | {
      ok: false;
      reason: "forged" | "not_phone" | "wrong_phone" | "wrong_account" | "wrong_project" | "expired" | "replay";
    };

export function phoneProofProjectId(): string {
  return (
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    ""
  );
}

export function phoneProofId(input: {
  projectId: string;
  authUid: string;
  phoneE164: string;
  authTimeSeconds: number;
  purpose: PhoneProofPurpose;
}): string {
  return createHash("sha256")
    .update(
      [input.projectId, input.authUid, input.phoneE164, String(input.authTimeSeconds), input.purpose].join("|"),
      "utf8"
    )
    .digest("hex");
}

/**
 * Decide a phone factor from verified token claims.
 * A client clock and an ordinary existing login are not inputs.
 * Current-phone reauthentication must be the same account.
 * Replacement-phone proof must be the new number, which may belong to a different Auth user.
 */
export function assessPhoneProof(input: {
  claims: PhoneProofClaims | null;
  purpose: PhoneProofPurpose;
  accountUid: string;
  expectedPhoneE164: string;
  nowMs: number;
  projectId: string;
  alreadyConsumed: boolean;
}): PhoneProofDecision {
  const claims = input.claims;
  if (!claims?.uid || !claims.phoneNumber || claims.authTimeSeconds == null || !input.projectId) {
    return { ok: false, reason: "forged" };
  }
  if (claims.projectId !== input.projectId) return { ok: false, reason: "wrong_project" };
  if (claims.signInProvider !== "phone") return { ok: false, reason: "not_phone" };
  if (claims.phoneNumber !== input.expectedPhoneE164) return { ok: false, reason: "wrong_phone" };
  if (input.purpose === "current_phone_reauth" && claims.uid !== input.accountUid) {
    return { ok: false, reason: "wrong_account" };
  }
  const authTimeMs = claims.authTimeSeconds * 1000;
  if (authTimeMs > input.nowMs + 60_000 || input.nowMs - authTimeMs > PHONE_PROOF_FRESH_MS) {
    return { ok: false, reason: "expired" };
  }
  const proofId = phoneProofId({
    projectId: input.projectId,
    authUid: claims.uid,
    phoneE164: claims.phoneNumber,
    authTimeSeconds: claims.authTimeSeconds,
    purpose: input.purpose,
  });
  if (input.alreadyConsumed) return { ok: false, reason: "replay" };
  return {
    ok: true,
    proofId,
    phoneE164: claims.phoneNumber,
    authUid: claims.uid,
    authTimeMs,
  };
}

type PhoneProofReader = (idToken: string) => Promise<PhoneProofClaims | null>;

async function verifyIdTokenClaims(idToken: string): Promise<PhoneProofClaims | null> {
  if (!idToken.trim()) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    const firebase = decoded.firebase as { sign_in_provider?: string } | undefined;
    const projectId = typeof decoded.aud === "string" ? decoded.aud : null;
    return {
      uid: decoded.uid,
      phoneNumber: typeof decoded.phone_number === "string" ? decoded.phone_number : null,
      authTimeSeconds: typeof decoded.auth_time === "number" ? decoded.auth_time : null,
      signInProvider: firebase?.sign_in_provider ?? null,
      projectId,
    };
  } catch {
    return null;
  }
}

let reader: PhoneProofReader = verifyIdTokenClaims;

/** Test seam. Production verifies the Firebase ID token with the Admin SDK. */
export function __setPhoneProofReaderForTests(next: PhoneProofReader | null): void {
  reader = next ?? verifyIdTokenClaims;
}

export function readPhoneProofClaims(idToken: string): Promise<PhoneProofClaims | null> {
  return reader(idToken);
}
