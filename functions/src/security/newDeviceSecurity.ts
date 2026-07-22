/**
 * New-device security login flow (server-authoritative).
 *
 * On OTP success for an unrecognized device:
 *  - emit idempotent security-login event
 *  - revoke older sessions immediately
 *  - hold new session in pendingSecurityNotification until email accepted
 *  - email provider max wait 10s; failures keep new session blocked + allow retry
 *  - “This wasn’t me” token: event-bound, 1h, single-use, hashed storage
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";

import { getAdminDb } from "../admin";

export const SECURITY_EMAIL_MAX_WAIT_MS = 10_000;
export const WAS_NOT_ME_TOKEN_TTL_MS = 60 * 60 * 1000;

export const USER_SESSIONS = "userSessions";
export const NEW_DEVICE_SECURITY_EVENTS = "newDeviceSecurityEvents";
export const WAS_NOT_ME_TOKENS = "wasNotMeTokens";

export type SecurityEmailProviderState =
  | "accepted"
  | "rejected"
  | "timeout"
  | "unknown"
  | "permanentBounce";

export type SessionSecurityStatus =
  | "active"
  | "pendingSecurityNotification"
  | "revoked"
  | "blocked";

export interface SecurityEmailSendInput {
  to: string;
  uid: string;
  eventId: string;
  sessionId: string;
  wasNotMeUrl: string;
  idempotencyKey: string;
}

export interface SecurityEmailSendResult {
  state: SecurityEmailProviderState;
  providerMessageId?: string;
}

export interface SecurityEmailProvider {
  sendSecurityLoginEmail(input: SecurityEmailSendInput): Promise<SecurityEmailSendResult>;
}

export interface UserSessionDoc {
  sessionId: string;
  uid: string;
  deviceInstallationId: string;
  createdAt: number;
  status: SessionSecurityStatus;
  revokedAt: number | null;
  pendingSecurityNotification: boolean;
  securityEventId: string | null;
}

export interface NewDeviceSecurityEventDoc {
  eventId: string;
  uid: string;
  newSessionId: string;
  deviceInstallationId: string;
  createdAt: number;
  emailState: SecurityEmailProviderState | "pending";
  emailAttempts: number;
  lastEmailAttemptAt: number | null;
  revokedOlderSessionIds: string[];
  wasNotMeConsumedAt: number | null;
  securedConfirmedAt: number | null;
}

export interface WasNotMeTokenRecord {
  tokenHash: string;
  eventId: string;
  uid: string;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
  consumedAt: number | null;
}

export function hashWasNotMeToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function mintWasNotMeRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export function signWasNotMePayload(
  secret: string,
  payload: { eventId: string; uid: string; sessionId: string; issuedAt: number }
): string {
  const body = `${payload.eventId}.${payload.uid}.${payload.sessionId}.${payload.issuedAt}`;
  const sig = createHmac("sha256", secret).update(body, "utf8").digest("base64url");
  return `${body}.${sig}`;
}

export function parseAndVerifyWasNotMeSignedToken(
  secret: string,
  raw: string
):
  | { ok: true; eventId: string; uid: string; sessionId: string; issuedAt: number }
  | { ok: false; reason: "tampered" } {
  const parts = raw.split(".");
  if (parts.length !== 5) return { ok: false, reason: "tampered" };
  const [eventId, uid, sessionId, issuedAtStr, sig] = parts;
  if (!eventId || !uid || !sessionId || !issuedAtStr || !sig) {
    return { ok: false, reason: "tampered" };
  }
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt)) return { ok: false, reason: "tampered" };
  const expected = signWasNotMePayload(secret, { eventId, uid, sessionId, issuedAt });
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(`${eventId}.${uid}.${sessionId}.${issuedAt}.${sig}`, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "tampered" };
  }
  return { ok: true, eventId, uid, sessionId, issuedAt };
}

export type WasNotMeValidationReason =
  | "expired"
  | "reused"
  | "wrong_event"
  | "tampered"
  | "already_revoked";

export type WasNotMeValidation =
  | { ok: true }
  | { ok: false; reason: WasNotMeValidationReason; securedConfirmation?: boolean };

export function validateWasNotMeToken(input: {
  now: number;
  expectedEventId: string;
  parsed:
    | { ok: true; eventId: string; uid: string; sessionId: string; issuedAt: number }
    | { ok: false; reason: "tampered" };
  tokenRecord: WasNotMeTokenRecord | null;
  sessionStatus: SessionSecurityStatus | null;
}): WasNotMeValidation {
  if (!input.parsed.ok) return { ok: false, reason: "tampered" };
  if (input.parsed.eventId !== input.expectedEventId) {
    return { ok: false, reason: "wrong_event" };
  }
  if (!input.tokenRecord) return { ok: false, reason: "tampered" };
  if (input.tokenRecord.eventId !== input.expectedEventId) {
    return { ok: false, reason: "wrong_event" };
  }
  if (input.sessionStatus === "revoked") {
    return { ok: false, reason: "already_revoked", securedConfirmation: true };
  }
  if (input.tokenRecord.consumedAt != null) {
    return { ok: false, reason: "reused" };
  }
  if (input.now > input.tokenRecord.expiresAt || input.now > input.parsed.issuedAt + WAS_NOT_ME_TOKEN_TTL_MS) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

export function securityEventIdempotencyKey(uid: string, deviceInstallationId: string, newSessionId: string): string {
  return createHash("sha256")
    .update(`new-device|${uid}|${deviceInstallationId}|${newSessionId}`, "utf8")
    .digest("hex");
}

export function planNewDeviceLogin(input: {
  existingSessions: UserSessionDoc[];
  newSessionId: string;
  uid: string;
  deviceInstallationId: string;
  now: number;
  eventId: string;
}): {
  revokeSessionIds: string[];
  newSession: UserSessionDoc;
  event: NewDeviceSecurityEventDoc;
} {
  const revokeSessionIds = input.existingSessions
    .filter((s) => s.sessionId !== input.newSessionId && s.status !== "revoked")
    .map((s) => s.sessionId);

  const newSession: UserSessionDoc = {
    sessionId: input.newSessionId,
    uid: input.uid,
    deviceInstallationId: input.deviceInstallationId,
    createdAt: input.now,
    status: "pendingSecurityNotification",
    revokedAt: null,
    pendingSecurityNotification: true,
    securityEventId: input.eventId,
  };

  const event: NewDeviceSecurityEventDoc = {
    eventId: input.eventId,
    uid: input.uid,
    newSessionId: input.newSessionId,
    deviceInstallationId: input.deviceInstallationId,
    createdAt: input.now,
    emailState: "pending",
    emailAttempts: 0,
    lastEmailAttemptAt: null,
    revokedOlderSessionIds: revokeSessionIds,
    wasNotMeConsumedAt: null,
    securedConfirmedAt: null,
  };

  return { revokeSessionIds, newSession, event };
}

export function applyEmailProviderOutcome(
  event: NewDeviceSecurityEventDoc,
  result: SecurityEmailSendResult,
  now: number
): {
  event: NewDeviceSecurityEventDoc;
  newSessionStatus: SessionSecurityStatus;
  allowRetry: boolean;
} {
  const next: NewDeviceSecurityEventDoc = {
    ...event,
    emailState: result.state,
    emailAttempts: event.emailAttempts + 1,
    lastEmailAttemptAt: now,
  };
  if (result.state === "accepted") {
    return {
      event: next,
      newSessionStatus: "active",
      allowRetry: false,
    };
  }
  // Failure paths: keep new session blocked; old already revoked; retry same event.
  return {
    event: next,
    newSessionStatus: "blocked",
    allowRetry: result.state !== "permanentBounce",
  };
}

export async function sendWithMaxWait(
  provider: SecurityEmailProvider,
  input: SecurityEmailSendInput,
  maxWaitMs = SECURITY_EMAIL_MAX_WAIT_MS
): Promise<SecurityEmailSendResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      provider.sendSecurityLoginEmail(input),
      new Promise<SecurityEmailSendResult>((resolve) => {
        timer = setTimeout(() => resolve({ state: "timeout" }), maxWaitMs);
      }),
    ]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createRejectingSecurityEmailProvider(): SecurityEmailProvider {
  return {
    async sendSecurityLoginEmail() {
      return { state: "rejected" };
    },
  };
}

export function createAcceptingSecurityEmailProvider(): SecurityEmailProvider {
  return {
    async sendSecurityLoginEmail() {
      return { state: "accepted", providerMessageId: "dev-accept" };
    },
  };
}

export function createTimeoutSecurityEmailProvider(delayMs: number): SecurityEmailProvider {
  return {
    async sendSecurityLoginEmail() {
      await new Promise((r) => setTimeout(r, delayMs));
      return { state: "accepted", providerMessageId: "late" };
    },
  };
}

function resolveWasNotMeSecret(): string {
  const secret = process.env.WAS_NOT_ME_HMAC_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return "emulator-only-was-not-me-hmac-secret-do-not-use-in-prod";
  }
  throw new HttpsError("failed-precondition", "Security token signing is unavailable.");
}

function sessionsCollection(uid: string) {
  return getAdminDb().collection(USER_SESSIONS).doc(uid).collection("sessions");
}

/**
 * Idempotent registration of a new-device security event after OTP success.
 */
