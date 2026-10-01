/**
 * Read-only Play review account preflight.
 * Does not create or mutate Auth/Firestore users. Does not send OTPs.
 *
 * Usage (live, owner-authorized — not this assignment):
 *   npm run review:verify-account
 *   npm run review:verify-account -- --uid <firebase-uid>
 *
 * Partial check only: Auth identity for the configured test phone plus
 * users/{uid} name, businessName, phoneE164, ueid, status=active.
 * Passing is not proof the reviewer can reach the dashboard.
 */

export const REVIEW_PHONE = "+919000000000";

export type ReviewAuthUser = {
  uid: string;
  disabled: boolean;
  phoneNumber?: string;
};

export type ReviewUserDoc = {
  exists: boolean;
  data: Record<string, unknown> | undefined;
};

/** Read-only Admin port. Tests must not expose create/update methods. */
export type ReviewVerifyPort = {
  projectId: string;
  getUserByPhoneNumber(phone: string): Promise<ReviewAuthUser>;
  getUser(uid: string): Promise<ReviewAuthUser>;
  getUserDoc(uid: string): Promise<ReviewUserDoc>;
};

export type ReviewVerifyOutcome = {
  ok: boolean;
  exitCode: number;
  result: string;
  lines: string[];
};

const CHECKS = ["name", "businessName", "phoneE164", "ueid", "status"] as const;

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function emit(lines: string[], line: string): void {
  lines.push(line);
}

export function parseUidArg(argv: string[]):
  | { ok: true; uid?: string }
  | { ok: false; result: "usage" } {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--uid") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) return { ok: false, result: "usage" };
      return { ok: true, uid: value };
    }
    if (arg.startsWith("--uid=")) {
      const value = arg.slice("--uid=".length).trim();
      if (!value) return { ok: false, result: "usage" };
      return { ok: true, uid: value };
    }
  }
  return { ok: true };
}

export async function verifyReviewAccount(args: {
  port: ReviewVerifyPort;
  expectedProjectId: string;
  uidArg?: string;
}): Promise<ReviewVerifyOutcome> {
  const lines: string[] = [];
  const expected = args.expectedProjectId.trim();
  if (!expected) {
    emit(lines, "check:project FAIL");
    emit(lines, "result:config_missing");
    return { ok: false, exitCode: 1, result: "config_missing", lines };
  }
  if (args.port.projectId.trim() !== expected) {
    emit(lines, "check:project FAIL");
    emit(lines, "result:project_mismatch");
    return { ok: false, exitCode: 1, result: "project_mismatch", lines };
  }
  emit(lines, "check:project PASS");

  let phoneUser: ReviewAuthUser;
  try {
    phoneUser = await args.port.getUserByPhoneNumber(REVIEW_PHONE);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    if (code === "auth/user-not-found") {
      emit(lines, "check:auth FAIL");
      emit(lines, "result:auth_user_missing");
      return { ok: false, exitCode: 1, result: "auth_user_missing", lines };
    }
    emit(lines, "check:auth FAIL");
    emit(lines, "result:sdk_unavailable");
    return { ok: false, exitCode: 1, result: "sdk_unavailable", lines };
  }

  if (phoneUser.disabled) {
    emit(lines, "check:auth FAIL");
    emit(lines, "result:account_disabled");
    return { ok: false, exitCode: 1, result: "account_disabled", lines };
  }
  if (phoneUser.phoneNumber !== REVIEW_PHONE) {
    emit(lines, "check:auth FAIL");
    emit(lines, "result:identity_mismatch");
    return { ok: false, exitCode: 1, result: "identity_mismatch", lines };
  }
  emit(lines, "check:auth PASS");

  let uid = phoneUser.uid;
  if (args.uidArg) {
    let byUid: ReviewAuthUser;
    try {
      byUid = await args.port.getUser(args.uidArg);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : "";
      if (code === "auth/user-not-found") {
        emit(lines, "check:uid FAIL");
        emit(lines, "result:auth_user_missing");
        return { ok: false, exitCode: 1, result: "auth_user_missing", lines };
      }
      emit(lines, "check:uid FAIL");
      emit(lines, "result:sdk_unavailable");
      return { ok: false, exitCode: 1, result: "sdk_unavailable", lines };
    }
    if (byUid.uid !== phoneUser.uid || byUid.phoneNumber !== REVIEW_PHONE) {
      emit(lines, "check:uid FAIL");
      emit(lines, "result:identity_mismatch");
      return { ok: false, exitCode: 1, result: "identity_mismatch", lines };
    }
    if (byUid.disabled) {
      emit(lines, "check:uid FAIL");
      emit(lines, "result:account_disabled");
      return { ok: false, exitCode: 1, result: "account_disabled", lines };
    }
    uid = byUid.uid;
    emit(lines, "check:uid PASS");
  }

  let doc: ReviewUserDoc;
  try {
    doc = await args.port.getUserDoc(uid);
  } catch {
    emit(lines, "check:profile FAIL");
    emit(lines, "result:sdk_unavailable");
    return { ok: false, exitCode: 1, result: "sdk_unavailable", lines };
  }
  if (!doc.exists || !doc.data) {
    emit(lines, "check:profile FAIL");
    emit(lines, "result:profile_incomplete");
    return { ok: false, exitCode: 1, result: "profile_incomplete", lines };
  }

  const data = doc.data;
  if (data.phoneE164 !== REVIEW_PHONE) {
    emit(lines, "check:profile:phoneE164 FAIL");
    emit(lines, "result:identity_mismatch");
    return { ok: false, exitCode: 1, result: "identity_mismatch", lines };
  }

  let incomplete = false;
  for (const key of CHECKS) {
    const pass =
      key === "status" ? data.status === "active" : nonEmpty(data[key]);
    emit(lines, `check:profile:${key} ${pass ? "PASS" : "FAIL"}`);
    if (!pass) incomplete = true;
  }
  if (incomplete) {
    emit(lines, "result:profile_incomplete");
    emit(lines, "note:partial_check_only");
    return { ok: false, exitCode: 1, result: "profile_incomplete", lines };
  }

  emit(lines, "result:partial_profile_ok");
  emit(lines, "note:partial_check_only");
  emit(lines, "note:not_dashboard_proof");
  emit(lines, "note:device_onboarding_and_fresh_sign_in_still_required");
  return { ok: true, exitCode: 0, result: "partial_profile_ok", lines };
}

