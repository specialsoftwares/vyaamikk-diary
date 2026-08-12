/**
 * Server-authoritative mobile quarantine (21 days).
 *
 * Doc IDs are always SHA-256(hex) of normalized E.164 — never raw mobile.
 * Collections: mobileBindings, mobileQuarantines, mobileSecurityEvents.
 */

import { createHash, randomBytes } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { Transaction } from "firebase-admin/firestore";

import { getAdminDb } from "../admin";
import { normalizePhoneE164 } from "./shared";

export const MOBILE_QUARANTINE_MS = 21 * 24 * 60 * 60 * 1000;

/** Neutral user-facing message — no quarantine/security details. */
export const MOBILE_QUARANTINE_USER_MESSAGE =
  "This mobile number is temporarily unavailable. Please try again later.";

export const MOBILE_BINDINGS = "mobileBindings";
export const MOBILE_QUARANTINES = "mobileQuarantines";
export const MOBILE_SECURITY_EVENTS = "mobileSecurityEvents";

export type MobileQuarantineStatus = "active" | "released" | "cancelled" | "absent";

export type MobileQuarantineReason =
  | "mobile_change"
  | "account_deletion"
  | "admin"
  | string;

export interface MobileQuarantineDoc {
  mobileHash: string;
  formerUid: string;
  reason: MobileQuarantineReason;
  status: "active" | "released" | "cancelled";
  startedAt: number;
  releaseAt: number;
  releasedAt: number | null;
  cancelledAt: number | null;
  reboundAt: number | null;
  reboundToUid: string | null;
}

export interface MobileBindingDoc {
  mobileHash: string;
  uid: string;
  boundAt: number;
  updatedAt: number;
}

export interface MobileSecurityEventDoc {
  eventId: string;
  type: string;
  mobileHash: string;
  relatedMobileHash?: string | null;
  formerUid?: string | null;
  uid?: string | null;
  createdAt: number;
  detail?: Record<string, unknown>;
}

