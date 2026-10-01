/**
 * Executed production createLogger with captured console.
 * Label: EXECUTED_PRODUCTION_METHOD
 */
import assert from "node:assert/strict";

import { __setRuntimeSignalsForTests } from "@/config/env";

import { createLogger } from "./logger";

const EMAIL = "alice.reviewer@example.invalid";
const DOC = "WIDGET-BATCH-Q7-LEDGER";
const QUERY = "SYNTHETIC_VALUE_Q7";
const PHONE = "+919876543210";
const HTML = "<!DOCTYPE html><html><body>" + "x".repeat(160) + DOC + "</body></html>";

function capture() {
  const errors: unknown[][] = [];
  const warns: unknown[][] = [];
  const logs: unknown[][] = [];
  const origError = console.error;
  const origWarn = console.warn;
  const origLog = console.log;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  console.warn = (...args: unknown[]) => {
    warns.push(args);
  };
  console.log = (...args: unknown[]) => {
    logs.push(args);
  };
  return {
    errors,
    warns,
    logs,
    restore() {
      console.error = origError;
      console.warn = origWarn;
      console.log = origLog;
    },
  };
}

function blob(rows: unknown[][]): string {
  return JSON.stringify(rows, (_k, v) => {
    if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
    return v;
  });
}

function assertClean(text: string): void {
  assert.doesNotMatch(text, /alice\.reviewer@example\.invalid/);
  assert.doesNotMatch(text, /WIDGET-BATCH-Q7-LEDGER/);
  assert.doesNotMatch(text, /SYNTHETIC_VALUE_Q7/);
  assert.doesNotMatch(text, /password=VALUE/);
  assert.doesNotMatch(text, /9876543210/);
  assert.doesNotMatch(text, /<!DOCTYPE html>/i);
}

function productionSignals() {
  process.env.EXPO_PUBLIC_APP_MODE = "production";
  __setRuntimeSignalsForTests({
    appOwnership: null,
    isDev: false,
    platform: "android",
  });
}

function developmentSignals() {
  process.env.EXPO_PUBLIC_APP_MODE = "development";
  __setRuntimeSignalsForTests({
    appOwnership: "expo",
    isDev: true,
    platform: "ios",
  });
}

productionSignals();
const sink = capture();
try {
  const log = createLogger("state/auth");
  log.debug("boot failed", { stage: "BOOT", notes: DOC });
  log.info("boot failed", { stage: "BOOT", notes: DOC });
  log.error(`save failed for ${EMAIL}`, { email: EMAIL, phone: PHONE, notes: DOC });
  log.warn("nested", { user: { email: EMAIL }, profile: { token: "tok_synthetic" } });
  log.error("url", { href: `https://example.invalid?api_key=${QUERY}` });
  log.error(`password=VALUE_SYNTH_9 api_key=${QUERY}`);
  log.error(HTML);
  log.error("autosave failed", {
    code: "save_failed",
    errorCode: "UNCAUGHT_JS_ERROR",
    firebaseAuthCode: "auth/invalid-email",
    notes: "%PDF-1.4 SYNTHETIC",
  });
  log.error(
    "boot failed",
    Object.assign(new Error(`Firebase ${EMAIL} ${DOC}`), {
      code: "auth/invalid-email",
      customData: { email: EMAIL },
    })
  );
  const leakScope = createLogger(`scope ${EMAIL} ${DOC}`);
  leakScope.error("boot failed", { stage: "AUTH_HYDRATED", count: 2, ms: 15, retryable: false });

  assert.equal(sink.logs.length, 0, "production suppresses debug/info");
  const all = blob(sink.errors.concat(sink.warns, sink.logs));
  assertClean(all);
  assert.doesNotMatch(all, /%PDF-1\.4/);

  const autosave = sink.errors.find((row) => JSON.stringify(row).includes("form_autosave_failed"));
  assert.ok(autosave);
  const autosavePayload = autosave![2] as {
    event?: string;
    code?: string;
    errorCode?: string;
    firebaseAuthCode?: string;
  };
  assert.equal(autosavePayload.event, "form_autosave_failed");
  assert.equal(autosavePayload.code, "save_failed");
  assert.equal(autosavePayload.errorCode, "UNCAUGHT_JS_ERROR");
  assert.equal(autosavePayload.firebaseAuthCode, "auth/invalid-email");

  const boot = sink.errors.find((row) => JSON.stringify(row).includes("auth_boot_failed"));
  assert.ok(boot, "known message maps to auth_boot_failed");
  assert.equal(boot![1], "auth boot failed");
  const payload = boot![2] as { event: string; errorClass?: string; code?: string };
  assert.equal(payload.event, "auth_boot_failed");
  assert.equal(payload.errorClass, "invalid");
  assert.equal(payload.code, "auth/invalid-email");

  const scoped = sink.errors.find((row) => row[0] === "[app]");
  assert.ok(scoped, "unknown scope falls back to app");
  const scopedPayload = scoped![2] as { stage?: string; count?: number; ms?: number };
  assert.equal(scopedPayload.stage, "AUTH_HYDRATED");
  assert.equal(scopedPayload.count, 2);
  assert.equal(scopedPayload.ms, 15);

  const unclassified = sink.errors.find((row) => JSON.stringify(row).includes("unclassified"));
  assert.ok(unclassified, "unknown messages become unclassified");
  assert.equal(unclassified![1], "diagnostic_event");
} finally {
  sink.restore();
  __setRuntimeSignalsForTests(null);
}

