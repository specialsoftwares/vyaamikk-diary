import { HttpsError, onCall } from "firebase-functions/v2/https";
import { randomBytes } from "node:crypto";

import { getAdminDb } from "../admin";

const PENDING_COLLECTION = "pendingEmailVerifications";
const EMAIL_INDEX = "emailIndex";
const USERS = "users";
const PENDING_TTL_MS = 20 * 60 * 1000;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function hashEmail(normalized: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Start email verification — creates pending record; does not claim emailIndex yet.
 * Email provider (SendGrid, etc.) is not wired — returns verificationId for future use.
 */
export const startEmailVerification = onCall({ region: "asia-south1" }, async (request) => {
  const authUid = request.auth?.uid;
  if (!authUid) throw new HttpsError("unauthenticated", "Sign in first.");

  const rawEmail = request.data?.email;
  if (typeof rawEmail !== "string" || !rawEmail.includes("@")) {
    throw new HttpsError("invalid-argument", "A valid email is required.");
  }

  const normalized = normalizeEmail(rawEmail);
  const emailHash = hashEmail(normalized);
  const db = getAdminDb();

  const indexSnap = await db.collection(EMAIL_INDEX).doc(emailHash).get();
  if (indexSnap.exists) {
    const entry = indexSnap.data() as { userId?: string; emailStatus?: string; status?: string };
    if (entry.userId !== authUid && entry.emailStatus === "verified" && entry.status === "active") {
      throw new HttpsError(
        "failed-precondition",
        "This email is already linked to another account."
      );
    }
  }

  const verificationId = randomBytes(16).toString("hex");
  const now = Date.now();
  await db.collection(PENDING_COLLECTION).doc(verificationId).set({
    verificationId,
    userId: authUid,
    normalizedEmail: normalized,
    emailHash,
    createdAt: now,
    expiresAt: now + PENDING_TTL_MS,
    status: "pending",
    /** Dev placeholder — replace with provider-sent code hash in production. */
    devCode: process.env.FUNCTIONS_EMULATOR === "true" ? "000000" : null,
  });

  return {
    sent: false,
    verificationId,
    message:
      "Email verification provider is not configured. Email remains unverified until verifyAndBindEmail is completed.",
  };
});

/**
 * Verify and bind email — claims emailIndex transactionally.
 * Until an email provider is wired, accepts dev code 000000 in emulator only.
 */
export const verifyAndBindEmail = onCall({ region: "asia-south1" }, async (request) => {
  const authUid = request.auth?.uid;
  if (!authUid) throw new HttpsError("unauthenticated", "Sign in first.");

  const verificationId = request.data?.verificationId;
  const code = request.data?.code;
  if (typeof verificationId !== "string" || typeof code !== "string") {
    throw new HttpsError("invalid-argument", "verificationId and code are required.");
  }

  const db = getAdminDb();
  const pendingRef = db.collection(PENDING_COLLECTION).doc(verificationId);

  const profile = await db.runTransaction(async (tx) => {
    const pendingSnap = await tx.get(pendingRef);
    if (!pendingSnap.exists) {
      throw new HttpsError("not-found", "Verification expired or not found.");
    }
    const pending = pendingSnap.data() as {
      userId: string;
      normalizedEmail: string;
      emailHash: string;
      expiresAt: number;
      devCode?: string | null;
    };

    if (pending.userId !== authUid) {
      throw new HttpsError("permission-denied", "Verification does not belong to this account.");
    }
    if (pending.expiresAt < Date.now()) {
      tx.delete(pendingRef);
      throw new HttpsError("deadline-exceeded", "Verification expired.");
    }

    const emulatorOk =
      process.env.FUNCTIONS_EMULATOR === "true" && code.trim() === (pending.devCode ?? "000000");
    if (!emulatorOk) {
      throw new HttpsError(
        "failed-precondition",
        "Email verification provider is not configured."
      );
    }

    const emailIndexRef = db.collection(EMAIL_INDEX).doc(pending.emailHash);
    const indexSnap = await tx.get(emailIndexRef);
    if (indexSnap.exists) {
      const entry = indexSnap.data() as { userId?: string; emailStatus?: string };
      if (entry.userId !== authUid && entry.emailStatus === "verified") {
        throw new HttpsError("failed-precondition", "Email already linked elsewhere.");
      }
    }

    const userRef = db.collection(USERS).doc(authUid);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "User profile not found.");

    const now = Date.now();
    const user = userSnap.data() as Record<string, unknown>;
    const ueid = String(user.ueid ?? "");

    tx.set(emailIndexRef, {
      emailHash: pending.emailHash,
      userId: authUid,
      ueid,
      status: "active",
      emailStatus: "verified",
      linkedAt: now,
      verifiedAt: now,
    });

    const updated = {
      ...user,
      businessEmail: pending.normalizedEmail,
      normalizedEmail: pending.normalizedEmail,
      emailHash: pending.emailHash,
      emailStatus: "verified",
      emailLinkedAt: now,
      emailVerifiedAt: now,
      updatedAt: now,
    };
    tx.update(userRef, {
      businessEmail: pending.normalizedEmail,
      normalizedEmail: pending.normalizedEmail,
      emailHash: pending.emailHash,
      emailStatus: "verified",
      emailLinkedAt: now,
      emailVerifiedAt: now,
      updatedAt: now,
    });
    tx.delete(pendingRef);
    return { uid: authUid, ...updated };
  });

  return { profile };
});

export const changeVerifiedEmail = verifyAndBindEmail;
