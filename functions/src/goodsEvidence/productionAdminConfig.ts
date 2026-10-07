/**
 * Resolve and validate the Admin app, GCP project, and Storage bucket together.
 *
 * Precedence (first present wins; contradictory values fail closed):
 * 1. GRIN_ADMIN_PROJECT / GRIN_ADMIN_STORAGE_BUCKET (explicit override)
 * 2. FIREBASE_STORAGE_BUCKET (bucket only)
 * 3. FIREBASE_CONFIG JSON projectId / storageBucket (Firebase runtime)
 * 4. GCLOUD_PROJECT / GCLOUD_PROJECT_ID (project only)
 * 5. Existing default Admin app options, when still missing
 *
 * Isolated emulator project/bucket constants are documentation + explicit
 * GRIN_ADMIN_* values. They are not a production fallback.
 *
 * Do not print FIREBASE_CONFIG or process.env.
 */
export const ISOLATED_FUNCTIONS_PROJECT = "demo-vyaamikk-grin-t1";
export const ISOLATED_STORAGE_BUCKET = `${ISOLATED_FUNCTIONS_PROJECT}.appspot.com`;

export const GRIN_ADMIN_DEFAULT_APP_NAME = "[DEFAULT]";

export const GRIN_ADMIN_CONFIG_CODES = {
  missing: "grin_admin_config_missing",
  malformed: "grin_admin_config_malformed",
  conflict: "grin_admin_config_conflict",
  no_default_app: "grin_admin_config_no_default_app",
} as const;

export type GrinAdminConfigCode =
  (typeof GRIN_ADMIN_CONFIG_CODES)[keyof typeof GRIN_ADMIN_CONFIG_CODES];

export class GrinAdminConfigError extends Error {
  readonly code: GrinAdminConfigCode;

  constructor(code: GrinAdminConfigCode) {
    super(code);
    this.name = "GrinAdminConfigError";
    this.code = code;
  }
}

export type GrinAdminAppLike = {
  name: string;
  options: {
    projectId?: string;
    storageBucket?: string;
  };
};

export type GrinAdminAppPorts = {
  getApps(): readonly GrinAdminAppLike[];
  initializeApp(options: { projectId: string; storageBucket: string }): GrinAdminAppLike;
};

export type ResolvedGrinAdminBinding = {
  app: GrinAdminAppLike;
  projectId: string;
  storageBucket: string;
  initialized: boolean;
};

export type GrinAdminBindingPreflight =
  | {
      ok: true;
      projectId: string;
      storageBucket: string;
      appName: string;
      initialized: boolean;
    }
  | {
      ok: false;
      code: GrinAdminConfigCode;
    };

const PROJECT_ID_RE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const STORAGE_BUCKET_RE = /^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/;

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseFirebaseConfig(
  raw: unknown
): { projectId?: string; storageBucket?: string } | "absent" | "malformed" {
  if (raw == null) return "absent";
  if (typeof raw !== "string") return "malformed";
  const trimmed = raw.trim();
  if (trimmed === "") return "absent";
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "malformed";
    }
    const record = parsed as Record<string, unknown>;
    if ("projectId" in record && record.projectId != null && typeof record.projectId !== "string") {
      return "malformed";
    }
    if (
      "storageBucket" in record &&
      record.storageBucket != null &&
      typeof record.storageBucket !== "string"
    ) {
      return "malformed";
    }
    return {
      projectId: nonEmpty(record.projectId),
      storageBucket: nonEmpty(record.storageBucket),
    };
  } catch {
    return "malformed";
  }
}

function uniqueOrConflict(values: Array<string | undefined>): string | undefined {
  const present = values.filter((value): value is string => value != null);
  if (present.length === 0) return undefined;
  const first = present[0];
  if (present.some((value) => value !== first)) {
    throw new GrinAdminConfigError(GRIN_ADMIN_CONFIG_CODES.conflict);
  }
  return first;
}