{
  productionSignals();
  const cap = capture();
  try {
    const log = createLogger("state/auth");
    log.error("boot failed", {
      code: "WIDGET-BATCH-Q7-LEDGER",
      attemptId: "SYNTHETIC_VALUE_Q7",
      event: "SYNTHETIC_VALUE_Q7",
      op: "save",
      count: 4,
      ms: 12,
      kind: "failed",
    });
    const text = blob(cap.errors);
    assertClean(text);
    assert.equal(cap.errors.length, 1);
    const payload = cap.errors[0]![2] as Record<string, unknown>;
    assert.equal(payload.event, "auth_boot_failed");
    assert.equal(payload.code, undefined);
    assert.equal(payload.attemptId, undefined);
    assert.equal(payload.op, "save");
    assert.equal(payload.count, 4);
    assert.equal(payload.ms, 12);
    assert.equal(payload.kind, "failed");
  } finally {
    cap.restore();
    __setRuntimeSignalsForTests(null);
  }
}

{
  productionSignals();
  const cap = capture();
  try {
    const log = createLogger("state/auth");
    log.error("boot failed", JSON.parse('{"constructor":"SYNTHETIC_VALUE_Q7"}'));
    log.error("boot failed", JSON.parse('{"toString":"WIDGET-BATCH-Q7-LEDGER"}'));
    log.error("toString");
    log.error("constructor");
    const inherited = Object.create({
      code: "WIDGET-BATCH-Q7-LEDGER",
      count: 99,
    });
    inherited.stage = "BOOT";
    log.error("boot failed", inherited);
    const protoObj: Record<string, unknown> = { op: "retry" };
    Object.defineProperty(protoObj, "__proto__", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: { code: QUERY },
    });
    log.error("boot failed", protoObj);
    const text = blob(cap.errors);
    assertClean(text);
    const withStage = cap.errors.find((row) => {
      const p = row[2] as { stage?: string; event?: string };
      return p.stage === "BOOT" && p.event === "auth_boot_failed";
    });
    assert.ok(withStage);
    assert.equal((withStage![2] as { count?: number }).count, undefined);
    const protoSafe = cap.errors.find((row) => (row[2] as { op?: string }).op === "retry");
    assert.ok(protoSafe);
    assert.equal((protoSafe![2] as { code?: string }).code, undefined);
    assert.ok(cap.errors.some((row) => row[1] === "diagnostic_event"));
  } finally {
    cap.restore();
    __setRuntimeSignalsForTests(null);
  }
}