export const registerNewDeviceSecurityEvent = onCall(
  { region: "asia-south1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");

    const deviceInstallationId = String(request.data?.deviceInstallationId ?? "").trim();
    const newSessionId = String(request.data?.sessionId ?? "").trim();
    const email = String(request.data?.email ?? "").trim().toLowerCase();
    if (!deviceInstallationId || !newSessionId) {
      throw new HttpsError("invalid-argument", "deviceInstallationId and sessionId are required.");
    }

    const db = getAdminDb();
    const eventId = securityEventIdempotencyKey(uid, deviceInstallationId, newSessionId);
    const eventRef = db.collection(NEW_DEVICE_SECURITY_EVENTS).doc(eventId);
    const existing = await eventRef.get();
    if (existing.exists) {
      const prior = existing.data() as NewDeviceSecurityEventDoc;
      return {
        eventId,
        idempotent: true,
        emailState: prior.emailState,
        newSessionStatus:
          prior.emailState === "accepted" ? "active" : ("blocked" as SessionSecurityStatus),
      };
    }

    const now = Date.now();
    const sessSnap = await sessionsCollection(uid).get();
    const existingSessions = sessSnap.docs.map((d) => d.data() as UserSessionDoc);
    const planned = planNewDeviceLogin({
      existingSessions,
      newSessionId,
      uid,
      deviceInstallationId,
      now,
      eventId,
    });

    const batch = db.batch();
    for (const sid of planned.revokeSessionIds) {
      batch.set(
        sessionsCollection(uid).doc(sid),
        {
          status: "revoked",
          revokedAt: now,
          pendingSecurityNotification: false,
        },
        { merge: true }
      );
    }
    batch.set(sessionsCollection(uid).doc(newSessionId), planned.newSession);
    batch.set(eventRef, planned.event);
    await batch.commit();

    const secret = resolveWasNotMeSecret();
    const issuedAt = now;
    const signed = signWasNotMePayload(secret, {
      eventId,
      uid,
      sessionId: newSessionId,
      issuedAt,
    });
    const tokenHash = hashWasNotMeToken(signed);
    await db.collection(WAS_NOT_ME_TOKENS).doc(tokenHash).set({
      tokenHash,
      eventId,
      uid,
      sessionId: newSessionId,
      issuedAt,
      expiresAt: issuedAt + WAS_NOT_ME_TOKEN_TTL_MS,
      consumedAt: null,
    } satisfies WasNotMeTokenRecord);

    // Provider wiring is environment-dependent; callables accept injected retry path.
    // Production Resend deploy may be externally blocked — see client note.
    const provider = resolveSecurityEmailProvider();
    const baseUrl = process.env.WAS_NOT_ME_BASE_URL?.trim() || "https://app.vyaamikkdiary.invalid";
    const emailResult = email
      ? await sendWithMaxWait(provider, {
          to: email,
          uid,
          eventId,
          sessionId: newSessionId,
          wasNotMeUrl: `${baseUrl}/security/was-not-me?t=${encodeURIComponent(signed)}`,
          idempotencyKey: `new-device-email:${eventId}:1`,
        })
      : ({ state: "unknown" } as SecurityEmailSendResult);

    const applied = applyEmailProviderOutcome(planned.event, emailResult, Date.now());
    await eventRef.update({
      emailState: applied.event.emailState,
      emailAttempts: applied.event.emailAttempts,
      lastEmailAttemptAt: applied.event.lastEmailAttemptAt,
    });
    await sessionsCollection(uid).doc(newSessionId).set(
      {
        status: applied.newSessionStatus,
        pendingSecurityNotification: applied.newSessionStatus === "pendingSecurityNotification",
      },
      { merge: true }
    );

    return {
      eventId,
      idempotent: false,
      emailState: applied.event.emailState,
      newSessionStatus: applied.newSessionStatus,
      allowRetry: applied.allowRetry,
      // Signed token returned only to the authenticated new device for deep-link tests;
      // production emails carry the link. Never log this value.
      wasNotMeToken: process.env.FUNCTIONS_EMULATOR === "true" ? signed : undefined,
    };
  }
);

