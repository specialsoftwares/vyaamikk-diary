/**
 * Finishes an already-authorized recovery after its identity transaction.
 * Only the admitted completeAccountRecovery callable may invoke this helper.
 * The transaction's cutoff closes old sessions before the external Auth RPC.
 * An ambiguous revoke is reconciled, never blindly repeated on a newer login.
 */
import { randomBytes } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { getAdminAuth, getAdminDb } from "../admin";
import { assertRestoreTrafficClosed, restoreAdmissionForUid } from "../deletion/restoreGate";
import { claimsForAdmission } from "../deletion/restoreAuthority";
import { AUTH_SECURITY_COLLECTION, ORIGIN_AUTH_TIME_CLAIM } from "../identity/sessionSecurityPolicy";
import { resolveVerifiedMailbox } from "../email/verifiedMailbox";

const SESSIONS = "accountRecoverySessions";
type FinalizationStage = "before_revoke" | "after_revoke" | "before_token" | "after_token" | "before_completed";
let testFault: ((stage: string) => Promise<void>) | null = null;

/** This seam cannot be installed in a deployed function. */
export function __setRecoveryFinalizationFaultForTests(
  next: ((stage: string) => Promise<void>) | null
): void {
  if (process.env.FUNCTIONS_EMULATOR !== "true") throw new Error("emulator_only");
  testFault = next;
}

async function fault(stage: FinalizationStage): Promise<void> {
  if (process.env.FUNCTIONS_EMULATOR === "true") await testFault?.(stage);
}

type Session = {
  uid: string;
  status: "identity_committed" | "completed";
  newPhoneE164: string;
  recoveryDeviceId: string;
  coolingOffUntil: number;
  securityOperationId: string;
  recoveryCutoffSeconds: number;
  expiresAt: number;
  mailboxHash: string;
  mailboxVersion: number;
  recoveryEmail: string;
  revocationState: "pending" | "started" | "complete";
  revocationClaim?: string;
  revocationProviderBaselineSeconds?: number;
  revocationStartedAtSeconds?: number;
  revocationProviderCutoffSeconds?: number;
  recoveryAuthTimeSeconds?: number;
};

export type RecoveryFinalizationResult = {
  customToken?: string;
  recoveryDeviceId: string;
  coolingOffUntil: number;
  alreadyDone: boolean;
};

function unavailable(): never {
  throw new HttpsError("unavailable", "Recovery could not be confirmed yet. Sign in again or contact support.", {
    code: "RECOVERY_FINALIZATION_PENDING",
  });
}

function superseded(): never {
  throw new HttpsError("permission-denied", "This recovery session is no longer current. Sign in again.", {
    code: "RECOVERY_SESSION_CHANGED",
  });
}

function seconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function providerCutoff(value: string | undefined, allowNoPriorRevocation = false): number {
  // Admin Auth omits this optional field when there has been no revocation.
  // Only the pre-RPC baseline may be absent; completion still needs a real
  // provider timestamp newer than that baseline.
  if (value == null && allowNoPriorRevocation) return 0;
  const milliseconds = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(milliseconds)) unavailable();
  return Math.floor(milliseconds / 1000);
}

function result(session: Session, alreadyDone: boolean, customToken?: string): RecoveryFinalizationResult {
  return {
    recoveryDeviceId: session.recoveryDeviceId,
    coolingOffUntil: session.coolingOffUntil,
    alreadyDone,
    ...(customToken ? { customToken } : {}),
  };
}

/** Wait only for a real clock tick, never fabricate an authentication time. */
async function afterSecond(boundary: number): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  if (now > boundary) return now;
  if (boundary > now) unavailable();
  await new Promise<void>((resolve) => setTimeout(resolve, 1_010 - (Date.now() % 1000)));
  const actual = Math.floor(Date.now() / 1000);
  if (actual <= boundary) unavailable();
  return actual;
}