type AdminAuthUser = ReviewAuthUser;

type FirebaseAdminLike = {
  initializeApp: (options?: { credential?: unknown; projectId?: string }) => unknown;
  app: () => { options: { projectId?: string } };
  credential: { applicationDefault: () => unknown };
  auth: (app?: unknown) => {
    getUserByPhoneNumber(phone: string): Promise<AdminAuthUser>;
    getUser(uid: string): Promise<AdminAuthUser>;
  };
  firestore: (app?: unknown) => {
    collection(name: string): {
      doc(id: string): { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }> };
    };
  };
};

type FirebaseAdminAppLike = {
  getApps: () => unknown[];
};

export function createReviewVerifyPortFromAdmin(
  admin: FirebaseAdminLike,
  app: { options: { projectId?: string } }
): ReviewVerifyPort {
  const auth = admin.auth(app);
  const db = admin.firestore(app);
  return {
    projectId: app.options.projectId ?? "",
    getUserByPhoneNumber: (phone) => auth.getUserByPhoneNumber(phone),
    getUser: (uid) => auth.getUser(uid),
    async getUserDoc(uid) {
      const snap = await db.collection("users").doc(uid).get();
      return { exists: snap.exists, data: snap.data() };
    },
  };
}

export async function runReviewAccountCli(args: {
  env: Record<string, string | undefined>;
  argv: string[];
  loadAdmin?: () => { admin: FirebaseAdminLike; getApps: () => unknown[] };
  log?: (line: string) => void;
  logError?: (line: string) => void;
}): Promise<number> {
  const log = args.log ?? ((line) => console.log(line));
  const logError = args.logError ?? ((line) => console.error(line));
  const parsed = parseUidArg(args.argv);
  if (!parsed.ok) {
    logError("result:usage");
    return 1;
  }
  if (!args.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    logError("result:credentials_missing");
    return 1;
  }
  const expectedProjectId = args.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? "";
  if (!expectedProjectId) {
    logError("check:project FAIL");
    logError("result:config_missing");
    return 1;
  }

  let port: ReviewVerifyPort;
  try {
    const loaded = args.loadAdmin?.();
    if (!loaded) {
      logError("result:sdk_unavailable");
      return 1;
    }
    const { admin, getApps } = loaded;
    const app =
      getApps().length > 0
        ? admin.app()
        : (admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            projectId: expectedProjectId,
          }) as { options: { projectId?: string } });
    const resolved = admin.app();
    port = createReviewVerifyPortFromAdmin(admin, resolved ?? app);
  } catch {
    logError("result:sdk_unavailable");
    return 1;
  }

  const outcome = await verifyReviewAccount({
    port,
    expectedProjectId,
    uidArg: parsed.uid,
  });
  for (const line of outcome.lines) {
    if (outcome.ok) log(line);
    else logError(line);
  }
  return outcome.exitCode;
}

async function main(): Promise<void> {
  const { createRequire } = await import("node:module");
  const path = await import("node:path");
  const requireFromFunctions = createRequire(path.resolve("functions/package.json"));
  const code = await runReviewAccountCli({
    env: process.env,
    argv: process.argv.slice(2),
    loadAdmin: () => ({
      admin: requireFromFunctions("firebase-admin") as FirebaseAdminLike,
      getApps: (
        requireFromFunctions("firebase-admin/app") as FirebaseAdminAppLike
      ).getApps,
    }),
  });
  process.exit(code);
}

const launchedDirectly = /setup-play-review-account\.(ts|js)$/.test(process.argv[1] ?? "");
if (launchedDirectly) {
  void main().catch(() => {
    console.error("result:sdk_unavailable");
    process.exit(1);
  });
}
