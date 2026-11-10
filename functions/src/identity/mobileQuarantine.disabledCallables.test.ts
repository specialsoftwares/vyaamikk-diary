/**
 * Production exported callable regression. These unsupported public capabilities
 * must deny before any Admin operation. No emulator, phone request or live data
 * is used: every Admin entry touched by the old handlers is a fail-fast tripwire.
 * Internal resolver/deletion quarantine policy remains covered separately.
 */
import assert from "node:assert/strict";
import { deleteApp, getApps } from "firebase-admin/app";
import { getAdminAuth, getAdminDb } from "../admin";
import { checkMobileQuarantine, rebindQuarantinedMobileCallable } from "./mobileQuarantine";

async function main() {
  const auth = getAdminAuth();
  const db = getAdminDb();
  const originalCollection = db.collection;
  const originalTransaction = db.runTransaction;
  const originalVerify = auth.verifyIdToken;
  const originalGetUser = auth.getUser;
  let adminCalls = 0;
  const deniedAdmin = () => { adminCalls++; throw new Error("unexpected_admin_operation"); };
  db.collection = deniedAdmin;
  db.runTransaction = async () => deniedAdmin();
  auth.verifyIdToken = async () => deniedAdmin();
  auth.getUser = async () => deniedAdmin();
  let failed = 0;
  try {
    for (const [name, callable] of [
      ["lookup", checkMobileQuarantine], ["rebind", rebindQuarantinedMobileCallable],
    ] as const) {
      for (const identity of ["anonymous", "owner", "support"] as const) {
        const before = adminCalls;
        try {
          const request = {
            ...(identity === "anonymous" ? {} : {
              auth: { uid: "synthetic-owner", token: { support: identity === "support" } },
            }),
            rawRequest: { headers: { authorization: "Bearer synthetic-not-a-credential" } },
            data: {
              phoneE164: "+16505550100", mobileHash: "a".repeat(64),
              oldPhoneE164: "+16505550100", newerPhoneE164: "+16505550101",
              originalUid: "synthetic-owner",
            },
          };
          await assert.rejects(() => callable.run(request as never), (error: unknown) => {
            const failure = error as { code?: string; message?: string; details?: { code?: string } };
            if (identity === "anonymous") return failure.code === "unauthenticated";
            return failure.code === "failed-precondition" &&
              failure.details?.code === "MOBILE_QUARANTINE_SUPPORT_REQUIRED" &&
              failure.message === "This phone-number change requires support. Your account has not been changed.";
          });
          assert.equal(adminCalls, before, "disabled callable must not authenticate through Admin, inspect or mutate account data");
          console.log(`mobile quarantine disabled ${name}/${identity}: ok`);
        } catch (error) {
          failed++;
          console.error(`mobile quarantine disabled ${name}/${identity}: FAILED`, error);
        }
      }
    }
    assert.equal(failed, 0, "all unsupported public quarantine calls must deny without Admin access");
    console.log("mobileQuarantine.disabledCallables.test.ts: ok");
  } finally {
    db.collection = originalCollection;
    db.runTransaction = originalTransaction;
    auth.verifyIdToken = originalVerify;
    auth.getUser = originalGetUser;
    await Promise.all(getApps().map((app) => deleteApp(app)));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
