/**
 * Isolated diagnostic: import ACTUAL logger.ts and crashReporter.ts.
 * Extract RootErrorBoundary.componentDidCatch from source (no React mount).
 * Synthetic data only (@example.invalid). Captured console + injected Crashlytics.
 *
 * Cursor executed this. Independent reviewer must re-run to reproduce.
 */
import Module from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

declare global {
  const __DEV__: boolean;
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Node's public Module type does not include the loader hook this diagnostic
 * uses to substitute Crashlytics. The hook stays; only the type is local.
 * This file is typechecked by analysis/grin-slice2-closeout/tsconfig.json
 * because tsx executes the `.ts` import specifiers below. The Expo app
 * tsconfig rejects those specifiers, so the app check excludes this file
 * and ci:verify runs the dedicated check. The script is not dropped.
 */
type NodeModuleLoader = {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

const crashSink: Array<{ kind: string; payload: unknown }> = [];

const nativeCrashlytics = {
  setCrashlyticsCollectionEnabled: async (enabled: boolean) => {
    crashSink.push({ kind: "setCrashlyticsCollectionEnabled", payload: enabled });
  },
  log: (message: string) => {
    crashSink.push({ kind: "log", payload: message });
  },
  recordError: (error: Error) => {
    crashSink.push({
      kind: "recordError",
      payload: {
        name: error.name,
        message: error.message,
        stack: error.stack ?? null,
        cause:
          error.cause instanceof Error
            ? { name: error.cause.name, message: error.cause.message }
            : error.cause ?? null,
      },
    });
  },
  setUserId: (id: string) => {
    crashSink.push({ kind: "setUserId", payload: id });
  },
};

const moduleLoader = Module as unknown as NodeModuleLoader;
const load = moduleLoader._load.bind(Module);
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === "@react-native-firebase/crashlytics") {
    return { default: () => nativeCrashlytics };
  }
  return load(request, parent, isMain);
};

process.env.EXPO_PUBLIC_APP_MODE = "production";

const consoleError: unknown[][] = [];
const consoleWarn: unknown[][] = [];
const origError = console.error;
const origWarn = console.warn;
console.error = (...args: unknown[]) => {
  consoleError.push(args);
};
console.warn = (...args: unknown[]) => {
  consoleWarn.push(args);
};

async function main(): Promise<void> {
const { __setRuntimeSignalsForTests } = await import("../../src/config/env.ts");
__setRuntimeSignalsForTests({
  appOwnership: null,
  isDev: false,
  platform: "android",
});

const { env } = await import("../../src/config/env.ts");
const { createLogger } = await import("../../src/utils/logger.ts");
const crash = await import("../../src/services/telemetry/crashReporter.ts");

const boundarySrc = readFileSync(join(repoRoot, "src/startup/RootErrorBoundary.tsx"), "utf8");
const extracted = /componentDidCatch\(error: Error, info: ErrorInfo\): void \{([\s\S]*?)\n  \}/.exec(
  boundarySrc
);
assert.ok(extracted, "failed to extract RootErrorBoundary.componentDidCatch from source");
assert.match(extracted[1]!, /console\.error\("\[RootErrorBoundary\]", error\?\.message/);
assert.match(extracted[1]!, /recordError\(error, "ErrorBoundary"\)/);

function componentDidCatch(error: Error, info: { componentStack?: string }): void {
  console.error("[RootErrorBoundary]", error?.message, info?.componentStack);
  crash.recordError(error, "ErrorBoundary");
}

const EMAIL = "alice.reviewer@example.invalid";
const PHONE = "+919876543210";
const TOKEN = "tok_synthetic_review_only";
const DOC = "users/synthetic-doc-marker/profile";
const URL = "https://example.invalid/callback?api_key=sk_test_not_real&token=abc";

function jsonish(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_k, v) => {
    if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack ?? null };
    if (v && typeof v === "object") {
      if (seen.has(v as object)) return "[cycle]";
      seen.add(v as object);
    }
    return v;
  });
}

type Row = { id: string; observed: boolean; detail: string };
const rows: Row[] = [];
function note(id: string, observed: boolean, detail: string) {
  rows.push({ id, observed, detail });
}

assert.equal(env.isProduction, true, "must exercise production emit path");

const log = createLogger("security-repro");

log.error(`save failed for ${EMAIL}`, { email: EMAIL, phone: PHONE });
{
  const blob = jsonish(consoleError.at(-1));
  note("L1_email_in_message", blob.includes(EMAIL), `console.error retained synthetic email=${blob.includes(EMAIL)}`);
  note("L1_email_key", blob.includes(EMAIL), "structured email key is not in SENSITIVE_KEY");
  note("L1_phone_masked", blob.includes("***") && !blob.includes("9876543210"), `phone masking blob=${blob}`);
}