export const retryNewDeviceSecurityEmail = onCall({ region: "asia-south1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const eventId = String(request.data?.eventId ?? "").trim();
  const email = String(request.data?.email ?? "").trim().toLowerCase();
  if (!eventId || !email) {
    throw new HttpsError("invalid-argument", "eventId and email are required.");
  }

  const db = getAdminDb();
  const eventRef = db.collection(NEW_DEVICE_SECURITY_EVENTS).doc(eventId);
  const snap = await eventRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Security event not found.");
  const event = snap.data() as NewDeviceSecurityEventDoc;
  if (event.uid !== uid) throw new HttpsError("permission-denied", "Not your security event.");
  if (event.emailState === "accepted") {
    return { emailState: "accepted" as const, newSessionStatus: "active" as const, allowRetry: false };
  }
  if (event.emailState === "permanentBounce") {
    return {
      emailState: "permanentBounce" as const,
      newSessionStatus: "blocked" as const,
      allowRetry: false,
    };
  }

  const secret = resolveWasNotMeSecret();
  const issuedAt = Date.now();
  const signed = signWasNotMePayload(secret, {
    eventId,
    uid,
    sessionId: event.newSessionId,
    issuedAt,
  });
  const tokenHash = hashWasNotMeToken(signed);
  await db.collection(WAS_NOT_ME_TOKENS).doc(tokenHash).set({
    tokenHash,
    eventId,
    uid,
    sessionId: event.newSessionId,
    issuedAt,
    expiresAt: issuedAt + WAS_NOT_ME_TOKEN_TTL_MS,
    consumedAt: null,
  } satisfies WasNotMeTokenRecord);

  const provider = resolveSecurityEmailProvider();
  const baseUrl = process.env.WAS_NOT_ME_BASE_URL?.trim() || "https://app.vyaamikkdiary.invalid";
  const attempt = event.emailAttempts + 1;
  const emailResult = await sendWithMaxWait(provider, {
    to: email,
    uid,
    eventId,
    sessionId: event.newSessionId,
    wasNotMeUrl: `${baseUrl}/security/was-not-me?t=${encodeURIComponent(signed)}`,
    idempotencyKey: `new-device-email:${eventId}:${attempt}`,
  });

  const applied = applyEmailProviderOutcome(event, emailResult, Date.now());
  await eventRef.update({
    emailState: applied.event.emailState,
    emailAttempts: applied.event.emailAttempts,
    lastEmailAttemptAt: applied.event.lastEmailAttemptAt,
  });
  await sessionsCollection(uid).doc(event.newSessionId).set(
    {
      status: applied.newSessionStatus,
      pendingSecurityNotification: applied.newSessionStatus === "pendingSecurityNotification",
    },
    { merge: true }
  );

  return {
    emailState: applied.event.emailState,
    newSessionStatus: applied.newSessionStatus,
    allowRetry: applied.allowRetry,
  };
});

