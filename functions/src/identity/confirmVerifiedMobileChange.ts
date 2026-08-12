/**
 * Authenticated verified-mobile contact change (account-level).
 *
 * Preflight: collision + quarantine check BEFORE native Auth update.
 * Confirm: requires Auth phone claim == B; atomically updates phoneIndex + profile.
 *
 * Split-brain recovery: if Auth already B and profile still A, confirm is idempotent
 * and completes the bind. Client persists local pending until confirm succeeds.
 *
 * Source architecture — deploy separately after native real-OTP validation.
 */

import { randomBytes } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { getAdminDb } from "../admin";
import {
  assertMobileNotQuarantined,
  applyDeferredMobileQuarantineRelease,
  sha256MobileHash,
  startMobileQuarantine,
} from "./mobileQuarantine";
import { normalizePhoneE164 } from "./shared";

const USERS = "users";
const PHONE_INDEX = "phoneIndex";

function phonesMatch(a: string, b: string): boolean {
  return normalizePhoneE164(a) === normalizePhoneE164(b);
}

function newOperationId(): string {
  return `mchg_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export async function preflightVerifiedMobileContactChangeTx(
  tx: Transaction,
  args: {
    uid: string;
    newerPhoneE164: string;
    now: number;
    operationId: string;
  }
): Promise<{
  ok: true;
  operationId: string;
  noop: boolean;
  ueid: string;
  currentPhoneE164: string;
}> {
  const db = getAdminDb();
  const userRef = db.collection(USERS).doc(args.uid);
  const userSnap = await tx.get(userRef);
  if (!userSnap.exists) {
    throw new HttpsError("not-found", "Account not found.");
  }
  const user = userSnap.data() as Record<string, unknown>;
  const ueid = String(user.ueid ?? "");
  if (!ueid) {
    throw new HttpsError("failed-precondition", "Account is missing UEID.");
  }

  const newer = normalizePhoneE164(args.newerPhoneE164);
  const currentPhone = normalizePhoneE164(String(user.phoneE164 ?? ""));
  if (!newer) {
    throw new HttpsError("invalid-argument", "newerPhoneE164 is required.");
  }
  if (currentPhone && phonesMatch(currentPhone, newer)) {
    return {
      ok: true,
      operationId: args.operationId,
      noop: true,
      ueid,
      currentPhoneE164: currentPhone,
    };
  }

  const newerHash = sha256MobileHash(newer);
  await assertMobileNotQuarantined(tx, newerHash, args.now);

  const phoneIndexRef = db.collection(PHONE_INDEX).doc(newer);
  const phoneSnap = await tx.get(phoneIndexRef);
  if (phoneSnap.exists) {
    const owner = (phoneSnap.data() as { uid?: string }).uid;
    if (owner && owner !== args.uid) {
      throw new HttpsError(
        "already-exists",
        "This mobile number cannot be used for this account. Please use another number or contact support."
      );
    }
  }

  // Soft reservation marker on the user doc (not an authoritative phone).
  tx.update(userRef, {
    pendingMobileChange: {
      newerPhoneE164: newer,
      operationId: args.operationId,
      status: "preflight",
      reservedAt: args.now,
    },
    updatedAt: args.now,
  });

  return {
    ok: true,
    operationId: args.operationId,
    noop: false,
    ueid,
    currentPhoneE164: currentPhone,
  };
}

export async function confirmVerifiedMobileContactChangeTx(
  tx: Transaction,
  args: {
    uid: string;
    newerPhoneE164: string;
    authPhoneE164: string | null;
    now: number;
    operationId?: string;
    supportOverride?: boolean;
  }
): Promise<{
  uid: string;
  ueid: string;
  phoneE164: string;
  oldPhoneE164: string;
  alreadyComplete: boolean;
  profile: Record<string, unknown>;
}> {
  const db = getAdminDb();
  const userRef = db.collection(USERS).doc(args.uid);
  const userSnap = await tx.get(userRef);
  if (!userSnap.exists) {
    throw new HttpsError("not-found", "Account not found.");
  }
  const user = userSnap.data() as Record<string, unknown>;
  const ueid = String(user.ueid ?? "");
  if (!ueid) {
    throw new HttpsError("failed-precondition", "Account is missing UEID.");
  }

  const newer = normalizePhoneE164(args.newerPhoneE164);
  const oldPhoneRaw = String(user.phoneE164 ?? "");
  const oldPhone = oldPhoneRaw ? normalizePhoneE164(oldPhoneRaw) : "";
  if (!newer) {
    throw new HttpsError("invalid-argument", "newerPhoneE164 is required.");
  }

  // Idempotent success: already bound to B.
  if (oldPhone && phonesMatch(oldPhone, newer)) {
    const profile = { ...user, uid: args.uid, phoneE164: newer, ueid };
    tx.update(userRef, {
      pendingMobileChange: null,
      updatedAt: args.now,
    });
    return {
      uid: args.uid,
      ueid,
      phoneE164: newer,
      oldPhoneE164: oldPhone,
      alreadyComplete: true,
      profile,
    };
  }

  if (!args.supportOverride) {
    if (!args.authPhoneE164 || !phonesMatch(args.authPhoneE164, newer)) {
      throw new HttpsError(
        "failed-precondition",
        "Verified Auth phone must match the proposed mobile before bind."
      );
    }
  }

  const newerHash = sha256MobileHash(newer);
  const quarantine = await assertMobileNotQuarantined(tx, newerHash, args.now);

  const phoneIndexRef = db.collection(PHONE_INDEX).doc(newer);
  const phoneSnap = await tx.get(phoneIndexRef);
  if (phoneSnap.exists) {
    const owner = (phoneSnap.data() as { uid?: string }).uid;
    if (owner && owner !== args.uid) {
      throw new HttpsError(
        "already-exists",
        "This mobile number cannot be used for this account. Please use another number or contact support."
      );
    }
  }

  applyDeferredMobileQuarantineRelease(tx, newerHash, args.now, quarantine.releaseDue);

  if (oldPhone && !phonesMatch(oldPhone, newer)) {
    tx.delete(db.collection(PHONE_INDEX).doc(oldPhone));
    const oldHash = sha256MobileHash(oldPhone);
    startMobileQuarantine(tx, {
      mobileHash: oldHash,
      formerUid: args.uid,
      reason: "mobile_change",
      now: args.now,
    });
  }

  tx.set(phoneIndexRef, { uid: args.uid, phoneE164: newer, updatedAt: args.now });
  const nextProfile = {
    ...user,
    uid: args.uid,
    ueid,
    phoneE164: newer,
    mobileHash: newerHash,
    mobileChangedAt: args.now,
    mobileChangeCount: Number(user.mobileChangeCount ?? 0) + 1,
    pendingMobileChange: null,
    updatedAt: args.now,
  };
  tx.update(userRef, {
    phoneE164: newer,
    mobileHash: newerHash,
    mobileChangedAt: args.now,
    mobileChangeCount: Number(user.mobileChangeCount ?? 0) + 1,
    pendingMobileChange: null,
    updatedAt: args.now,
  });

  // Minimal security event — no OTP / full payloads.
  tx.set(userRef.collection("securityEvents").doc(), {
    type: "verified_mobile_contact_change",
    result: "success",
    operationId: args.operationId ?? null,
    createdAt: args.now,
    expireAt: args.now + 90 * 86_400_000,
  });

  return {
    uid: args.uid,
    ueid,
    phoneE164: newer,
    oldPhoneE164: oldPhone,
    alreadyComplete: false,
    profile: nextProfile,
  };
}

export const preflightVerifiedMobileContactChange = onCall(
  { region: "asia-south1" },
  async (request) => {
    const auth = request.auth;
    const authUid = auth?.uid;
    if (!authUid || !auth) {
      throw new HttpsError("unauthenticated", "Sign in first.");
    }
    const newerPhoneE164 = String(request.data?.newerPhoneE164 ?? "");
    const operationId =
      typeof request.data?.operationId === "string" && request.data.operationId
        ? String(request.data.operationId)
        : newOperationId();
    const now = Date.now();
    const db = getAdminDb();

    const result = await db.runTransaction(async (tx) =>
      preflightVerifiedMobileContactChangeTx(tx, {
        uid: authUid,
        newerPhoneE164,
        now,
        operationId,
      })
    );

    return {
      ok: true as const,
      operationId: result.operationId,
      noop: result.noop,
      ueid: result.ueid,
    };
  }
);

export const confirmVerifiedMobileContactChange = onCall(
  { region: "asia-south1" },
  async (request) => {
    const auth = request.auth;
    const authUid = auth?.uid;
    if (!authUid || !auth) {
      throw new HttpsError("unauthenticated", "Sign in first.");
    }
    const newerPhoneE164 = String(request.data?.newerPhoneE164 ?? "");
    const operationId =
      typeof request.data?.operationId === "string" ? String(request.data.operationId) : undefined;
    const authPhone =
      typeof auth.token.phone_number === "string" ? String(auth.token.phone_number) : null;
    const supportOverride = auth.token.support === true;
    const now = Date.now();
    const db = getAdminDb();

    const result = await db.runTransaction(async (tx) =>
      confirmVerifiedMobileContactChangeTx(tx, {
        uid: authUid,
        newerPhoneE164,
        authPhoneE164: authPhone,
        now,
        operationId,
        supportOverride,
      })
    );

    return {
      ok: true as const,
      uid: result.uid,
      ueid: result.ueid,
      phoneE164: result.phoneE164,
      alreadyComplete: result.alreadyComplete,
      profile: result.profile,
    };
  }
);