log.warn("nested", { user: { email: EMAIL, profile: { token: TOKEN, document: DOC } } });
{
  const blob = jsonish(consoleWarn.at(-1));
  note("L2_nested_email", blob.includes(EMAIL), `nested email retained=${blob.includes(EMAIL)}`);
  note("L2_token_redacted", blob.includes("[redacted]") && !blob.includes(TOKEN), "token key redacted");
  note("L2_document_key", blob.includes(DOC), "non-sensitive key document retained");
}

log.error("url", { href: URL });
note(
  "L3_url_query",
  jsonish(consoleError.at(-1)).includes("sk_test_not_real"),
  "URL query on non-sensitive key href is not stripped"
);

const cyclic: Record<string, unknown> = { email: EMAIL };
cyclic.self = cyclic;
log.error("cyclic", cyclic);
note("L4_cyclic", true, "cyclic payload did not throw (depth cap)");

log.error("pdf-key", { html: "<html><body>" + "x".repeat(200) + "</body></html>" });
note("L5_html_key", jsonish(consoleError.at(-1)).includes("[redacted]"), "html key redacted");

log.error("pdf-looks-like", "<!DOCTYPE html>" + "y".repeat(130));
note(
  "L6_pdf_data",
  jsonish(consoleError.at(-1)).includes("[redacted:pdf-html]"),
  "PDF-like DATA string redacted by looksLikePdfHtml"
);
log.error("<!DOCTYPE html>" + "y".repeat(130));
note(
  "L6_pdf_message",
  jsonish(consoleError.at(-1)).includes("<!DOCTYPE html>"),
  "PDF-like content in the message argument is not sanitized"
);

const oversized = "z".repeat(12_000);
log.error("oversized", { note: oversized });
note(
  "L7_oversized",
  jsonish(consoleError.at(-1)).includes("z".repeat(100)),
  "non-html strings are not size-capped by logger sanitize (pdfSafeLog caps at 4000)"
);

const firebaseShaped = Object.assign(new Error(`Firebase: ${EMAIL} already in use`), {
  code: "auth/email-already-in-use",
  customData: { email: EMAIL },
});
log.error("boot failed", firebaseShaped);
{
  const blob = jsonish(consoleError.at(-1));
  note(
    "L8_error_object_email",
    blob.includes(EMAIL),
    `enumerable Error.customData.email retained=${blob.includes(EMAIL)}; Error.message enumerable=${blob.includes("already in use")}`
  );
}

crash.recordError(new Error(`disabled path ${EMAIL}`), "pre-consent");
note("C0_disabled", crashSink.length === 0, `disabled sink size=${crashSink.length}`);

crash.setCrashReportingEnabled(true);
crash.recordError(new Error(`enabled path ${EMAIL}`), "ErrorBoundary");
const recorded = crashSink.filter((row) => row.kind === "recordError");
note("C1_enabled_count", recorded.length === 1, `recordError count=${recorded.length}`);
note(
  "C1_original_error",
  JSON.stringify(recorded[0]?.payload).includes(EMAIL),
  "enabled Crashlytics received original Error.message with synthetic email"
);

const cause = new Error("provider cause");
(cause as Error & { cause?: unknown }).cause = { email: EMAIL };
const wrapped = new Error(`boundary ${EMAIL}`);
(wrapped as Error & { cause?: unknown }).cause = cause;
crash.recordError(wrapped, "ErrorBoundary");
note(
  "C2_wrapped",
  JSON.stringify(crashSink.at(-1)).includes(EMAIL),
  "wrapped Error.message forwarded; cause object is not walked by recordError"
);

consoleError.length = 0;
const priorCrash = crashSink.length;
const boundaryErr = new Error(`render failed for ${EMAIL}`);
componentDidCatch(boundaryErr, { componentStack: "\n    in Fake\n" });
{
  const blob = jsonish(consoleError);
  note("B1_console_email", blob.includes(EMAIL), `extracted componentDidCatch console kept email=${blob.includes(EMAIL)}`);
  note("B2_prefix", blob.includes("[RootErrorBoundary]"), "used actual source console prefix");
  note(
    "B3_forwards_error",
    crashSink.length > priorCrash && JSON.stringify(crashSink.at(-1)).includes(EMAIL),
    "ErrorBoundary path forwarded the original Error to recordError after consent"
  );
}

console.error = origError;
console.warn = origWarn;

const report = {
  executor: "Cursor ran this experiment against worktree source via tsx. Independent reviewer must re-run logging-repro.ts to reproduce.",
  sourceFiles: [
    "src/utils/logger.ts",
    "src/services/telemetry/crashReporter.ts",
    "src/startup/RootErrorBoundary.tsx (extracted componentDidCatch only)",
  ],
  envIsProduction: env.isProduction,
  rows,
  crashSinkKinds: crashSink.map((row) => row.kind),
};
console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error = origError;
  console.warn = origWarn;
  console.error(error);
  process.exit(1);
});
