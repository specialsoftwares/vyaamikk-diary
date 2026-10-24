/**
 * Offline injected-Admin tests for the Play review verifier.
 * Does not call live Firebase or print credentials.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REVIEW_PHONE,
  parseUidArg,
  runReviewAccountCli,
  verifyReviewAccount,
  type ReviewVerifyPort,
} from "./setup-play-review-account";

const PROJECT = "vyaamikk-diary-test";
const REVIEW_UID = "SYNTHETIC_REVIEW_UID";
const OTHER_UID = "SYNTHETIC_OTHER_UID";
const NAME = "SYNTHETIC_REVIEWER_NAME";
const BUSINESS = "SYNTHETIC_BUSINESS_Q7";
const UEID = "VYD-2026-SYNTH";

function blob(lines: string[]): string {
  return lines.join("\n");
}

function assertNoSecrets(text: string): void {
  assert.doesNotMatch(text, /SYNTHETIC_REVIEWER_NAME/);
  assert.doesNotMatch(text, /SYNTHETIC_BUSINESS_Q7/);
  assert.doesNotMatch(text, /VYD-2026-SYNTH/);
  assert.doesNotMatch(text, /SYNTHETIC_REVIEW_UID/);
  assert.doesNotMatch(text, /SYNTHETIC_OTHER_UID/);
  assert.doesNotMatch(text, /\/secrets\//);
  assert.doesNotMatch(text, /GOOGLE_APPLICATION_CREDENTIALS=/);
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    name: NAME,
    businessName: BUSINESS,
    phoneE164: REVIEW_PHONE,
    ueid: UEID,
    status: "active",
    ...overrides,
  };
}

function port(init: {
  projectId?: string;
  authByPhone?: { uid: string; disabled: boolean; phoneNumber?: string } | Error;
  authByUid?: Record<string, { uid: string; disabled: boolean; phoneNumber?: string } | Error>;
  docs?: Record<string, { exists: boolean; data?: Record<string, unknown> } | Error>;
}): ReviewVerifyPort & { mutations: string[] } {
  const mutations: string[] = [];
  const p: ReviewVerifyPort & { mutations: string[] } = {
    projectId: init.projectId ?? PROJECT,
    mutations,
    async getUserByPhoneNumber() {
      const row = init.authByPhone;
      if (row instanceof Error) throw row;
      if (!row) {
        const err = new Error("missing");
        (err as { code?: string }).code = "auth/user-not-found";
        throw err;
      }
      return row;
    },
    async getUser(uid: string) {
      const row = init.authByUid?.[uid];
      if (row instanceof Error) throw row;
      if (!row) {
        const err = new Error("missing");
        (err as { code?: string }).code = "auth/user-not-found";
        throw err;
      }
      return row;
    },
    async getUserDoc(uid: string) {
      const row = init.docs?.[uid];
      if (row instanceof Error) throw row;
      if (!row) return { exists: false, data: undefined };
      return { exists: row.exists, data: row.data };
    },
  };
  assert.equal("createUser" in p, false);
  assert.equal("updateUser" in p, false);
  assert.equal("set" in p, false);
  return p;
}

async function main() {

{
  const parsed = parseUidArg(["--uid", OTHER_UID]);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.uid, OTHER_UID);
}

{
  const injected = port({
    authByPhone: { uid: REVIEW_UID, disabled: false, phoneNumber: REVIEW_PHONE },
    docs: { [REVIEW_UID]: { exists: true, data: profile() } },
  });
  const out = await verifyReviewAccount({
    port: injected,
    expectedProjectId: PROJECT,
  });
  assert.equal(out.ok, true);
  assert.equal(out.result, "partial_profile_ok");
  assert.match(blob(out.lines), /check:project PASS/);
  assert.match(blob(out.lines), /check:auth PASS/);
  assert.match(blob(out.lines), /check:profile:name PASS/);
  assert.match(blob(out.lines), /note:not_dashboard_proof/);
  assert.doesNotMatch(blob(out.lines), /full-access|fully configured|dashboard proof/i);
  assertNoSecrets(blob(out.lines));
  assert.equal(injected.mutations.length, 0);
}

{
  const out = await verifyReviewAccount({
    port: port({
      projectId: "other-project",
      authByPhone: { uid: REVIEW_UID, disabled: false, phoneNumber: REVIEW_PHONE },
      docs: { [REVIEW_UID]: { exists: true, data: profile() } },
    }),
    expectedProjectId: PROJECT,
  });
  assert.equal(out.ok, false);
  assert.equal(out.result, "project_mismatch");
  assertNoSecrets(blob(out.lines));
}

{
  const out = await verifyReviewAccount({
    port: port({
      authByPhone: { uid: REVIEW_UID, disabled: false, phoneNumber: REVIEW_PHONE },
      authByUid: {
        [OTHER_UID]: {
          uid: OTHER_UID,
          disabled: false,
          phoneNumber: "+919999999999",
        },
      },
      docs: {
        [OTHER_UID]: {
          exists: true,
          data: profile({ phoneE164: "+919999999999" }),
        },
      },
    }),
    expectedProjectId: PROJECT,
    uidArg: OTHER_UID,
  });
  assert.equal(out.ok, false);
  assert.equal(out.result, "identity_mismatch");
  assertNoSecrets(blob(out.lines));
}

{
  const out = await verifyReviewAccount({
    port: port({
      authByPhone: { uid: REVIEW_UID, disabled: true, phoneNumber: REVIEW_PHONE },
    }),
    expectedProjectId: PROJECT,
  });
  assert.equal(out.result, "account_disabled");
}

{
  const out = await verifyReviewAccount({
    port: port({}),
    expectedProjectId: PROJECT,
  });
  assert.equal(out.result, "auth_user_missing");
}

{
  const err = new Error("SYNTHETIC_SDK_STACK boom");
  (err as { code?: string }).code = "app/network-error";
  const out = await verifyReviewAccount({
    port: port({ authByPhone: err }),
    expectedProjectId: PROJECT,
  });
  assert.equal(out.result, "sdk_unavailable");
  assert.doesNotMatch(blob(out.lines), /SYNTHETIC_SDK_STACK/);
}

{
  const out = await verifyReviewAccount({
    port: port({
      authByPhone: { uid: REVIEW_UID, disabled: false, phoneNumber: REVIEW_PHONE },
      docs: { [REVIEW_UID]: { exists: true, data: profile({ ueid: "" }) } },
    }),
    expectedProjectId: PROJECT,
  });
  assert.equal(out.ok, false);
  assert.equal(out.result, "profile_incomplete");
  assert.match(blob(out.lines), /note:partial_check_only/);
  assert.doesNotMatch(blob(out.lines), /full access|dashboard/i);
  assertNoSecrets(blob(out.lines));
}

{
  const lines: string[] = [];
  const code = await runReviewAccountCli({
    env: {},
    argv: [],
    log: (l) => lines.push(l),
    logError: (l) => lines.push(l),
  });
  assert.equal(code, 1);
  assert.match(lines.join("\n"), /result:credentials_missing/);
}

{
  const out = await verifyReviewAccount({
    port: port({
      authByPhone: { uid: REVIEW_UID, disabled: false, phoneNumber: REVIEW_PHONE },
      docs: { [REVIEW_UID]: { exists: false } },
    }),
    expectedProjectId: PROJECT,
  });
  assert.equal(out.result, "profile_incomplete");
  assertNoSecrets(blob(out.lines));
}

{
  const out = await verifyReviewAccount({
    port: port({
      authByPhone: { uid: REVIEW_UID, disabled: false, phoneNumber: REVIEW_PHONE },
      docs: {
        [REVIEW_UID]: {
          exists: true,
          data: profile({ phoneE164: "+919999999999" }),
        },
      },
    }),
    expectedProjectId: PROJECT,
  });
  assert.equal(out.result, "identity_mismatch");
  assertNoSecrets(blob(out.lines));
}

{
  const lines: string[] = [];
  const code = await runReviewAccountCli({
    env: {
      GOOGLE_APPLICATION_CREDENTIALS: "/secrets/never-print.json",
    },
    argv: [],
    log: (l) => lines.push(l),
    logError: (l) => lines.push(l),
  });
  assert.equal(code, 1);
  assert.match(lines.join("\n"), /result:config_missing/);
  assert.doesNotMatch(lines.join("\n"), /never-print/);
}

{
  const injected = port({
    authByPhone: { uid: REVIEW_UID, disabled: false, phoneNumber: REVIEW_PHONE },
    authByUid: {
      [OTHER_UID]: {
        uid: OTHER_UID,
        disabled: false,
        phoneNumber: "+919999999999",
      },
    },
    docs: { [REVIEW_UID]: { exists: true, data: profile() } },
  });
  const invoked: string[] = [];
  const admin = {
    initializeApp() {
      invoked.push("initializeApp");
      return { options: { projectId: PROJECT } };
    },
    app() {
      invoked.push("app");
      return { options: { projectId: PROJECT } };
    },
    credential: {
      applicationDefault() {
        invoked.push("applicationDefault");
        return {};
      },
    },
    auth() {
      invoked.push("auth");
      return {
        getUserByPhoneNumber: (phone: string) => {
          invoked.push("getUserByPhoneNumber");
          return injected.getUserByPhoneNumber(phone);
        },
        getUser: (uid: string) => {
          invoked.push("getUser");
          return injected.getUser(uid);
        },
      };
    },
    firestore() {
      invoked.push("firestore");
      return {
        collection(name: string) {
          invoked.push(`collection:${name}`);
          return {
            doc(id: string) {
              invoked.push("doc");
              return {
                async get() {
                  invoked.push("get");
                  const snap = await injected.getUserDoc(id);
                  return { exists: snap.exists, data: () => snap.data };
                },
              };
            },
          };
        },
      };
    },
  };
  const lines: string[] = [];
  const code = await runReviewAccountCli({
    env: {
      GOOGLE_APPLICATION_CREDENTIALS: "/secrets/never-print.json",
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: PROJECT,
    },
    argv: ["--uid", OTHER_UID],
    loadAdmin: () => ({ admin, getApps: () => [] }),
    log: (l) => lines.push(l),
    logError: (l) => lines.push(l),
  });
  assert.equal(code, 1);
  assert.match(lines.join("\n"), /result:identity_mismatch/);
  assert.equal(invoked.includes("createUser"), false);
  assert.equal(invoked.includes("updateUser"), false);
  assert.doesNotMatch(invoked.join(","), /setCustomUserClaims/);
  assert.doesNotMatch(lines.join("\n"), /never-print|SYNTHETIC_/);
  assertNoSecrets(lines.join("\n"));
}

{
  const docs = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../docs/PLAY_REVIEW_SETUP.md"),
    "utf8"
  );
  assert.doesNotMatch(docs, /reviewer@specialsoftwares\.com/);
  assert.doesNotMatch(docs, /cannot belong to a real subscriber/i);
  assert.match(docs, /does not terminate already-issued sessions/i);
  assert.doesNotMatch(docs, /Removing the test number from Firebase Console revokes that sign-in path/);
  assert.match(docs, /Leave blank\. This app does not use passwords/);
  assert.match(docs, /Do \*\*not\*\* create a dedicated reviewer email inbox/);
}

console.log("setup-play-review-account.contract.test.ts: ok (INJECTED_ADMIN_OFFLINE)");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
