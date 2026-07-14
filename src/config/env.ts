import {
  APP_BRAND_NAME,
  LEGAL_OPERATOR,
  PUBLIC_BRAND,
} from "./brand";
import {
  assertRuntimeBackendIsolation,
  buildResolvedEnvironment,
  type ActiveBackend,
  type ResolvedEnvironment,
  type RuntimeSignals,
} from "./runtimeEnvironment";

/**
 * Environment configuration.
 *
 * All EXPO_PUBLIC_* variables are inlined at build time by Expo.
 * Treat anything here as bundled into the client — never put secrets
 * that must remain server-side (e.g. Firebase Admin keys, SMS secrets).
 */

function readString(key: string, fallback = ""): string {
  // process.env access pattern is required for Expo's static inlining.
  const value = process.env[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function readRuntimeSignals(): RuntimeSignals {
  if (_testRuntimeSignals) {
    return _testRuntimeSignals;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require("expo-constants").default as {
      appOwnership?: string | null;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require("react-native") as {
      Platform: { OS: string };
    };
    return {
      appOwnership: Constants.appOwnership ?? null,
      isDev: typeof __DEV__ !== "undefined" ? __DEV__ : false,
      platform: Platform.OS,
    };
  } catch {
    return {
      appOwnership: null,
      isDev: typeof __DEV__ !== "undefined" ? __DEV__ : false,
      platform: "node",
    };
  }
}

let _testRuntimeSignals: RuntimeSignals | null = null;

/** Test-only override for runtime detection (Node unit tests). */
export function __setRuntimeSignalsForTests(signals: RuntimeSignals | null): void {
  _testRuntimeSignals = signals;
}

const firebaseConfig = {
  apiKey: readString("EXPO_PUBLIC_FIREBASE_API_KEY"),
  authDomain: readString("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: readString("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: readString("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: readString("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: readString("EXPO_PUBLIC_FIREBASE_APP_ID"),
  functionsRegion: readString("EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION", "asia-south1"),
};

function computeFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId &&
      firebaseConfig.messagingSenderId
  );
}

const resolvedEnvironment: ResolvedEnvironment = buildResolvedEnvironment({
  bundledAppModeRaw: readString("EXPO_PUBLIC_APP_MODE", "development"),
  devBackendRaw: readString("EXPO_PUBLIC_DEV_BACKEND", "local-mock"),
  firebaseConfigured: computeFirebaseConfigured(),
  signals: readRuntimeSignals(),
});

assertRuntimeBackendIsolation(resolvedEnvironment);

export const env = {
  /** Value bundled by Metro / EAS before runtime correction. */
  bundledAppMode: resolvedEnvironment.bundledAppMode,
  appMode: resolvedEnvironment.effectiveAppMode,
  runtimeKind: resolvedEnvironment.runtime,
  isProduction: resolvedEnvironment.isProduction,
  isDevelopment: resolvedEnvironment.isDevelopment,

  firebase: firebaseConfig,

  /** Optional override for PIN resolver (defaults to public postalpincode.in-style API). */
  expoPublicPincodeApiUrl: readString("EXPO_PUBLIC_PINCODE_API_URL"),

  brand: {
    appName: readString("EXPO_PUBLIC_APP_NAME", APP_BRAND_NAME),
    owner: readString("EXPO_PUBLIC_BRAND_OWNER", PUBLIC_BRAND),
    legalOperator: readString("EXPO_PUBLIC_LEGAL_OPERATOR", LEGAL_OPERATOR),
    privacyUrl: readString(
      "EXPO_PUBLIC_PRIVACY_URL",
      "https://vyaamikk.specialsoftwares.in/privacy"
    ),
    termsUrl: readString(
      "EXPO_PUBLIC_TERMS_URL",
      "https://vyaamikk.specialsoftwares.in/terms"
    ),
    /** Single public page hosting both Terms of Use and Privacy Policy. */
    legalUrl: readString(
      "EXPO_PUBLIC_LEGAL_URL",
      "https://vyaamikk.specialsoftwares.in/legal"
    ),
    supportEmail: readString(
      "EXPO_PUBLIC_SUPPORT_EMAIL",
      "support@specialsoftwares.in"
    ),
    /** Google Play / web account & data deletion request URL (required before store release). */
    accountDeletionUrl: readString(
      "EXPO_PUBLIC_ACCOUNT_DELETION_URL",
      "https://vyaamikk.specialsoftwares.in/delete-account"
    ),
    /** App Store / Play / landing page — used in business identity share text. */
    installUrl: readString(
      "EXPO_PUBLIC_APP_INSTALL_URL",
      "https://vyaamikk.specialsoftwares.in/download"
    ),
  },
} as const;

/**
 * True only if a complete Firebase web config is present. In production mode
 * without these values, the app must show a configuration error rather than
 * silently falling back to mock storage (which would lose data).
 */
export function isFirebaseConfigured(): boolean {
  return computeFirebaseConfigured();
}

export type { ActiveBackend };

export function getActiveBackend(): ActiveBackend {
  return resolvedEnvironment.getActiveBackend();
}

export function getResolvedEnvironment(): ResolvedEnvironment {
  return resolvedEnvironment;
}
