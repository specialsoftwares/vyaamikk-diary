import {
  APP_BRAND_NAME,
  LEGAL_OPERATOR,
  PUBLIC_BRAND,
} from "./brand";
import {
  buildResolvedEnvironment,
  type ActiveBackend,
  type ResolvedEnvironment,
  type RuntimeKind,
  type RuntimeSignals,
} from "./runtimeEnvironment";

/**
 * Environment configuration.
 *
 * All EXPO_PUBLIC_* variables are inlined at build time by Expo Metro.
 * Treat anything here as bundled into the client — never put secrets
 * that must remain server-side (e.g. Firebase Admin keys, SMS secrets).
 *
 * CRITICAL: every EXPO_PUBLIC_* read MUST use static dot access
 * (`process.env.EXPO_PUBLIC_FOO`). Dynamic `process.env[key]` is not
 * inlined and ships empty in release APKs, which trips productionGuard
 * and crashes standalone launches ("keeps stopping").
 */

function readPublicEnv(value: string | undefined, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

let _testRuntimeSignals: RuntimeSignals | null = null;

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

const firebaseConfig = {
  apiKey: readPublicEnv(process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
  authDomain: readPublicEnv(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: readPublicEnv(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: readPublicEnv(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: readPublicEnv(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: readPublicEnv(process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
  functionsRegion: readPublicEnv(
    process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION,
    "asia-south1"
  ),
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

function rebuildResolvedEnvironment(): ResolvedEnvironment {
  return buildResolvedEnvironment({
    bundledAppModeRaw: readPublicEnv(process.env.EXPO_PUBLIC_APP_MODE, "development"),
    devBackendRaw: readPublicEnv(process.env.EXPO_PUBLIC_DEV_BACKEND, "local-mock"),
    firebaseConfigured: computeFirebaseConfigured(),
    signals: readRuntimeSignals(),
  });
}

/**
 * Module-scope resolution must NEVER throw — uncaught throws here terminate
 * the Android process before any React error boundary mounts. Soft-fail into
 * a degraded production-like environment; the startup coordinator surfaces a
 * controlled Startup Failure screen.
 */
let envModuleError: Error | null = null;

function buildDegradedEnvironment(runtime: RuntimeKind): ResolvedEnvironment {
  return {
    runtime,
    bundledAppMode: "production",
    effectiveAppMode: "production",
    isProduction: true,
    isDevelopment: false,
    getActiveBackend: () => "not-configured",
  };
}

function resolveEnvironmentSafely(): ResolvedEnvironment {
  try {
    envModuleError = null;
    return rebuildResolvedEnvironment();
  } catch (e) {
    envModuleError = e instanceof Error ? e : new Error(String(e));
    const signals = readRuntimeSignals();
    const runtime =
      signals.appOwnership === "expo"
        ? "expo-go"
        : signals.platform === "web"
          ? signals.isDev
            ? "web-dev"
            : "web-production"
          : signals.isDev
            ? "development-client"
            : "store-or-standalone";
    return buildDegradedEnvironment(runtime);
  }
}

let resolvedEnvironment: ResolvedEnvironment = resolveEnvironmentSafely();

export function getEnvModuleError(): Error | null {
  return envModuleError;
}

/** Test-only override for runtime detection (Node unit tests). */
export function __setRuntimeSignalsForTests(signals: RuntimeSignals | null): void {
  _testRuntimeSignals = signals;
  resolvedEnvironment = resolveEnvironmentSafely();
}

/**
 * Live getters for runtime-resolved fields — must not be snapshotted at
 * module load or test overrides / soft-fail rebuilds go stale and skip
 * production guards (which previously allowed not-configured to "succeed").
 */
export const env = {
  get bundledAppMode() {
    return resolvedEnvironment.bundledAppMode;
  },
  get appMode() {
    return resolvedEnvironment.effectiveAppMode;
  },
  get runtimeKind() {
    return resolvedEnvironment.runtime;
  },
  get isProduction() {
    return resolvedEnvironment.isProduction;
  },
  get isDevelopment() {
    return resolvedEnvironment.isDevelopment;
  },

  firebase: firebaseConfig,

  /** Optional override for PIN resolver (defaults to public postalpincode.in-style API). */
  expoPublicPincodeApiUrl: readPublicEnv(process.env.EXPO_PUBLIC_PINCODE_API_URL),

  /**
   * Explicit Internal/dev diagnostic panels. Production Play stays off unless
   * this is bundled as "1" — Internal Testing must not leak debug UI by default.
   */
  get internalAuthDiagnostics() {
    return readPublicEnv(process.env.EXPO_PUBLIC_INTERNAL_AUTH_DIAGNOSTICS, "") === "1";
  },

  brand: {
    appName: readPublicEnv(process.env.EXPO_PUBLIC_APP_NAME, APP_BRAND_NAME),
    owner: readPublicEnv(process.env.EXPO_PUBLIC_BRAND_OWNER, PUBLIC_BRAND),
    legalOperator: readPublicEnv(
      process.env.EXPO_PUBLIC_LEGAL_OPERATOR,
      LEGAL_OPERATOR
    ),
    /**
     * Authoritative production origin (published):
     * https://vyaamikk.specialsoftwares.com — see docs/WEBSITE_STORE_INTEGRATION.md.
     */
    websiteUrl: readPublicEnv(
      process.env.EXPO_PUBLIC_WEBSITE_URL,
      "https://vyaamikk.specialsoftwares.com"
    ),
    privacyUrl: readPublicEnv(
      process.env.EXPO_PUBLIC_PRIVACY_URL,
      "https://vyaamikk.specialsoftwares.com/privacy"
    ),
    termsUrl: readPublicEnv(
      process.env.EXPO_PUBLIC_TERMS_URL,
      "https://vyaamikk.specialsoftwares.com/terms"
    ),
    /**
     * Legal hub / website home. Site has no combined `/legal` route —
     * default points at `/` (home). Prefer privacy + terms for policy links.
     */
    legalUrl: readPublicEnv(
      process.env.EXPO_PUBLIC_LEGAL_URL,
      "https://vyaamikk.specialsoftwares.com/"
    ),
    supportUrl: readPublicEnv(
      process.env.EXPO_PUBLIC_SUPPORT_URL,
      "https://vyaamikk.specialsoftwares.com/support"
    ),
    contactUrl: readPublicEnv(
      process.env.EXPO_PUBLIC_CONTACT_URL,
      "https://vyaamikk.specialsoftwares.com/contact"
    ),
    /** Approved product support mailbox. */
    supportEmail: readPublicEnv(
      process.env.EXPO_PUBLIC_SUPPORT_EMAIL,
      "support.vyd@specialsoftwares.com"
    ),
    /** Google Play / web account & data deletion request URL. */
    accountDeletionUrl: readPublicEnv(
      process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL,
      "https://vyaamikk.specialsoftwares.com/delete-account"
    ),
    /**
     * Pre-launch download / launch-status page (not a live App Store or Play
     * Store listing). Used in share text until store URLs are live.
     */
    installUrl: readPublicEnv(
      process.env.EXPO_PUBLIC_APP_INSTALL_URL,
      "https://vyaamikk.specialsoftwares.com/download"
    ),
    /** Empty until a real App Store listing exists — never render as an active store badge. */
    appStoreUrl: readPublicEnv(process.env.EXPO_PUBLIC_APP_STORE_URL, ""),
    /** Empty until a real Play Store listing exists — never render as an active store badge. */
    playStoreUrl: readPublicEnv(process.env.EXPO_PUBLIC_PLAY_STORE_URL, ""),
  },
};

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