async function handleWasNotMeCore(rawToken: string): Promise<{
  ok: boolean;
  securedConfirmation?: boolean;
  reason?: WasNotMeValidationReason;
}> {
  const secret = resolveWasNotMeSecret();
  const parsed = parseAndVerifyWasNotMeSignedToken(secret, rawToken);
  if (!parsed.ok) return { ok: false, reason: "tampered" };

  const db = getAdminDb();
  const tokenHash = hashWasNotMeToken(rawToken);
  const tokenRef = db.collection(WAS_NOT_ME_TOKENS).doc(tokenHash);
  const eventRef = db.collection(NEW_DEVICE_SECURITY_EVENTS).doc(parsed.eventId);
  const sessionRef = sessionsCollection(parsed.uid).doc(parsed.sessionId);

  return db.runTransaction(async (tx) => {
    const [tokenSnap, eventSnap, sessionSnap] = await Promise.all([
      tx.get(tokenRef),
      tx.get(eventRef),
      tx.get(sessionRef),
    ]);
    const tokenRecord = tokenSnap.exists ? (tokenSnap.data() as WasNotMeTokenRecord) : null;
    const session = sessionSnap.exists ? (sessionSnap.data() as UserSessionDoc) : null;
    const now = Date.now();
    const validation = validateWasNotMeToken({
      now,
      expectedEventId: parsed.eventId,
      parsed,
      tokenRecord,
      sessionStatus: session?.status ?? null,
    });

    if (!validation.ok) {
      if (validation.reason === "already_revoked") {
        return { ok: true, securedConfirmation: true };
      }
      return { ok: false, reason: validation.reason };
    }

    tx.update(sessionRef, {
      status: "revoked",
      revokedAt: now,
      pendingSecurityNotification: false,
    });
    if (tokenSnap.exists) {
      tx.update(tokenRef, { consumedAt: now });
    }
    if (eventSnap.exists) {
      tx.update(eventRef, {
        wasNotMeConsumedAt: now,
        securedConfirmedAt: now,
      });
    }
    return { ok: true, securedConfirmation: true };
  });
}