/** SHA-256 hex of normalized E.164. Never use raw mobile as a Firestore doc ID. */
export function sha256MobileHash(phoneE164: string): string {
  const normalized = normalizePhoneE164(phoneE164);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function computeQuarantineReleaseAt(now: number): number {
  return now + MOBILE_QUARANTINE_MS;
}

export function quarantineStatusAt(
  doc: Pick<MobileQuarantineDoc, "status" | "releaseAt"> | null | undefined,
  now: number
): MobileQuarantineStatus {
  if (!doc) return "absent";
  if (doc.status === "cancelled") return "cancelled";
  if (doc.status === "released") return "released";
  if (doc.status === "active") {
    if (typeof doc.releaseAt === "number" && doc.releaseAt <= now) {
      return "released";
    }
    return "active";
  }
  return "absent";
}

export function isQuarantineBlocking(
  doc: Pick<MobileQuarantineDoc, "status" | "releaseAt"> | null | undefined,
  now: number
): boolean {
  return quarantineStatusAt(doc, now) === "active";
}

export type RebindRaceReason =
  | "already_rebound"
  | "quarantine_missing"
  | "quarantine_not_active"
  | "former_uid_mismatch"
  | null;

/**
 * Detect whether rebind should abort due to race / prior completion.
 * Returns null when rebind may proceed.
 */
export function detectRebindRace(input: {
  quarantine: MobileQuarantineDoc | null | undefined;
  expectedFormerUid: string;
  now: number;
}): RebindRaceReason {
  const { quarantine, expectedFormerUid, now } = input;
  if (!quarantine) return "quarantine_missing";
  if (quarantine.reboundAt != null || quarantine.status === "cancelled") {
    return "already_rebound";
  }
  if (quarantine.formerUid !== expectedFormerUid) return "former_uid_mismatch";
  const status = quarantineStatusAt(quarantine, now);
  if (status !== "active") return "quarantine_not_active";
  return null;
}

/** Approved atomic rebind outcome — newer number is never quarantined. */
export interface QuarantineRebindPlan {
  cancelOldQuarantine: true;
  bindOldNumberToOriginalUid: true;
  releaseNewerNumberImmediately: true;
  quarantineNewerNumber: false;
  writeAuditEvent: true;
}

export function planQuarantineRebind(): QuarantineRebindPlan {
  return {
    cancelOldQuarantine: true,
    bindOldNumberToOriginalUid: true,
    releaseNewerNumberImmediately: true,
    quarantineNewerNumber: false,
    writeAuditEvent: true,
  };
}

export function throwMobileQuarantined(): never {
  throw new HttpsError("failed-precondition", MOBILE_QUARANTINE_USER_MESSAGE);
}

export type MobileQuarantineCheck = {
  /** True when an expired-but-still-active quarantine row should be marked released. */
  releaseDue: boolean;
};

/**
 * READ-ONLY quarantine gate for use inside Firestore transactions.
 * Must not write: callers apply deferred release after the full read phase.
 */
export async function assertMobileNotQuarantined(
  tx: Transaction,
  mobileHash: string,
  now = Date.now()
): Promise<MobileQuarantineCheck> {
  const db = getAdminDb();
  const snap = await tx.get(db.collection(MOBILE_QUARANTINES).doc(mobileHash));
  if (!snap.exists) return { releaseDue: false };
  const doc = snap.data() as MobileQuarantineDoc;
  if (isQuarantineBlocking(doc, now)) {
    throwMobileQuarantined();
  }
  if (doc.status === "active" && typeof doc.releaseAt === "number" && doc.releaseAt <= now) {
    return { releaseDue: true };
  }
  return { releaseDue: false };
}

/** Write-phase companion for {@link assertMobileNotQuarantined}. */
export function applyDeferredMobileQuarantineRelease(
  tx: Transaction,
  mobileHash: string,
  now: number,
  releaseDue: boolean
): void {
  if (!releaseDue) return;
  const db = getAdminDb();
  tx.update(db.collection(MOBILE_QUARANTINES).doc(mobileHash), {
    status: "released",
    releasedAt: now,
  });
}

export function startMobileQuarantine(
  tx: Transaction,
  input: {
    mobileHash: string;
    formerUid: string;
    reason: MobileQuarantineReason;
    now: number;
  }
): MobileQuarantineDoc {
  const db = getAdminDb();
  const releaseAt = computeQuarantineReleaseAt(input.now);
  const doc: MobileQuarantineDoc = {
    mobileHash: input.mobileHash,
    formerUid: input.formerUid,
    reason: input.reason,
    status: "active",
    startedAt: input.now,
    releaseAt,
    releasedAt: null,
    cancelledAt: null,
    reboundAt: null,
    reboundToUid: null,
  };
  tx.set(db.collection(MOBILE_QUARANTINES).doc(input.mobileHash), doc);
  // Unbind active slot while quarantined (hash-keyed; raw phone never stored as id).
  tx.delete(db.collection(MOBILE_BINDINGS).doc(input.mobileHash));
  return doc;
}

/**
 * Idempotent release when due. No-op if already released/cancelled/absent/not due.
 */
export async function releaseMobileQuarantineIfDue(
  tx: Transaction,
  mobileHash: string,
  now: number
): Promise<{ released: boolean; alreadyReleased: boolean }> {
  const db = getAdminDb();
  const ref = db.collection(MOBILE_QUARANTINES).doc(mobileHash);
  const snap = await tx.get(ref);
  if (!snap.exists) return { released: false, alreadyReleased: false };
  const doc = snap.data() as MobileQuarantineDoc;
  if (doc.status === "released") return { released: false, alreadyReleased: true };
  if (doc.status === "cancelled") return { released: false, alreadyReleased: false };
  if (doc.status !== "active" || doc.releaseAt > now) {
    return { released: false, alreadyReleased: false };
  }
  tx.update(ref, { status: "released", releasedAt: now });
  return { released: true, alreadyReleased: false };
}

export async function rebindQuarantinedMobile(
  tx: Transaction,
  input: {
    oldMobileHash: string;
    newerMobileHash: string;
    originalUid: string;
    now: number;
  }
): Promise<{
  plan: QuarantineRebindPlan;
  eventId: string;
}> {
  const db = getAdminDb();
  const qRef = db.collection(MOBILE_QUARANTINES).doc(input.oldMobileHash);
  const qSnap = await tx.get(qRef);
  const quarantine = qSnap.exists ? (qSnap.data() as MobileQuarantineDoc) : null;
  const race = detectRebindRace({
    quarantine,
    expectedFormerUid: input.originalUid,
    now: input.now,
  });
  if (race === "already_rebound") {
    throw new HttpsError("aborted", "Mobile rebind already completed.");
  }
  if (race) {
    throw new HttpsError("failed-precondition", `Cannot rebind mobile (${race}).`);
  }

  const plan = planQuarantineRebind();

  tx.update(qRef, {
    status: "cancelled",
    cancelledAt: input.now,
    reboundAt: input.now,
    reboundToUid: input.originalUid,
  });

  const binding: MobileBindingDoc = {
    mobileHash: input.oldMobileHash,
    uid: input.originalUid,
    boundAt: input.now,
    updatedAt: input.now,
  };
  tx.set(db.collection(MOBILE_BINDINGS).doc(input.oldMobileHash), binding);

  // Release newer number immediately — do NOT start quarantine on newer.
  tx.delete(db.collection(MOBILE_BINDINGS).doc(input.newerMobileHash));
  const newerQRef = db.collection(MOBILE_QUARANTINES).doc(input.newerMobileHash);
  const newerQSnap = await tx.get(newerQRef);
  if (newerQSnap.exists) {
    tx.update(newerQRef, {
      status: "released",
      releasedAt: input.now,
    });
  }

  const eventId = randomBytes(16).toString("hex");
  const event: MobileSecurityEventDoc = {
    eventId,
    type: "mobile_quarantine_rebind",
    mobileHash: input.oldMobileHash,
    relatedMobileHash: input.newerMobileHash,
    formerUid: input.originalUid,
    uid: input.originalUid,
    createdAt: input.now,
    detail: {
      quarantineNewerNumber: plan.quarantineNewerNumber,
      releaseNewerNumberImmediately: plan.releaseNewerNumberImmediately,
    },
  };
  tx.set(db.collection(MOBILE_SECURITY_EVENTS).doc(eventId), event);

  return { plan, eventId };
}

// ---------------------------------------------------------------------------
// Pure in-memory ops (unit-testable without Firestore emulator)
// ---------------------------------------------------------------------------

export interface InMemoryQuarantineState {
  quarantines: Record<string, MobileQuarantineDoc>;
  bindings: Record<string, MobileBindingDoc>;
  events: MobileSecurityEventDoc[];
}

export function createEmptyQuarantineState(): InMemoryQuarantineState {
  return { quarantines: {}, bindings: {}, events: [] };
}

export function assertMobileNotQuarantinedPure(
  state: InMemoryQuarantineState,
  mobileHash: string,
  now: number
): void {
  const doc = state.quarantines[mobileHash];
  if (isQuarantineBlocking(doc, now)) {
    throwMobileQuarantined();
  }
}

export function startMobileQuarantinePure(
  state: InMemoryQuarantineState,
  input: {
    mobileHash: string;
    formerUid: string;
    reason: MobileQuarantineReason;
    now: number;
  }
): MobileQuarantineDoc {
  const doc: MobileQuarantineDoc = {
    mobileHash: input.mobileHash,
    formerUid: input.formerUid,
    reason: input.reason,
    status: "active",
    startedAt: input.now,
    releaseAt: computeQuarantineReleaseAt(input.now),
    releasedAt: null,
    cancelledAt: null,
    reboundAt: null,
    reboundToUid: null,
  };
  state.quarantines[input.mobileHash] = doc;
  delete state.bindings[input.mobileHash];
  return doc;
}

export function releaseMobileQuarantineIfDuePure(
  state: InMemoryQuarantineState,
  mobileHash: string,
  now: number
): { released: boolean; alreadyReleased: boolean } {
  const doc = state.quarantines[mobileHash];
  if (!doc) return { released: false, alreadyReleased: false };
  if (doc.status === "released") return { released: false, alreadyReleased: true };
  if (doc.status === "cancelled") return { released: false, alreadyReleased: false };
  if (doc.status !== "active" || doc.releaseAt > now) {
    return { released: false, alreadyReleased: false };
  }
  state.quarantines[mobileHash] = { ...doc, status: "released", releasedAt: now };
  return { released: true, alreadyReleased: false };
}

export function rebindQuarantinedMobilePure(
  state: InMemoryQuarantineState,
  input: {
    oldMobileHash: string;
    newerMobileHash: string;
    originalUid: string;
    now: number;
  }
): { plan: QuarantineRebindPlan; eventId: string; race: RebindRaceReason } {
  const quarantine = state.quarantines[input.oldMobileHash] ?? null;
  const race = detectRebindRace({
    quarantine,
    expectedFormerUid: input.originalUid,
    now: input.now,
  });
  if (race) return { plan: planQuarantineRebind(), eventId: "", race };

  const plan = planQuarantineRebind();
  state.quarantines[input.oldMobileHash] = {
    ...quarantine!,
    status: "cancelled",
    cancelledAt: input.now,
    reboundAt: input.now,
    reboundToUid: input.originalUid,
  };
  state.bindings[input.oldMobileHash] = {
    mobileHash: input.oldMobileHash,
    uid: input.originalUid,
    boundAt: input.now,
    updatedAt: input.now,
  };
  delete state.bindings[input.newerMobileHash];
  const newerQ = state.quarantines[input.newerMobileHash];
  if (newerQ) {
    state.quarantines[input.newerMobileHash] = {
      ...newerQ,
      status: "released",
      releasedAt: input.now,
    };
  }
  const eventId = `evt_${input.now}_${input.oldMobileHash.slice(0, 8)}`;
  state.events.push({
    eventId,
    type: "mobile_quarantine_rebind",
    mobileHash: input.oldMobileHash,
    relatedMobileHash: input.newerMobileHash,
    formerUid: input.originalUid,
    uid: input.originalUid,
    createdAt: input.now,
    detail: { quarantineNewerNumber: false },
  });
  return { plan, eventId, race: null };
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

export const checkMobileQuarantine = onCall({ region: "asia-south1" }, async (request) => {
  const raw = request.data?.phoneE164 ?? request.data?.mobileHash;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new HttpsError("invalid-argument", "phoneE164 or mobileHash is required.");
  }
  const mobileHash =
    /^[a-f0-9]{64}$/i.test(raw.trim()) ? raw.trim().toLowerCase() : sha256MobileHash(raw);
  const now = Date.now();
  const db = getAdminDb();
  const snap = await db.collection(MOBILE_QUARANTINES).doc(mobileHash).get();
  if (!snap.exists) {
    return { mobileHash, quarantined: false, status: "absent" as const };
  }
  const doc = snap.data() as MobileQuarantineDoc;
  if (doc.status === "active" && doc.releaseAt <= now) {
    await db.collection(MOBILE_QUARANTINES).doc(mobileHash).update({
      status: "released",
      releasedAt: now,
    });
    return { mobileHash, quarantined: false, status: "released" as const };
  }
  const status = quarantineStatusAt(doc, now);
  if (status === "active") {
    // Neutral: do not leak releaseAt / reason to unauthenticated callers beyond block.
    throwMobileQuarantined();
  }
  return { mobileHash, quarantined: false, status };
});

export const rebindQuarantinedMobileCallable = onCall(
  { region: "asia-south1" },
  async (request) => {
    const authUid = request.auth?.uid;
    if (!authUid) {
      throw new HttpsError("unauthenticated", "Sign in first.");
    }
    const oldPhone = String(request.data?.oldPhoneE164 ?? "");
    const newerPhone = String(request.data?.newerPhoneE164 ?? "");
    const originalUid = String(request.data?.originalUid ?? authUid);
    if (!oldPhone || !newerPhone) {
      throw new HttpsError("invalid-argument", "oldPhoneE164 and newerPhoneE164 are required.");
    }
    if (originalUid !== authUid && request.auth?.token?.support !== true) {
      throw new HttpsError("permission-denied", "Not authorized to rebind this mobile.");
    }

    const oldMobileHash = sha256MobileHash(oldPhone);
    const newerMobileHash = sha256MobileHash(newerPhone);
    const now = Date.now();
    const db = getAdminDb();

    const result = await db.runTransaction(async (tx) =>
      rebindQuarantinedMobile(tx, {
        oldMobileHash,
        newerMobileHash,
        originalUid,
        now,
      })
    );

    return {
      ok: true,
      eventId: result.eventId,
      quarantineNewerNumber: result.plan.quarantineNewerNumber,
    };
  }
);
