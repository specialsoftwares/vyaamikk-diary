import {
  APP_BRAND_NAME,
  LEGAL_OPERATOR,
  PUBLIC_BRAND,
} from "./brand";

/**
 * Environment configuration.
 *
 * All EXPO_PUBLIC_* variables are inlined at build time by Expo.
 * Treat anything here as bundled into the client — never put secrets
 * that must remain server-side (e.g. Firebase Admin keys, SMS secrets).
 */

type AppMode = "development" | "production";

function readString(key: string, fallback = ""): string {
  // process.env access pattern is required for Expo's static inlining.
  const value = process.env[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

const rawMode = readString("EXPO_PUBLIC_APP_MODE", "development");
const APP_MODE: AppMode = rawMode === "production" ? "production" : "development";

export const env = {
  appMode: APP_MODE,
  isProduction: APP_MODE === "production",
  isDevelopment: APP_MODE === "development",

  firebase: {
    apiKey: readString("EXPO_PUBLIC_FIREBASE_API_KEY"),
    authDomain: readString("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: readString("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: readString("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: readString("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId: readString("EXPO_PUBLIC_FIREBASE_APP_ID"),
    /** Cloud Functions region (default asia-south1 for India). */
    functionsRegion: readString("EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION", "asia-south1"),
  },

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
  const f = env.firebase;
  return Boolean(
    f.apiKey && f.authDomain && f.projectId && f.appId && f.messagingSenderId
  );
}

/**
 * Which backend the auth + diary layers are actually using right now.
 *
 *   • "firebase-production" — real Firebase Auth + Firestore.
 *   • "firebase-shared-dev" — mock OTP (`123456`) + real Firestore. The
 *     correct mode for cross-device dev testing.
 *   • "local-mock"          — mock OTP + AsyncStorage. Single-device dev;
 *     profile data does NOT sync across devices.
 *   • "not-configured"      — production mode requested but Firebase
 *     config is missing.
 *
 * Screens can render a small banner using this so testers always know
 * which world they're in.
 */
export type ActiveBackend =
  | "firebase-production"
  | "firebase-shared-dev"
  | "local-mock"
  | "not-configured";

export function getActiveBackend(): ActiveBackend {
  if (env.isProduction) {
    return isFirebaseConfigured() ? "firebase-production" : "not-configured";
  }
  return isFirebaseConfigured() ? "firebase-shared-dev" : "local-mock";
}
