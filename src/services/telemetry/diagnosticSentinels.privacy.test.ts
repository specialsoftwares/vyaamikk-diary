/**
 * Sentinel leakage test across the production diagnostic sinks.
 *
 * Drives the real `createLogger` (console sink), the real crash wrapper
 * (injected Crashlytics port) and the real startup global handler path with
 * synthetic OTP / token / Authorization / download-URL / bank / phone / UID
 * values, then asserts that none of them reach any sink.
 *
 * Also pins the consent behaviour: opting out clears the pseudonymous
 * Crashlytics user id, and only a uid prefix (never the full uid) is ever set.
 *
 * Label: EXECUTED_PRODUCTION_METHOD / INJECTED (Crashlytics port, ErrorUtils
 * shim). Not a native Crashlytics or device test.
 */
import assert from "node:assert/strict";

import { __setRuntimeSignalsForTests } from "@/config/env";
import { installGlobalStartupHandlers, setStartupFailureListener } from "@/startup/globalHandlers";
import type { StartupDiagnostics } from "@/startup/types";
import { createLogger } from "@/utils/logger";

import {
  __resetCrashReportingForTests,
  __setCrashlyticsClientForTests,
  clearUser,
  log as crashLog,
  recordError,
  setCrashReportingEnabled,
  setUserId,
} from "./crashReporter";

// ---------------------------------------------------------------------------
// Synthetic sentinels. None of these are real credentials or customer values.
// ---------------------------------------------------------------------------
const OTP = "SENTINEL_OTP_4433";
const OTP_DIGITS = "774411";
const ID_TOKEN = "SENTINEL_TOKEN_abc";
const JWT_LIKE = "eyJSENTINELHDR.eyJSENTINELPAYLOAD.SENTINELSIG";
const REFRESH_TOKEN = "SENTINEL_REFRESH_xyz";
const APP_CHECK_TOKEN = "SENTINEL_APPCHECK_q1";
const AUTH_HEADER = `Bearer ${ID_TOKEN}`;
const DOWNLOAD_URL =
  "https://firebasestorage.googleapis.com/v0/b/sentinel-bucket/o/users%2FSENTINEL_UID_ALPHA%2Fletterhead.png?alt=media&token=SENTINEL_DL_TOKEN_77";
const IFSC = "SENTINEL_IFSC_HDFC0SENT1";
const ACCOUNT_NO = "SENTINEL_ACCT_000111222333";
const PHONE = "+919800011122";
const UID_A = "SENTINEL_UID_ALPHA_0123456789";
const UID_B = "SENTINEL_UID_BETA_9876543210";
const UID_LIST = [UID_A, UID_B];

const SENTINEL_PATTERNS: RegExp[] = [
  /SENTINEL_OTP_4433/,
  /774411/,
  /SENTINEL_TOKEN_abc/,
  /eyJSENTINELHDR/,
  /SENTINEL_REFRESH_xyz/,
  /SENTINEL_APPCHECK_q1/,
  /Bearer /,
  /SENTINEL_DL_TOKEN_77/,
  /sentinel-bucket/,
  /SENTINEL_IFSC_HDFC0SENT1/,
  /SENTINEL_ACCT_000111222333/,
  /9800011122/,
  /SENTINEL_UID_ALPHA_0123456789/,
  /SENTINEL_UID_BETA_9876543210/,
];

function serialize(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_k, v) => {
    if (v instanceof Error) {
      return {
        name: v.name,
        message: v.message,
        stack: v.stack,
        cause: (v as { cause?: unknown }).cause,
        ...(v as unknown as Record<string, unknown>),
      };
    }
    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) return "[cyclic]";
      seen.add(v);
    }
    return v;
  });
}

function assertNoSentinels(blob: string, where: string): void {
  for (const re of SENTINEL_PATTERNS) {
    assert.doesNotMatch(blob, re, `${where} leaked sentinel ${re}`);
  }
}

function captureConsole() {
  const rows: unknown[][] = [];
  const orig = { error: console.error, warn: console.warn, log: console.log, info: console.info, debug: console.debug };
  const push = (...args: unknown[]) => {
    rows.push(args);
  };
  console.error = push;
  console.warn = push;
  console.log = push;
  console.info = push;
  console.debug = push;
  return {
    rows,
    restore() {
      console.error = orig.error;
      console.warn = orig.warn;
      console.log = orig.log;
      console.info = orig.info;
      console.debug = orig.debug;
    },
  };
}

function productionSignals() {
  process.env.EXPO_PUBLIC_APP_MODE = "production";
  __setRuntimeSignalsForTests({ appOwnership: null, isDev: false, platform: "android" });
}

function developmentSignals() {
  process.env.EXPO_PUBLIC_APP_MODE = "development";
  __setRuntimeSignalsForTests({ appOwnership: "expo", isDev: true, platform: "ios" });
}