export const handleWasNotMeToken = onCall({ region: "asia-south1" }, async (request) => {
  const raw = String(request.data?.token ?? "").trim();
  if (!raw) throw new HttpsError("invalid-argument", "token is required.");
  const result = await handleWasNotMeCore(raw);
  if (!result.ok && result.reason === "tampered") {
    throw new HttpsError("invalid-argument", "Invalid security token.");
  }
  if (!result.ok && result.reason === "expired") {
    throw new HttpsError("deadline-exceeded", "This security link has expired.");
  }
  if (!result.ok && result.reason === "reused") {
    throw new HttpsError("failed-precondition", "This security link was already used.");
  }
  if (!result.ok && result.reason === "wrong_event") {
    throw new HttpsError("failed-precondition", "This security link does not match the event.");
  }
  return {
    ok: true,
    securedConfirmation: true as const,
    message: "Your account sessions were secured. The unrecognized device was signed out.",
  };
});

/** HTTP entry for email deep-links (no Firebase Auth required). */
export const handleWasNotMeTokenHttp = onRequest({ region: "asia-south1" }, async (req, res) => {
  const raw = String(req.query.t ?? req.body?.token ?? "").trim();
  if (!raw) {
    res.status(400).json({ ok: false, reason: "missing_token" });
    return;
  }
  try {
    const result = await handleWasNotMeCore(raw);
    if (result.securedConfirmation) {
      res.status(200).json({
        ok: true,
        securedConfirmation: true,
        message: "Your account is secured. The unrecognized sign-in was blocked.",
      });
      return;
    }
    res.status(400).json({ ok: false, reason: result.reason ?? "invalid" });
  } catch {
    res.status(500).json({ ok: false, reason: "internal" });
  }
});

function resolveSecurityEmailProvider(): SecurityEmailProvider {
  const mode = process.env.SECURITY_EMAIL_PROVIDER_MODE?.trim();
  if (mode === "accept" || process.env.FUNCTIONS_EMULATOR === "true") {
    return createAcceptingSecurityEmailProvider();
  }
  if (mode === "reject") return createRejectingSecurityEmailProvider();
  if (mode === "timeout") return createTimeoutSecurityEmailProvider(SECURITY_EMAIL_MAX_WAIT_MS + 5_000);
  // Production Resend path is externally blocked until provider secrets + deploy are available.
  return {
    async sendSecurityLoginEmail() {
      return { state: "unknown" };
    },
  };
}
