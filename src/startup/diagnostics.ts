import { env, isFirebaseConfigured } from "@/config/env";
import type {
  FirebaseVarPresence,
  StartupDiagnostics,
  StartupErrorCode,
  StartupStage,
} from "./types";
import { redactStartupMessage } from "./errors";

function present(value: string | undefined): boolean {
  return typeof value === "string" && value.length > 0;
}

function readExpoConstants(): {
  version?: string;
  androidVersionCode?: number;
  nativeAppVersion?: string | null;
  nativeBuildVersion?: string | null;
} {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require("expo-constants").default as {
      expoConfig?: { version?: string; android?: { versionCode?: number } };
      nativeAppVersion?: string | null;
      nativeBuildVersion?: string | null;
    };
    return {
      version: Constants.expoConfig?.version,
      androidVersionCode: Constants.expoConfig?.android?.versionCode,
      nativeAppVersion: Constants.nativeAppVersion,
      nativeBuildVersion: Constants.nativeBuildVersion,
    };
  } catch {
    return {};
  }
}

export function readFirebaseVarPresence(): FirebaseVarPresence {
  // Static reads only — Metro must inline these in release bundles.
  return {
    EXPO_PUBLIC_FIREBASE_API_KEY: present(process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: present(
      process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
    ),
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: present(
      process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID
    ),
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: present(
      process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
    ),
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: present(
      process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
    ),
    EXPO_PUBLIC_FIREBASE_APP_ID: present(process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
    EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION: present(
      process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION
    ),
  };
}

export function readBuildVersion(): string {
  const c = readExpoConstants();
  return c.version ?? c.nativeAppVersion ?? "1.0.0";
}

export function readVersionCode(): string {
  const c = readExpoConstants();
  if (typeof c.androidVersionCode === "number") return String(c.androidVersionCode);
  if (c.nativeBuildVersion) return String(c.nativeBuildVersion);
  return "unknown";
}

export function probeNativeFirebaseDefaultApp(): boolean | "unknown" {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-firebase/app") as {
      getApps?: () => unknown[];
      default?: { apps?: unknown[] };
    };
    if (typeof mod.getApps === "function") {
      return mod.getApps().length > 0;
    }
    const apps = mod.default?.apps;
    if (Array.isArray(apps)) return apps.length > 0;
    return "unknown";
  } catch {
    return "unknown";
  }
}

export function buildDiagnostics(input: {
  failedStage: StartupStage;
  errorCode: StartupErrorCode;
  message: string;
  checkpoints: StartupStage[];
  jsFirebaseInitialized?: boolean;
  nativeFirebaseDefaultApp?: boolean | "unknown";
  runtimeClass?: string;
  appMode?: string;
  backend?: string;
}): StartupDiagnostics {
  return {
    buildVersion: readBuildVersion(),
    versionCode: readVersionCode(),
    runtimeClass: input.runtimeClass ?? env.runtimeKind,
    appMode: input.appMode ?? env.appMode,
    backend: input.backend ?? "unknown",
    firebaseVarPresence: readFirebaseVarPresence(),
    nativeFirebaseDefaultApp:
      input.nativeFirebaseDefaultApp ??
      (input.jsFirebaseInitialized !== undefined
        ? "unknown"
        : probeNativeFirebaseDefaultApp()),
    jsFirebaseInitialized:
      input.jsFirebaseInitialized ?? isFirebaseConfigured(),
    failedStage: input.failedStage,
    errorCode: input.errorCode,
    redactedMessage: redactStartupMessage(input.message),
    checkpoints: [...input.checkpoints],
  };
}

export function formatDiagnosticsPlainText(d: StartupDiagnostics): string {
  const vars = Object.entries(d.firebaseVarPresence)
    .map(([k, v]) => `  ${k}=${v ? "present" : "missing"}`)
    .join("\n");
  return [
    "Vyaamikk Diary — Startup Diagnostics",
    `version=${d.buildVersion}`,
    `versionCode=${d.versionCode}`,
    `runtime=${d.runtimeClass}`,
    `appMode=${d.appMode}`,
    `backend=${d.backend}`,
    `nativeFirebaseDefaultApp=${String(d.nativeFirebaseDefaultApp)}`,
    `jsFirebaseInitialized=${String(d.jsFirebaseInitialized)}`,
    `failedStage=${d.failedStage}`,
    `errorCode=${d.errorCode}`,
    `message=${d.redactedMessage}`,
    `checkpoints=${d.checkpoints.join(">") || "(none)"}`,
    "firebaseVarPresence:",
    vars,
  ].join("\n");
}