function hostileError(): Error {
  const err = Object.assign(new Error(`otp ${OTP} ${OTP_DIGITS} idToken=${ID_TOKEN} ${AUTH_HEADER} url=${DOWNLOAD_URL}`), {
    code: OTP,
    customData: {
      otp: OTP,
      idToken: ID_TOKEN,
      refreshToken: REFRESH_TOKEN,
      appCheckToken: APP_CHECK_TOKEN,
      headers: { Authorization: AUTH_HEADER },
      downloadUrl: DOWNLOAD_URL,
      bank: { ifsc: IFSC, accountNumber: ACCOUNT_NO },
      phoneE164: PHONE,
      uids: UID_LIST,
    },
    response: { body: `{"token":"${ID_TOKEN}"}` },
  });
  err.stack = `Error: ${err.message}\n    at verifyOtp (${DOWNLOAD_URL})\n    at bearer (${AUTH_HEADER})`;
  (err as Error & { cause?: unknown }).cause = new Error(`cause ${JWT_LIKE} ${PHONE} ${UID_A}`);
  return err;
}

function driveLogger(): void {
  const log = createLogger("auth/nativePhone");
  const scopeLeak = createLogger(`auth/${OTP}/${ID_TOKEN}`);

  // Free-form messages in every level.
  log.debug(`debug ${OTP} ${ID_TOKEN}`);
  log.info(`info ${PHONE} ${UID_A}`);
  log.warn(`warn ${AUTH_HEADER} ${DOWNLOAD_URL}`);
  log.error(`error ${OTP_DIGITS} ${JWT_LIKE} ${IFSC} ${ACCOUNT_NO}`);
  scopeLeak.error("boot failed");

  // Allowlisted message, hostile metadata on allowlisted + unknown keys.
  log.error("boot failed", {
    code: OTP,
    errorCode: ID_TOKEN,
    stage: AUTH_HEADER,
    op: DOWNLOAD_URL,
    kind: OTP_DIGITS,
    callableName: REFRESH_TOKEN,
    firebaseAuthCode: APP_CHECK_TOKEN,
    otp: OTP,
    verificationCode: OTP_DIGITS,
    idToken: ID_TOKEN,
    refreshToken: REFRESH_TOKEN,
    appCheckToken: APP_CHECK_TOKEN,
    authorization: AUTH_HEADER,
    headers: { Authorization: AUTH_HEADER, "X-Firebase-AppCheck": APP_CHECK_TOKEN },
    downloadUrl: DOWNLOAD_URL,
    url: DOWNLOAD_URL,
    bank: { ifsc: IFSC, accountNumber: ACCOUNT_NO },
    ifsc: IFSC,
    accountNumber: ACCOUNT_NO,
    phoneE164: PHONE,
    phone: PHONE,
    uid: UID_A,
    uids: UID_LIST,
    testers: UID_LIST.join(","),
    count: UID_LIST.length,
    ms: 12,
  });

  // Error objects (message, stack, cause, customData, code).
  log.error("callable mintClientAuthToken failed", hostileError());
  log.warn("pdf share failed", hostileError());

  // Non-object data shapes.
  log.error("boot failed", OTP);
  log.error("boot failed", UID_LIST);
  log.error("boot failed", [AUTH_HEADER, DOWNLOAD_URL]);
  log.error("boot failed", new Map([["otp", OTP]]));
  log.error("boot failed", JSON.parse(`{"__proto__":{"code":"${OTP}"},"stage":"BOOT"}`));
}

// ---------------------------------------------------------------------------
// 1. Production logger: no sentinel reaches console sinks.
// ---------------------------------------------------------------------------
{
  productionSignals();
  const cap = captureConsole();
  try {
    driveLogger();
    assert.ok(cap.rows.length > 0, "warn/error are still emitted in production");
    assertNoSentinels(serialize(cap.rows), "production console");
    for (const row of cap.rows) {
      assert.equal(typeof row[0], "string");
      assert.ok(["[auth/nativePhone]", "[app]"].includes(row[0] as string), `scope fell back safely: ${String(row[0])}`);
    }
  } finally {
    cap.restore();
    __setRuntimeSignalsForTests(null);
  }
}

// ---------------------------------------------------------------------------
// 2. Development logger: debug/info are printed but still classified.
// ---------------------------------------------------------------------------
{
  developmentSignals();
  const cap = captureConsole();
  try {
    driveLogger();
    assert.ok(cap.rows.length > 0);
    assertNoSentinels(serialize(cap.rows), "development console");
  } finally {
    cap.restore();
    __setRuntimeSignalsForTests(null);
  }
}

