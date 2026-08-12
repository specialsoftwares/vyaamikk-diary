/**
 * Authoritative startup stages and diagnostic shapes.
 * Diagnostics must never include secrets, tokens, paths, or PII.
 */

export type StartupStage =
  | "BOOT"
  | "CONFIG_LOADED"
  | "RUNTIME_RESOLVED"
  | "NATIVE_FIREBASE_READY"
  | "JS_FIREBASE_READY"
  | "LOCAL_DB_OPENED"
  | "LOCAL_DB_MIGRATED"
  | "AUTH_HYDRATED"
  | "SYNC_READY"
  | "ROUTER_READY";

export type StartupErrorCode =
  | "ENV_RESOLUTION_FAILED"
  | "RUNTIME_ISOLATION_FAILED"
  | "PRODUCTION_CONFIG_INVALID"
  | "LOCAL_MOCK_FORBIDDEN"
  | "FIREBASE_JS_MISSING"
  | "FIREBASE_JS_INIT_FAILED"
  | "FIREBASE_NATIVE_MISSING"
  | "FIREBASE_PROJECT_MISMATCH"
  | "LOCAL_DB_OPEN_FAILED"
  | "LOCAL_DB_MIGRATE_FAILED"
  | "PROVIDER_TREE_INVALID"
  | "UNCAUGHT_JS_ERROR"
  | "UNKNOWN";

export interface FirebaseVarPresence {
  EXPO_PUBLIC_FIREBASE_API_KEY: boolean;
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: boolean;
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: boolean;
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: boolean;
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: boolean;
  EXPO_PUBLIC_FIREBASE_APP_ID: boolean;
  EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION: boolean;
}

export interface StartupDiagnostics {
  buildVersion: string;
  versionCode: string;
  runtimeClass: string;
  appMode: string;
  backend: string;
  firebaseVarPresence: FirebaseVarPresence;
  nativeFirebaseDefaultApp: boolean | "unknown";
  jsFirebaseInitialized: boolean;
  failedStage: StartupStage;
  errorCode: StartupErrorCode;
  redactedMessage: string;
  checkpoints: StartupStage[];
}

export type StartupOutcome =
  | { ok: true; checkpoints: StartupStage[]; diagnostics: StartupDiagnostics }
  | { ok: false; diagnostics: StartupDiagnostics };