export async function finalizeCommittedRecovery(input: {
  uid: string;
  sessionId: string;
}): Promise<RecoveryFinalizationResult> {
  const { uid, sessionId } = input;
  if (!uid || uid.includes("/") || !/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) superseded();
  const db = getAdminDb();
  const auth = getAdminAuth();
  const sessionRef = db.collection(SESSIONS).doc(sessionId);
  const userRef = db.collection("users").doc(uid);
  const securityRef = db.collection(AUTH_SECURITY_COLLECTION).doc(uid);
  const expectedOperationId = `recovery:${sessionId}`;

  // Every mutation re-reads the operation and the current owner. Admin Auth
  // and restore authority also receive fresh reads around token issuance.
  async function readOwned(tx: FirebaseFirestore.Transaction): Promise<Session> {
    const [sessionSnap, userSnap, securitySnap] = await Promise.all([
      tx.get(sessionRef), tx.get(userRef), tx.get(securityRef),
    ]);
    if (!sessionSnap.exists || !userSnap.exists) superseded();
    const session = sessionSnap.data() as Session;
    const user = userSnap.data()!;
    if (
      session.uid !== uid || !["identity_committed", "completed"].includes(session.status) ||
      user.status !== "active" || user.phoneE164 !== session.newPhoneE164 ||
      typeof session.newPhoneE164 !== "string" || !/^\+[1-9][0-9]{7,14}$/.test(session.newPhoneE164) ||
      typeof session.recoveryDeviceId !== "string" || !session.recoveryDeviceId ||
      !Number.isFinite(session.coolingOffUntil)
    ) superseded();
    const index = await tx.get(db.collection("phoneIndex").doc(session.newPhoneE164));
    if (!index.exists || index.get("uid") !== uid) superseded();
    // A completed replay discloses only its durable result. It never creates
    // a new authentication event or revokes a subsequent legitimate session.
    if (session.status === "completed") return session;
    const security = securitySnap.data();
    if (
      session.securityOperationId !== expectedOperationId ||
      !seconds(session.recoveryCutoffSeconds) ||
      !security || security.operationId !== expectedOperationId ||
      security.revokedBeforeAuthTimeSeconds !== session.recoveryCutoffSeconds ||
      !["pending", "started", "complete"].includes(session.revocationState) ||
      (session.revocationState === "complete" && security.revocationState !== "complete")
    ) superseded();
    if (!Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) unavailable();
    if (!/^[a-f0-9]{64}$/.test(session.mailboxHash)) superseded();
    const binding = await tx.get(db.collection("emailBindings").doc(session.mailboxHash));
    const mailbox = resolveVerifiedMailbox({
      uid,
      emailStatus: user.emailStatus,
      normalizedEmail: user.normalizedEmail,
      emailHash: user.emailHash,
      emailBindingVersion: user.emailBindingVersion,
    }, binding.exists ? binding.data()! : null);
    if (
      !mailbox.ok || mailbox.emailHash !== session.mailboxHash ||
      mailbox.bindingVersion !== session.mailboxVersion || mailbox.normalizedEmail !== session.recoveryEmail
    ) superseded();
    return session;
  }

  async function readAuth(session: Session, allowNoPriorRevocation = false): Promise<number> {
    const user = await auth.getUser(uid);
    if (user.disabled || user.phoneNumber !== session.newPhoneE164) superseded();
    return providerCutoff(user.tokensValidAfterTime, allowNoPriorRevocation);
  }

  async function restoreAdmission() {
    await assertRestoreTrafficClosed(uid);
    const admission = await restoreAdmissionForUid(uid);
    if (admission.status === "deny" || admission.status === "unavailable") unavailable();
    return admission;
  }

  let session = await db.runTransaction(readOwned);
  if (session.status === "completed") return result(session, true);
  await restoreAdmission();
  let authCutoff = await readAuth(session, session.revocationState === "pending");

  if (session.revocationState === "pending") {
    // A same-second pre-existing provider timestamp is not evidence that this
    // RPC completed. Start on a later real second to make reconciliation exact.
    const startedAtSeconds = await afterSecond(Math.max(authCutoff, session.recoveryCutoffSeconds));
    await fault("before_revoke");
    const claim = randomBytes(16).toString("hex");
    const claimed = await db.runTransaction(async (tx) => {
      const current = await readOwned(tx);
      if (current.status === "completed" || current.revocationState !== "pending") return false;
      tx.update(sessionRef, {
        revocationState: "started",
        revocationClaim: claim,
        revocationProviderBaselineSeconds: authCutoff,
        revocationStartedAtSeconds: startedAtSeconds,
      });
      return true;
    });
    if (claimed) {
      try {
        await auth.revokeRefreshTokens(uid);
      } catch {
        // It may have succeeded remotely. Keep started; only provider evidence
        // can reconcile it, so a retry cannot revoke a later login again.
        unavailable();
      }
      await fault("after_revoke");
      authCutoff = await readAuth(session);
      if (authCutoff < startedAtSeconds || authCutoff <= session.recoveryCutoffSeconds) unavailable();
      await db.runTransaction(async (tx) => {
        const current = await readOwned(tx);
        if (current.status === "completed") return;
        if (current.revocationState === "complete") return;
        if (current.revocationState !== "started" || current.revocationClaim !== claim) superseded();
        tx.update(sessionRef, { revocationState: "complete", revocationProviderCutoffSeconds: authCutoff });
        tx.update(securityRef, { revocationState: "complete", updatedAt: Date.now() });
      });
    }
    session = await db.runTransaction(readOwned);
  }

  if (session.status === "completed") return result(session, true);
  if (session.revocationState === "started") {
    authCutoff = await readAuth(session);
    const baseline = session.revocationProviderBaselineSeconds;
    const started = session.revocationStartedAtSeconds;
    if (!seconds(baseline) || !seconds(started) || authCutoff <= baseline || authCutoff < started) unavailable();
    session = await db.runTransaction(async (tx) => {
      const current = await readOwned(tx);
      if (current.status === "completed" || current.revocationState === "complete") return current;
      if (
        current.revocationState !== "started" || current.revocationClaim !== session.revocationClaim ||
        current.revocationProviderBaselineSeconds !== baseline || current.revocationStartedAtSeconds !== started
      ) superseded();
      tx.update(sessionRef, { revocationState: "complete", revocationProviderCutoffSeconds: authCutoff });
      tx.update(securityRef, { revocationState: "complete", updatedAt: Date.now() });
      return { ...current, revocationState: "complete" as const, revocationProviderCutoffSeconds: authCutoff };
    });
  }

  if (session.status === "completed") return result(session, true);
  if (session.revocationState !== "complete") unavailable();
  authCutoff = await readAuth(session);
  const fixedProviderCutoff = session.revocationProviderCutoffSeconds;
  if (!seconds(fixedProviderCutoff) || authCutoff !== fixedProviderCutoff) superseded();
  const actualOrigin = session.recoveryAuthTimeSeconds ?? await afterSecond(Math.max(authCutoff, session.recoveryCutoffSeconds));
  session = await db.runTransaction(async (tx) => {
    const current = await readOwned(tx);
    if (current.status === "completed") return current;
    if (current.revocationState !== "complete" || current.revocationProviderCutoffSeconds !== fixedProviderCutoff) superseded();
    const origin = current.recoveryAuthTimeSeconds ?? actualOrigin;
    if (!seconds(origin) || origin <= Math.max(authCutoff, current.recoveryCutoffSeconds) || origin > Math.floor(Date.now() / 1000)) superseded();
    if (current.recoveryAuthTimeSeconds == null) tx.update(sessionRef, { recoveryAuthTimeSeconds: origin });
    return { ...current, recoveryAuthTimeSeconds: origin };
  });
  if (session.status === "completed") return result(session, true);
  await fault("before_token");
  const admission = await restoreAdmission();
  const tokenOwner = await db.runTransaction(readOwned);
  if (tokenOwner.status === "completed") return result(tokenOwner, true);
  if (
    tokenOwner.revocationState !== "complete" ||
    tokenOwner.recoveryAuthTimeSeconds !== session.recoveryAuthTimeSeconds ||
    tokenOwner.revocationProviderCutoffSeconds !== fixedProviderCutoff
  ) superseded();
  authCutoff = await readAuth(session);
  if (authCutoff !== fixedProviderCutoff || session.recoveryAuthTimeSeconds! <= authCutoff) superseded();
  // Pin the original recovery event, rather than redemption time or retry time.
  const customToken = await auth.createCustomToken(uid, claimsForAdmission({
    recoveryDeviceId: session.recoveryDeviceId,
    recoverySession: true,
    [ORIGIN_AUTH_TIME_CLAIM]: session.recoveryAuthTimeSeconds!,
  }, admission));
  await fault("after_token");
  await fault("before_completed");
  const latestAdmission = await restoreAdmission();
  // A restore epoch change invalidates even a token minted just moments ago.
  if (JSON.stringify(claimsForAdmission({}, admission)) !== JSON.stringify(claimsForAdmission({}, latestAdmission))) superseded();
  if (await readAuth(session) !== fixedProviderCutoff) superseded();
  const completed = await db.runTransaction(async (tx) => {
    const current = await readOwned(tx);
    if (current.status === "completed") return { session: current, alreadyDone: true };
    if (
      current.revocationState !== "complete" ||
      current.recoveryAuthTimeSeconds !== session.recoveryAuthTimeSeconds ||
      current.revocationProviderCutoffSeconds !== fixedProviderCutoff
    ) superseded();
    tx.update(sessionRef, { status: "completed", completedAt: Date.now() });
    tx.update(userRef, { recoveryPending: false, updatedAt: Date.now() });
    return { session: { ...current, status: "completed" as const }, alreadyDone: false };
  });
  // A concurrent successful finalizer owns delivery; discard our unused token.
  return result(completed.session, completed.alreadyDone, completed.alreadyDone ? undefined : customToken);
}