function validateProjectId(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  if (!PROJECT_ID_RE.test(value)) {
    throw new GrinAdminConfigError(GRIN_ADMIN_CONFIG_CODES.malformed);
  }
  return value;
}

function validateStorageBucket(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  if (value.includes("/") || value.startsWith("gs:") || !STORAGE_BUCKET_RE.test(value)) {
    throw new GrinAdminConfigError(GRIN_ADMIN_CONFIG_CODES.malformed);
  }
  return value;
}

function isDefaultApp(app: GrinAdminAppLike): boolean {
  return app.name === GRIN_ADMIN_DEFAULT_APP_NAME;
}

function requestedFromEnv(env: NodeJS.ProcessEnv): {
  projectId?: string;
  storageBucket?: string;
} {
  const firebaseConfig = parseFirebaseConfig(env.FIREBASE_CONFIG);
  if (firebaseConfig === "malformed") {
    throw new GrinAdminConfigError(GRIN_ADMIN_CONFIG_CODES.malformed);
  }
  const fromFirebase = firebaseConfig === "absent" ? {} : firebaseConfig;
  const projectId = uniqueOrConflict([
    nonEmpty(env.GRIN_ADMIN_PROJECT),
    fromFirebase.projectId,
    nonEmpty(env.GCLOUD_PROJECT),
    nonEmpty(env.GCLOUD_PROJECT_ID),
  ]);
  const storageBucket = uniqueOrConflict([
    nonEmpty(env.GRIN_ADMIN_STORAGE_BUCKET),
    nonEmpty(env.FIREBASE_STORAGE_BUCKET),
    fromFirebase.storageBucket,
  ]);
  return {
    projectId: validateProjectId(projectId),
    storageBucket: validateStorageBucket(storageBucket),
  };
}

/**
 * Bind the default Admin app to a validated project and bucket.
 * Never guesses `.appspot.com`. Never falls back to the isolated demo project.
 */
export function resolveGrinAdminBinding(
  env: NodeJS.ProcessEnv,
  ports: GrinAdminAppPorts
): ResolvedGrinAdminBinding {
  const requested = requestedFromEnv(env);
  const apps = ports.getApps();
  const defaultApp = apps.find(isDefaultApp);
  if (apps.length > 0 && !defaultApp) {
    throw new GrinAdminConfigError(GRIN_ADMIN_CONFIG_CODES.no_default_app);
  }

  if (defaultApp) {
    const appProject = validateProjectId(nonEmpty(defaultApp.options.projectId));
    const appBucket = validateStorageBucket(nonEmpty(defaultApp.options.storageBucket));
    const projectId = uniqueOrConflict([requested.projectId, appProject]);
    const storageBucket = uniqueOrConflict([requested.storageBucket, appBucket]);
    if (!projectId || !storageBucket) {
      throw new GrinAdminConfigError(GRIN_ADMIN_CONFIG_CODES.missing);
    }
    return {
      app: defaultApp,
      projectId,
      storageBucket,
      initialized: false,
    };
  }

  if (!requested.projectId || !requested.storageBucket) {
    throw new GrinAdminConfigError(GRIN_ADMIN_CONFIG_CODES.missing);
  }
  const app = ports.initializeApp({
    projectId: requested.projectId,
    storageBucket: requested.storageBucket,
  });
  return {
    app,
    projectId: requested.projectId,
    storageBucket: requested.storageBucket,
    initialized: true,
  };
}

/** Secret-free selected project/bucket. Never includes FIREBASE_CONFIG or env. */
export function preflightGrinAdminBinding(
  env: NodeJS.ProcessEnv,
  ports: GrinAdminAppPorts
): GrinAdminBindingPreflight {
  try {
    const binding = resolveGrinAdminBinding(env, ports);
    return {
      ok: true,
      projectId: binding.projectId,
      storageBucket: binding.storageBucket,
      appName: binding.app.name,
      initialized: binding.initialized,
    };
  } catch (err) {
    if (err instanceof GrinAdminConfigError) {
      return { ok: false, code: err.code };
    }
    throw err;
  }
}