{
  productionSignals();
  const cap = capture();
  try {
    let allowedGets = 0;
    let unknownGets = 0;
    let nameGets = 0;
    let codeGets = 0;
    const data: Record<string, unknown> = { stage: "SYNC_READY" };
    Object.defineProperty(data, "count", {
      enumerable: true,
      get() {
        allowedGets += 1;
        return 7;
      },
    });
    Object.defineProperty(data, "notes", {
      enumerable: true,
      get() {
        unknownGets += 1;
        return DOC;
      },
    });
    const hostile = {
      stage: "BOOT",
      toJSON() {
        return { code: QUERY, notes: DOC };
      },
      toString() {
        return `hostile ${EMAIL}`;
      },
      valueOf() {
        return QUERY;
      },
    };
    const accessorErr = new Error("plain");
    Object.defineProperty(accessorErr, "name", {
      configurable: true,
      get() {
        nameGets += 1;
        return `AppError ${DOC}`;
      },
    });
    Object.defineProperty(accessorErr, "code", {
      configurable: true,
      get() {
        codeGets += 1;
        return "permission_denied";
      },
    });
    const log = createLogger("state/auth");
    log.error("boot failed", data);
    log.error("boot failed", hostile);
    log.error("boot failed", accessorErr);
    const cyclic: Record<string, unknown> = { op: "sync" };
    cyclic.self = cyclic;
    log.error("boot failed", cyclic);
    log.error("boot failed", { code: "unknown", extra: "x".repeat(8000) });
    const proxy = new Proxy(
      { stage: "BOOT" },
      {
        getOwnPropertyDescriptor(target, prop) {
          if (prop === "count") throw new Error(`desc ${QUERY}`);
          return Reflect.getOwnPropertyDescriptor(target, prop);
        },
      }
    );
    log.error("boot failed", proxy);
    assert.equal(allowedGets, 0, "allowed-key getter must not run");
    assert.equal(unknownGets, 0, "unknown-key getter must not run");
    assert.equal(nameGets, 0, "Error name accessor must not run");
    assert.equal(codeGets, 0, "Error code accessor must not run");
    const text = blob(cap.errors);
    assertClean(text);
    assert.ok(cap.errors.some((row) => (row[2] as { stage?: string }).stage === "SYNC_READY"));
    assert.ok(cap.errors.some((row) => (row[2] as { op?: string }).op === "sync"));
  } finally {
    cap.restore();
    __setRuntimeSignalsForTests(null);
  }
}

{
  productionSignals();
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  const supplied = Object.assign(new Error(`keep ${EMAIL}`), { customData: { email: EMAIL } });
  const data = { stage: "BOOT" as const, notes: DOC };
  console.error = () => {
    throw new Error("SYNTHETIC_SINK_FAILURE");
  };
  console.warn = () => {
    throw new Error("SYNTHETIC_SINK_FAILURE");
  };
  console.log = () => {
    throw new Error("SYNTHETIC_SINK_FAILURE");
  };
  const log = createLogger("state/auth");
  assert.doesNotThrow(() => log.error("boot failed", data));
  assert.doesNotThrow(() => log.warn("boot failed", supplied));
  assert.doesNotThrow(() => log.debug("boot failed", data));
  assert.doesNotThrow(() => log.info("boot failed", data));
  assert.equal(supplied.message.includes(EMAIL), true);
  assert.equal(data.stage, "BOOT");
  console.error = originalError;
  console.warn = originalWarn;
  console.log = originalLog;
  __setRuntimeSignalsForTests(null);
}

{
  developmentSignals();
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  console.error = () => {
    throw new Error("SYNTHETIC_SINK_FAILURE");
  };
  console.warn = () => {
    throw new Error("SYNTHETIC_SINK_FAILURE");
  };
  console.log = () => {
    throw new Error("SYNTHETIC_SINK_FAILURE");
  };
  const log = createLogger("state/auth");
  assert.doesNotThrow(() => log.debug("boot failed"));
  assert.doesNotThrow(() => log.info("boot failed"));
  assert.doesNotThrow(() => log.warn("pdf generate failed"));
  assert.doesNotThrow(() => log.error("pdf share failed"));
  console.error = originalError;
  console.warn = originalWarn;
  console.log = originalLog;
  __setRuntimeSignalsForTests(null);
}

console.log("logger.privacy.test.ts: ok (EXECUTED_PRODUCTION_METHOD)");