// ---------------------------------------------------------------------------
// 3. Crash wrapper: sentinels never reach the injected Crashlytics port, the
//    user id is a prefix only, and opt-out clears it.
// ---------------------------------------------------------------------------
{
  productionSignals();
  const cap = captureConsole();
  __resetCrashReportingForTests();
  const calls: { kind: string; payload: unknown }[] = [];
  let collectionEnabled: boolean | null = null;
  let userId: string | null = null;
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async (enabled) => {
      collectionEnabled = enabled;
      calls.push({ kind: "setCollection", payload: enabled });
    },
    log: (message) => calls.push({ kind: "log", payload: message }),
    recordError: (error) =>
      calls.push({ kind: "recordError", payload: { name: error.name, message: error.message, stack: error.stack } }),
    setUserId: (id) => {
      userId = id;
      calls.push({ kind: "setUserId", payload: id });
    },
  });
  try {
    // Disabled: nothing is forwarded, including identity.
    recordError(hostileError(), `ErrorBoundary ${OTP}`);
    crashLog(`log ${AUTH_HEADER} ${DOWNLOAD_URL}`);
    setUserId(UID_A);
    assert.equal(calls.filter((c) => c.kind !== "setCollection").length, 0, "disabled reporter forwards nothing");

    // Enabled with consent.
    setCrashReportingEnabled(true);
    assert.equal(collectionEnabled, true);
    setUserId(UID_A);
    assert.equal(userId, "", "app-supplied account ids are not sent");
    assert.notEqual(userId, UID_A);
    recordError(hostileError(), `ErrorBoundary ${OTP}`);
    recordError(hostileError(), "startup");
    crashLog(`log ${AUTH_HEADER} ${DOWNLOAD_URL} ${PHONE}`);
    crashLog("ErrorBoundary");

    const recorded = calls.filter((c) => c.kind === "recordError");
    assert.equal(recorded.length, 2);
    for (const row of recorded) {
      const payload = row.payload as { name: string; message: string; stack: string };
      assert.equal(payload.name, "SafeDiagnosticError");
      assert.match(payload.message, /^diagnostic:(unknown|unauthenticated|permission|unavailable|invalid|conflict)$/);
    }
    const logged = calls.filter((c) => c.kind === "log").map((c) => c.payload);
    for (const message of logged) {
      assert.ok(["ErrorBoundary", "startup", "app"].includes(String(message)), `crash log classified: ${String(message)}`);
    }
    assertNoSentinels(serialize(calls), "crashlytics port");

    // Opt-out (settings toggle / consent decline path calls only this).
    setCrashReportingEnabled(false);
    assert.equal(collectionEnabled, false);
    assert.equal(userId, "", "opt-out clears the pseudonymous user id");

    // Logout / account switch path.
    setCrashReportingEnabled(true);
    setUserId(UID_B);
    assert.equal(userId, "");
    clearUser();
    assert.equal(userId, "", "clearUser resets identity");
    setCrashReportingEnabled(false);
    clearUser();
    assert.equal(userId, "", "clearUser works while disabled");

    assertNoSentinels(serialize(calls), "crashlytics port after consent changes");
    assertNoSentinels(serialize(cap.rows), "console during crash reporting");
  } finally {
    cap.restore();
    __resetCrashReportingForTests();
    __setRuntimeSignalsForTests(null);
  }
}

// ---------------------------------------------------------------------------
// 4. Startup global handler: uncaught errors with sentinels never reach the
//    console sink; the failure listener receives only a bounded redacted copy.
// ---------------------------------------------------------------------------
{
  productionSignals();
  const cap = captureConsole();
  const g = globalThis as {
    ErrorUtils?: {
      getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
      setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
    };
  };
  const hadErrorUtils = Object.prototype.hasOwnProperty.call(g, "ErrorUtils");
  const previousErrorUtils = g.ErrorUtils;
  const installed: { handler: ((error: Error, isFatal?: boolean) => void) | null } = { handler: null };
  let previousCalled = 0;
  g.ErrorUtils = {
    getGlobalHandler: () => () => {
      previousCalled += 1;
    },
    setGlobalHandler: (next) => {
      installed.handler = next;
    },
  };
  const received: StartupDiagnostics[] = [];
  setStartupFailureListener((d) => received.push(d));
  try {
    installGlobalStartupHandlers();
    const handler = installed.handler;
    assert.ok(handler, "handler installed");
    handler(hostileError(), true);
    handler(Object.assign(new Error(`${AUTH_HEADER} ${JWT_LIKE} ${PHONE}`), { code: OTP }), false);
    assert.equal(previousCalled, 2, "previous handler chained");
    assert.equal(received.length, 2);
    assertNoSentinels(serialize(cap.rows), "console from global handler");
    for (const d of received) {
      assert.equal(d.errorCode, "UNCAUGHT_JS_ERROR");
      assert.ok(d.redactedMessage.length <= 280);
      assert.doesNotMatch(d.redactedMessage, /Bearer SENTINEL/);
      assert.doesNotMatch(d.redactedMessage, /eyJSENTINELHDR/);
      assert.doesNotMatch(d.redactedMessage, /9800011122/);
    }
  } finally {
    setStartupFailureListener(null);
    if (hadErrorUtils) g.ErrorUtils = previousErrorUtils;
    else delete g.ErrorUtils;
    cap.restore();
    __setRuntimeSignalsForTests(null);
  }
}

console.log("diagnosticSentinels.privacy.test.ts: ok (EXECUTED_PRODUCTION_METHOD / INJECTED)");
